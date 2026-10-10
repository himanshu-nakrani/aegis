"""Hosted-chat credential: aegis_chat_ token → session → pinned invoke.

Covers the /v1/chat/* surface:
- issue + session exchange mints a cookie-shaped session token.
- wrong/expired/revoked exchange tokens are rejected (uniform 401).
- /v1/chat/invoke runs only the token-bound workflow/version; tampered or
  expired session tokens fail closed.
"""

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.chat_session import mint_session_token
from tests.conftest import valid_graph

client = TestClient(app)


def _echo_graph(template="{{input.text}}"):
    return valid_graph(
        [
            {
                "id": "a",
                "position": {"x": 0, "y": 0},
                "data": {"nodeType": "transform", "label": "Echo", "template": template},
            }
        ]
    )


def _published_workflow():
    response = client.post(
        "/api/workflows",
        json={"name": f"Chat token {uuid4()}", "graph_json": _echo_graph()},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    response = client.post(
        f"/api/workflows/{body['id']}/publish",
        json={"version_id": body["latest_version"]["id"]},
    )
    assert response.status_code == 200, response.text
    return body


def _issue(wf, kind="chat_token"):
    response = client.post(f"/api/workflows/{wf['id']}/deploy/credentials/{kind}")
    assert response.status_code == 200, response.text
    return response.json()


def _deployment(deployment_id):
    db = SessionLocal()
    try:
        return (
            db.query(models.WorkflowDeployment)
            .filter(models.WorkflowDeployment.id == UUID(deployment_id))
            .first()
        )
    finally:
        db.close()


def _exchange(deployment_id, token):
    return client.post(
        "/v1/chat/session",
        json={"deployment_id": deployment_id, "token": token},
    )


def _chat_invoke(session_token, payload=None):
    return client.post(
        "/v1/chat/invoke",
        json=payload or {"input": "hello"},
        headers={"X-Aegis-Chat-Session": session_token},
    )


def _tamper_signature(token):
    payload, _ = token.split(".", 1)
    forged = hmac.new(b"forged-secret", payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{forged}"


def _expired_session(deployment_id):
    """Mint a well-formed session whose exp already passed."""
    deployment = _deployment(deployment_id)
    token, _ = mint_session_token(
        deployment.id, deployment.workflow_id, deployment.version_id, ttl_hours=-1
    )
    return token


# ---------- issue + exchange ----------


def test_issue_chat_token_and_exchange_mints_session():
    wf = _published_workflow()
    credential = _issue(wf)
    assert credential["kind"] == "chat_token"
    assert credential["secret"].startswith("aegis_chat_")
    assert credential["chat_token_active"] is True
    assert credential["chat_token_expires_at"]

    exchanged = _exchange(credential["deployment_id"], credential["secret"])
    assert exchanged.status_code == 200, exchanged.text
    body = exchanged.json()
    payload, signature = body["session_token"].split(".", 1)
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    # Bound to the deployment + pinned version — the client never supplies them.
    assert claims["dep"] == credential["deployment_id"]
    assert claims["wf"] == wf["id"]
    assert claims["ver"] == credential["version_id"]
    assert claims["exp"] > time.time()
    assert len(signature) == 64
    int(signature, 16)  # hex


def test_exchange_rejects_wrong_token_and_unknown_deployment():
    wf = _published_workflow()
    credential = _issue(wf)

    assert _exchange(credential["deployment_id"], "aegis_chat_wrong").status_code == 401
    assert _exchange(str(uuid4()), credential["secret"]).status_code == 401


def test_exchange_rejects_expired_chat_token():
    wf = _published_workflow()
    credential = _issue(wf)

    db = SessionLocal()
    try:
        deployment = (
            db.query(models.WorkflowDeployment)
            .filter(models.WorkflowDeployment.id == UUID(credential["deployment_id"]))
            .first()
        )
        deployment.chat_token_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    assert _exchange(credential["deployment_id"], credential["secret"]).status_code == 401


def test_revoked_chat_token_cannot_exchange():
    wf = _published_workflow()
    credential = _issue(wf)

    revoked = client.delete(f"/api/workflows/{wf['id']}/deploy/credentials/chat_token")
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["chat_token_active"] is False

    assert _exchange(credential["deployment_id"], credential["secret"]).status_code == 401


# ---------- session invoke ----------


def test_chat_invoke_runs_pinned_workflow():
    wf = _published_workflow()
    credential = _issue(wf)
    session = _exchange(credential["deployment_id"], credential["secret"]).json()

    response = _chat_invoke(session["session_token"], {"input": "hello world"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert body["output"] == "hello world"
    assert body["run_id"]


def test_chat_invoke_rejects_tampered_or_expired_session():
    wf = _published_workflow()
    credential = _issue(wf)
    session = _exchange(credential["deployment_id"], credential["secret"]).json()

    assert _chat_invoke("").status_code == 401
    assert _chat_invoke("not.a.session").status_code == 401
    assert _chat_invoke(_tamper_signature(session["session_token"])).status_code == 401
    assert _chat_invoke(_expired_session(credential["deployment_id"])).status_code == 401


def test_session_token_binds_deployment_not_client():
    """A session minted for deployment A runs A's workflow, never the client's pick."""
    first = _published_workflow()
    second = _published_workflow()
    credential_a = _issue(first)
    credential_b = _issue(second, "invoke_key")
    session = _exchange(credential_a["deployment_id"], credential_a["secret"]).json()

    response = _chat_invoke(session["session_token"], {"input": "bound"})
    assert response.status_code == 200, response.text
    run_id = response.json()["run_id"]

    db = SessionLocal()
    try:
        run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == UUID(run_id)).first()
        version = (
            db.query(models.WorkflowVersion)
            .filter(models.WorkflowVersion.id == run.workflow_version_id)
            .first()
        )
        assert str(version.workflow_id) == first["id"]
        assert str(version.workflow_id) != second["id"]
    finally:
        db.close()
    # The other deployment's pinned version differs — a stolen session can only
    # ever replay the workflow it was minted for.
    assert credential_b["version_id"] != credential_a["version_id"]
