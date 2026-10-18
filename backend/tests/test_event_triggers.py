"""Phase 5: multiple schedules per workflow + inbound event webhooks."""

import hashlib
import hmac
import json
import secrets
import time
from uuid import UUID, uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import models
from app.db.database import Base, SessionLocal, get_db
from app.main import app
from app.services.schedule_sync import sync_workflow_schedule
from app.services.schedule_worker import (
    _create_scheduled_run_row,
    _scan_scheduled_workflows,
    _trigger_schedules,
)
from tests.conftest import valid_graph


# ---------- multi-schedule ----------


def _graph_with_crons(crons: list[str]) -> dict:
    graph = valid_graph(
        [{
            "id": "t", "position": {"x": 0, "y": 0},
            "data": {"nodeType": "transform", "label": "Echo", "transformTemplate": "{{input.text}}"},
        }],
        trigger_type="schedule",
    )
    trigger = next(n for n in graph["nodes"] if n["data"].get("nodeType") == "trigger")
    trigger["data"]["scheduleCrons"] = list(crons)
    return graph


def _workflow_with_graph(db, graph):
    workflow = models.Workflow(id=uuid4(), user_id=uuid4(), name="Event triggers")
    db.add(workflow)
    db.flush()
    version = models.WorkflowVersion(
        id=uuid4(), workflow_id=workflow.id, version_number=1, graph_json=graph
    )
    db.add(version)
    db.flush()
    return workflow, version


def test_trigger_schedules_reads_list_and_legacy_single():
    multi = _graph_with_crons(["0 9 * * *", "*/15 * * * *"])
    assert _trigger_schedules(multi) == [("trigger", "0 9 * * *"), ("trigger", "*/15 * * * *")]

    legacy = _graph_with_crons(["0 9 * * *"])
    trigger = next(n for n in legacy["nodes"] if n["data"].get("nodeType") == "trigger")
    del trigger["data"]["scheduleCrons"]
    trigger["data"]["scheduleCron"] = "0 9 * * *"
    assert _trigger_schedules(legacy) == [("trigger", "0 9 * * *")]

    manual = _graph_with_crons([])
    manual_trigger = next(n for n in manual["nodes"] if n["data"].get("nodeType") == "trigger")
    manual_trigger["data"]["triggerType"] = "manual"
    manual_trigger["data"].pop("scheduleCrons", None)
    assert _trigger_schedules(manual) == []


def test_schedule_sync_creates_updates_and_prunes_rows():
    db = SessionLocal()
    try:
        workflow, version = _workflow_with_graph(db, _graph_with_crons(["0 9 * * *"]))
        sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=version.graph_json)
        db.commit()
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=workflow.id).all()
        assert [r.cron_expr for r in rows] == ["0 9 * * *"]
        first_id = rows[0].id

        # Add a second cron — the first row is kept (keyed by cron), one added.
        version.graph_json = _graph_with_crons(["0 9 * * *", "*/30 * * * *"])
        sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=version.graph_json)
        db.commit()
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=workflow.id).order_by(models.WorkflowSchedule.cron_expr).all()
        assert sorted(r.cron_expr for r in rows) == ["*/30 * * * *", "0 9 * * *"]
        assert first_id in {r.id for r in rows}

        # Replace both — old rows pruned, one new row remains.
        version.graph_json = _graph_with_crons(["0 12 * * 1-5"])
        sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=version.graph_json)
        db.commit()
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=workflow.id).all()
        assert [r.cron_expr for r in rows] == ["0 12 * * 1-5"]
        assert first_id not in {r.id for r in rows}

        # Removing the schedule entirely deletes all rows.
        version.graph_json = valid_graph(
            [{"id": "t", "position": {"x": 0, "y": 0},
              "data": {"nodeType": "transform", "label": "Echo", "transformTemplate": "{{input.text}}"}}],
            trigger_type="manual",
        )
        sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=version.graph_json)
        db.commit()
        assert db.query(models.WorkflowSchedule).filter_by(workflow_id=workflow.id).count() == 0
    finally:
        db.rollback()
        db.close()


def test_two_schedules_on_one_workflow_both_fire(monkeypatch):
    db = SessionLocal()
    try:
        workflow, version = _workflow_with_graph(
            db, _graph_with_crons(["* * * * *", "*/1 * * * *"])
        )
        sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=version.graph_json)
        db.commit()
        schedules = db.query(models.WorkflowSchedule).filter_by(workflow_id=workflow.id).all()
        assert len(schedules) == 2

        monkeypatch.setattr(settings, "run_execution_mode", "worker")
        monkeypatch.setattr(settings, "max_concurrent_runs", 1000)

        due = _scan_scheduled_workflows()
        claimed = [d for d in due if d["workflow_id"] == workflow.id]
        assert len(claimed) == 2, "each schedule row claims independently per minute"

        run_ids = [_create_scheduled_run_row(d["workflow_id"], d["version_id"]) for d in claimed]
        # Worker mode: rows stay pending for the run worker; both were created.
        assert run_ids == [None, None]
        runs = (
            db.query(models.WorkflowRun)
            .join(models.WorkflowVersion)
            .filter(models.WorkflowVersion.workflow_id == workflow.id)
            .all()
        )
        assert len(runs) == 2
        assert all(json.loads(r.input_text)["scheduled"] is True for r in runs)

        # Same minute: claims are already consumed — nothing fires twice.
        due_again = _scan_scheduled_workflows()
        assert all(d["workflow_id"] != workflow.id for d in due_again)
    finally:
        db.rollback()
        db.close()


# ---------- inbound event webhooks ----------


@pytest.fixture
def webhook_client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    def database():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(settings, "auth_enabled", False)
    monkeypatch.setattr(settings, "run_execution_mode", "worker")
    monkeypatch.setattr(settings, "max_concurrent_runs", 1000)
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    try:
        client = TestClient(app, raise_server_exceptions=True)
        try:
            yield client, sessions
        finally:
            client.close()
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous
        engine.dispose()


def _published_workflow(client):
    response = client.post("/api/workflows", json={
        "name": "Webhook target",
        "graph_json": valid_graph([{
            "id": "t", "position": {"x": 0, "y": 0},
            "data": {"nodeType": "transform", "label": "Echo", "transformTemplate": "{{input.text}}"},
        }]),
    })
    assert response.status_code == 200, response.text
    body = response.json()
    response = client.post(
        f"/api/workflows/{body['id']}/publish",
        json={"version_id": body["latest_version"]["id"]},
    )
    assert response.status_code == 200, response.text
    return body


def _issue(client, wf, kind):
    response = client.post(f"/api/workflows/{wf['id']}/deploy/credentials/{kind}")
    assert response.status_code == 200, response.text
    return response.json()


def _event_signed_headers(credential, path, body, timestamp=None, nonce=None):
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    nonce = nonce or secrets.token_urlsafe(24)
    message = (
        f"POST\n{path}\n{credential['deployment_id']}\n{timestamp}\n{nonce}\n".encode()
        + body
    )
    signature = hmac.new(credential["secret"].encode(), message, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Aegis-Timestamp": timestamp,
        "X-Aegis-Nonce": nonce,
        "X-Aegis-Signature": "sha256=" + signature,
    }


def _run_input(sessions, run_id):
    db = sessions()
    try:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == UUID(str(run_id))).first()
        return json.loads(run.input_text)
    finally:
        db.close()


def test_signed_event_webhook_starts_run_with_body_as_input(webhook_client):
    client, sessions = webhook_client
    wf = _published_workflow(client)
    credential = _issue(client, wf, "webhook_secret")

    path = f"/v1/webhooks/{wf['id']}"
    body = b'{"order_id": 42, "status": "paid"}'
    response = client.post(path, content=body, headers=_event_signed_headers(credential, path, body))
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]

    run_input = _run_input(sessions, run_id)
    assert run_input["trigger"] == "webhook"
    assert run_input["event"] == {"order_id": 42, "status": "paid"}
    assert run_input["body"] == body.decode()


def test_event_token_starts_run(webhook_client):
    client, sessions = webhook_client
    wf = _published_workflow(client)
    credential = _issue(client, wf, "invoke_key")

    response = client.post(
        f"/v1/webhooks/{wf['id']}",
        content=b"plain text body",
        headers={"X-Aegis-Event-Token": credential["secret"]},
    )
    assert response.status_code == 202, response.text
    run_input = _run_input(sessions, response.json()["run_id"])
    assert run_input["event"] is None
    assert run_input["body"] == "plain text body"


def test_event_webhook_rejects_unsigned_wrong_secret_and_replay(webhook_client):
    client, _sessions = webhook_client
    wf = _published_workflow(client)
    credential = _issue(client, wf, "webhook_secret")
    path = f"/v1/webhooks/{wf['id']}"
    body = b'{"a": 1}'

    # Unsigned → 401.
    assert client.post(path, content=body).status_code == 401

    # Signed with the wrong secret → 401.
    wrong = dict(credential, secret="aegis_wrongsecret")
    assert client.post(path, content=body, headers=_event_signed_headers(wrong, path, body)).status_code == 401

    # Wrong event token → 401.
    assert client.post(path, content=body, headers={"X-Aegis-Event-Token": "bogus"}).status_code == 401

    # Unpublished workflow → 403, unknown workflow → 404.
    draft = client.post("/api/workflows", json={
        "name": "Draft", "graph_json": valid_graph([{
            "id": "t", "position": {"x": 0, "y": 0},
            "data": {"nodeType": "transform", "label": "Echo", "transformTemplate": "{{input.text}}"},
        }], trigger_type="manual")
    }).json()
    assert client.post(f"/v1/webhooks/{draft['id']}", content=body).status_code == 403
    assert client.post(f"/v1/webhooks/{uuid4()}", content=body).status_code == 404

    # Replay of the same nonce → 409.
    headers = _event_signed_headers(credential, path, body)
    assert client.post(path, content=body, headers=headers).status_code == 202
    assert client.post(path, content=body, headers=headers).status_code == 409


def _slack_headers(secret: str, body: bytes, timestamp: str | None = None):
    import hashlib as _hashlib
    import hmac as _hmac
    import time as _time

    ts = timestamp or str(int(_time.time()))
    sig = "v0=" + _hmac.new(secret.encode(), f"v0:{ts}:".encode() + body, _hashlib.sha256).hexdigest()
    return {"X-Slack-Signature": sig, "X-Slack-Request-Timestamp": ts}


def _slack_credential(client, secret: str = "test-slack-signing-secret"):
    resp = client.post(
        "/api/credentials",
        json={"name": "slack-events", "type": "slack",
              "config": {"webhook_url": "https://hooks.slack.com/x", "signing_secret": secret}},
    )
    assert resp.status_code == 200, resp.text
    return secret


def test_slack_url_verification_and_event_mapping(webhook_client):
    client, sessions = webhook_client
    wf = _published_workflow(client)
    credential = _issue(client, wf, "invoke_key")
    secret = _slack_credential(client)
    path = f"/v1/webhooks/{wf['id']}"

    # Handshake: Slack-signed, echoes the challenge. Unsigned → 401.
    handshake = b'{"type": "url_verification", "challenge": "tok-123"}'
    assert client.post(path, content=handshake).status_code == 401
    response = client.post(path, content=handshake, headers=_slack_headers(secret, handshake))
    assert response.status_code == 200, response.text
    assert response.json() == {"challenge": "tok-123"}
    assert "run_id" not in response.json()

    # Event callback via ?source=slack lifts mention fields into input.slack.
    # Genuine Slack delivery: Slack signature only, no Aegis credential.
    import json as _json

    payload = {
        "type": "event_callback",
        "event_id": "Ev123",
        "event": {"type": "app_mention", "text": "<@U0> hello", "user": "U9", "channel": "C7", "ts": "1.2"},
    }
    body = _json.dumps(payload).encode()
    response = client.post(
        f"{path}?source=slack",
        content=body,
        headers=_slack_headers(secret, body),
    )
    assert response.status_code == 202, response.text
    run_input = _run_input(sessions, response.json()["run_id"])
    assert run_input["source"] == "slack"
    assert run_input["slack"]["text"] == "<@U0> hello"
    assert run_input["event"]["type"] == "event_callback"


def test_schedules_follow_publish_not_drafts(webhook_client):
    """Schedule rows pin the published version: publish re-syncs from the
    published graph, and later draft saves leave the live rows alone."""
    client, sessions = webhook_client

    # Create with a cron, then publish v1.
    resp = client.post("/api/workflows", json={
        "name": "Sched",
        "graph_json": _graph_with_crons(["0 9 * * *"]),
    })
    assert resp.status_code == 200, resp.text
    wf = resp.json()
    v1_id = wf["latest_version"]["id"]
    resp = client.post(f"/api/workflows/{wf['id']}/publish", json={"version_id": v1_id})
    assert resp.status_code == 200, resp.text

    db = sessions()
    try:
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=UUID(wf["id"])).all()
        assert [r.cron_expr for r in rows] == ["0 9 * * *"]
        assert str(rows[0].workflow_version_id) == v1_id
    finally:
        db.close()

    # Save a draft v2 with a different cron — live rows must stay on v1.
    resp = client.post(f"/api/workflows/{wf['id']}/versions", json={
        "graph_json": _graph_with_crons(["0 10 * * *"]),
        "save_as_new_version": True,
    })
    assert resp.status_code == 200, resp.text
    v2_id = resp.json()["id"]

    db = sessions()
    try:
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=UUID(wf["id"])).all()
        assert [r.cron_expr for r in rows] == ["0 9 * * *"]
        assert str(rows[0].workflow_version_id) == v1_id
    finally:
        db.close()

    # Publish v2 — rows re-pin to v2's graph.
    resp = client.post(f"/api/workflows/{wf['id']}/publish", json={"version_id": v2_id})
    assert resp.status_code == 200, resp.text

    db = sessions()
    try:
        rows = db.query(models.WorkflowSchedule).filter_by(workflow_id=UUID(wf["id"])).all()
        assert [r.cron_expr for r in rows] == ["0 10 * * *"]
        assert str(rows[0].workflow_version_id) == v2_id
    finally:
        db.close()


def test_schedule_claim_single_winner_per_minute(webhook_client):
    """Two concurrent claimants for the same schedule minute: exactly one
    wins (regression for the R2-15 SQLite/FOR UPDATE no-op race)."""
    import threading
    from uuid import uuid4

    from app.services.schedule_worker import _claim_schedule_fire

    client, sessions = webhook_client
    db = sessions()
    try:
        wf = models.Workflow(id=uuid4(), user_id=uuid4(), name="Claim Race")
        db.add(wf)
        db.flush()
        version = models.WorkflowVersion(
            id=uuid4(), workflow_id=wf.id, version_number=1, graph_json={}
        )
        db.add(version)
        db.flush()
        sched = models.WorkflowSchedule(
            id=uuid4(), workflow_id=wf.id, workflow_version_id=version.id,
            cron_expr="* * * * *", trigger_node_id="t", enabled=True, cron_valid=True,
        )
        db.add(sched)
        db.commit()
        sched_id, minute = sched.id, "2026-10-18T10:15"
    finally:
        db.close()

    wins = []

    # NOTE: SessionLocal is bound to the app engine, not the isolated test
    # engine — drive the claim through the test session factory instead.
    def _claim_test_db():
        s = sessions()
        try:
            wins.append(_claim_schedule_fire(s, sched_id, minute))
        finally:
            s.close()

    threads = [threading.Thread(target=_claim_test_db) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(wins) == [False, False, True]
