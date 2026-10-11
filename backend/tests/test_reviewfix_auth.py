"""Review-fix regressions: MCP deployment-scoped discovery + body-bound
signatures, chat session revocation binding, regression-gate shell hygiene."""

import hashlib
import hmac
import json
import secrets
import time
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import yaml
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.chat_session import mint_session_token, verify_session_token
from app.services.deploy_descriptor import _sanitize_tool_name
from tests.conftest import valid_graph

client = TestClient(app)

MCP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}


def _rpc(method, params=None, request_id=1):
    return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}


def _tool_name(workflow_name):
    return f"invoke_{_sanitize_tool_name(workflow_name)}"


def _unique_name(prefix):
    return f"{prefix}-{uuid4().hex[:8]}"


def _publish_echo(name):
    response = client.post(
        "/api/workflows",
        json={
            "name": name,
            "graph_json": valid_graph(
                [
                    {
                        "id": "schema",
                        "position": {"x": 0, "y": 0},
                        "data": {
                            "label": "Input Schema",
                            "nodeType": "input_schema",
                            "inputFields": [{"key": "message", "type": "string", "required": True}],
                        },
                    },
                    {
                        "id": "n1",
                        "position": {"x": 200, "y": 0},
                        "data": {
                            "label": "Transform",
                            "nodeType": "transform",
                            "template": "echo: {{input.message}}",
                        },
                    },
                ],
                [{"id": "e1", "source": "schema", "target": "n1"}],
                entry_id="schema",
                exit_id="n1",
            ),
        },
    )
    assert response.status_code == 200, response.text
    workflow = response.json()
    published = client.post(
        f"/api/workflows/{workflow['id']}/publish",
        json={"version_id": workflow["latest_version"]["id"]},
    )
    assert published.status_code == 200, published.text
    return workflow


def _issue(workflow_id, kind="invoke_key"):
    response = client.post(f"/api/workflows/{workflow_id}/deploy/credentials/{kind}")
    assert response.status_code == 200, response.text
    return response.json()


def _invoke_headers(credential):
    return {
        "X-Aegis-Invoke-Key": credential["secret"],
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
    }


def _run_count():
    db = SessionLocal()
    try:
        return db.query(models.WorkflowRun).count()
    finally:
        db.close()


# ---------- finding 1: tools/list scoped to the caller's deployment ----------


def test_mcp_list_scoped_to_caller_deployment():
    name_a = _unique_name("Scope A")
    name_b = _unique_name("Scope B")
    wf_a = _publish_echo(name_a)
    wf_b = _publish_echo(name_b)
    cred_a = _issue(wf_a["id"])
    cred_b = _issue(wf_b["id"])

    listed_a = client.post(
        "/mcp", json=_rpc("tools/list"), headers={**MCP_HEADERS, **_invoke_headers(cred_a)}
    )
    assert listed_a.status_code == 200, listed_a.text
    names_a = {t["name"] for t in listed_a.json()["result"]["tools"]}
    assert _tool_name(name_a) in names_a
    assert _tool_name(name_b) not in names_a

    listed_b = client.post(
        "/mcp", json=_rpc("tools/list"), headers={**MCP_HEADERS, **_invoke_headers(cred_b)}
    )
    assert listed_b.status_code == 200, listed_b.text
    names_b = {t["name"] for t in listed_b.json()["result"]["tools"]}
    assert _tool_name(name_b) in names_b
    assert _tool_name(name_a) not in names_b


def test_mcp_list_rejects_missing_or_invalid_credentials():
    name = _unique_name("Scope Guard")
    wf = _publish_echo(name)
    cred = _issue(wf["id"])

    # Missing credentials: 401, no catalog.
    response = client.post("/mcp", json=_rpc("tools/list"), headers=MCP_HEADERS)
    assert response.status_code == 401, response.text

    # Wrong key for a real deployment: 401.
    bad = dict(_invoke_headers(cred))
    bad["X-Aegis-Invoke-Key"] = "aegis_inv_wrong"
    response = client.post("/mcp", json=_rpc("tools/list"), headers={**MCP_HEADERS, **bad})
    assert response.status_code == 401, response.text

    # Unknown deployment id: 401.
    forged = dict(_invoke_headers(cred))
    forged["X-Aegis-Deployment-ID"] = str(uuid4())
    response = client.post(
        "/mcp", json=_rpc("tools/list"), headers={**MCP_HEADERS, **forged}
    )
    assert response.status_code == 401, response.text


def test_mcp_call_cannot_reach_other_deployment_tool():
    name_a = _unique_name("Call Scope A")
    name_b = _unique_name("Call Scope B")
    wf_a = _publish_echo(name_a)
    _publish_echo(name_b)
    cred_a = _issue(wf_a["id"])
    before = _run_count()
    response = client.post(
        "/mcp",
        json=_rpc("tools/call", {"name": _tool_name(name_b), "arguments": {"message": "hi"}}),
        headers={**MCP_HEADERS, **_invoke_headers(cred_a)},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"]["isError"] is True
    assert "Unknown tool" in json.dumps(body["result"])
    assert _run_count() == before


# ---------- finding 2: signatures bind the exact JSON-RPC body ----------


def _signed_headers(credential, body, timestamp=None, nonce=None):
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    nonce = nonce or secrets.token_urlsafe(24)
    message = (
        f"POST\n/mcp\n{credential['deployment_id']}\n{credential['version_id']}\n"
        f"{timestamp}\n{nonce}\n".encode() + body
    )
    signature = hmac.new(credential["secret"].encode(), message, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
        "X-Aegis-Timestamp": timestamp,
        "X-Aegis-Nonce": nonce,
        "X-Aegis-Signature": "sha256=" + signature,
    }


@pytest.fixture
def webhook_client(monkeypatch):
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "run_execution_mode", "inline")
    monkeypatch.setattr(settings, "max_concurrent_runs", 1000)
    return client


def test_mcp_signature_over_empty_body_rejected_with_args(webhook_client):
    name = _unique_name("Sig Body")
    wf = _publish_echo(name)
    cred = _issue(wf["id"], "webhook_secret")
    tool = _tool_name(name)

    call = _rpc("tools/call", {"name": tool, "arguments": {"message": "hi"}})
    call_bytes = json.dumps(call, separators=(",", ":")).encode()
    # Signature covers the empty body, but the request carries arguments.
    headers = _signed_headers(cred, b"")
    before = _run_count()
    response = client.post("/mcp", content=call_bytes, headers=headers)
    assert response.status_code == 401, response.text
    assert _run_count() == before


def test_mcp_signature_over_exact_body_executes(webhook_client):
    name = _unique_name("Sig Exact")
    wf = _publish_echo(name)
    cred = _issue(wf["id"], "webhook_secret")
    tool = _tool_name(name)

    call = _rpc("tools/call", {"name": tool, "arguments": {"message": "bound"}})
    call_bytes = json.dumps(call, separators=(",", ":")).encode()
    headers = _signed_headers(cred, call_bytes)
    before = _run_count()
    response = client.post("/mcp", content=call_bytes, headers=headers)
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"]["output"] == "echo: bound"
    assert _run_count() == before + 1


# ---------- finding 3: revoked chat sessions die with the token ----------


def _echo_workflow():
    response = client.post(
        "/api/workflows",
        json={
            "name": f"Chat Revoke-{uuid4().hex[:8]}",
            "graph_json": valid_graph(
                [
                    {
                        "id": "t",
                        "position": {"x": 0, "y": 0},
                        "data": {"nodeType": "transform", "label": "Echo", "template": "{{input.text}}"},
                    }
                ]
            ),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    published = client.post(
        f"/api/workflows/{body['id']}/publish", json={"version_id": body["latest_version"]["id"]}
    )
    assert published.status_code == 200, published.text
    return body


def _exchange(deployment_id, token):
    return client.post("/v1/chat/session", json={"deployment_id": deployment_id, "token": token})


def _chat_invoke(session_token, payload=None):
    return client.post(
        "/v1/chat/invoke",
        json=payload or {"input": "hello"},
        headers={"X-Aegis-Chat-Session": session_token},
    )


def test_chat_session_revoked_token_rejects_invoke():
    wf = _echo_workflow()
    credential = _issue(wf["id"], "chat_token")
    session = _exchange(credential["deployment_id"], credential["secret"])
    assert session.status_code == 200, session.text
    token = session.json()["session_token"]

    assert _chat_invoke(token, {"input": "before"}).status_code == 200

    revoked = client.delete(f"/api/workflows/{wf['id']}/deploy/credentials/chat_token")
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["chat_token_active"] is False

    # The exchange token is dead AND the live session dies with it.
    assert _exchange(credential["deployment_id"], credential["secret"]).status_code == 401
    assert _chat_invoke(token, {"input": "after"}).status_code == 401


def test_chat_session_rotation_kills_old_session():
    wf = _echo_workflow()
    credential = _issue(wf["id"], "chat_token")
    old_session = _exchange(credential["deployment_id"], credential["secret"]).json()[
        "session_token"
    ]
    assert _chat_invoke(old_session, {"input": "v1"}).status_code == 200

    rotated = _issue(wf["id"], "chat_token")
    assert rotated["secret"] != credential["secret"]
    assert _chat_invoke(old_session, {"input": "stale"}).status_code == 401

    fresh = _exchange(rotated["deployment_id"], rotated["secret"])
    assert fresh.status_code == 200, fresh.text
    assert _chat_invoke(fresh.json()["session_token"], {"input": "v2"}).status_code == 200


def test_session_token_carries_mint_time():
    wf = _echo_workflow()
    credential = _issue(wf["id"], "chat_token")
    token, _ = mint_session_token(
        UUID(credential["deployment_id"]), UUID(wf["id"]), UUID(credential["version_id"])
    )
    claims = verify_session_token(token)
    assert claims is not None and "iat" in claims
    assert claims["exp"] > claims["iat"]


# ---------- finding 4: regression-gate shell hygiene ----------


def test_regression_gate_has_no_shell_interpolation():
    path = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "regression-gate.yml"
    assert path.exists(), "regression-gate.yml missing"
    doc = yaml.safe_load(path.read_text())
    assert yaml.safe_load(yaml.safe_dump(doc)) == doc  # parses cleanly
    steps = doc["jobs"]["gate"]["steps"]
    gate = next(s for s in steps if s.get("name") == "Gate on regression experiment")
    assert "${{" not in gate["run"], "inputs must not be interpolated into run:"
    env = gate["env"]
    for var in ("AEGIS_API_URL", "AEGIS_WORKFLOW_ID", "AEGIS_DATASET_ID", "AEGIS_THRESHOLD"):
        assert f'"${var}"' in gate["run"]
        assert var in env
