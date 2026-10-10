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


def test_slack_url_verification_and_event_mapping(webhook_client):
    client, sessions = webhook_client
    wf = _published_workflow(client)
    credential = _issue(client, wf, "invoke_key")
    path = f"/v1/webhooks/{wf['id']}"

    # Handshake: no auth required, echoes the challenge.
    response = client.post(path, json={"type": "url_verification", "challenge": "tok-123"})
    assert response.status_code == 200
    assert response.json() == {"challenge": "tok-123"}
    assert "run_id" not in response.json()

    # Event callback via ?source=slack lifts mention fields into input.slack.
    payload = {
        "type": "event_callback",
        "event_id": "Ev123",
        "event": {"type": "app_mention", "text": "<@U0> hello", "user": "U9", "channel": "C7", "ts": "1.2"},
    }
    response = client.post(
        f"{path}?source=slack",
        json=payload,
        headers={"X-Aegis-Event-Token": credential["secret"]},
    )
    assert response.status_code == 202, response.text
    run_input = _run_input(sessions, response.json()["run_id"])
    assert run_input["source"] == "slack"
    assert run_input["slack"]["text"] == "<@U0> hello"
    assert run_input["event"]["type"] == "event_callback"
