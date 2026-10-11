"""Consumer-visible scope, publication, rotation and raw-body signing guarantees."""

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
from app.db.database import Base, get_db
from app.main import app
from tests.conftest import valid_graph


@pytest.fixture
def deployment_client(monkeypatch):
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


def workflow(client, publish=True):
    response = client.post("/api/workflows", json={
        "name": "Scoped deployment",
        "graph_json": valid_graph([{
            "id": "t", "position": {"x": 0, "y": 0},
            "data": {"nodeType": "transform", "label": "Echo", "transformTemplate": "{{input.text}}"},
        }]),
    })
    assert response.status_code == 200, response.text
    body = response.json()
    if publish:
        response = client.post(f"/api/workflows/{body['id']}/publish", json={"version_id": body["latest_version"]["id"]})
        assert response.status_code == 200, response.text
    return body


def issue(client, wf, kind="invoke_key", headers=None):
    response = client.post(f"/api/workflows/{wf['id']}/deploy/credentials/{kind}", headers=headers or {})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def invoke_headers(credential):
    return {
        "X-Aegis-Invoke-Key": credential["secret"],
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
    }


def signed_headers(credential, path, body, timestamp=None, nonce=None):
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    nonce = nonce or secrets.token_urlsafe(24)
    message = f"POST\n{path}\n{credential['deployment_id']}\n{credential['version_id']}\n{timestamp}\n{nonce}\n".encode() + body
    signature = hmac.new(credential["secret"].encode(), message, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Aegis-Deployment-ID": credential["deployment_id"],
        "X-Aegis-Version-ID": credential["version_id"],
        "X-Aegis-Timestamp": timestamp,
        "X-Aegis-Nonce": nonce,
        "X-Aegis-Signature": "sha256=" + signature,
    }


def test_invoke_key_matches_only_published_deployment(deployment_client):
    client, sessions = deployment_client
    first, second = workflow(client), workflow(client)
    key = issue(client, first)
    other = issue(client, second)
    headers = invoke_headers(key)
    path = f"/v1/workflows/{first['id']}/invoke"
    assert client.post(path, json={"input": "hello"}).status_code == 401
    wrong = {**invoke_headers(other), "X-Aegis-Invoke-Key": key["secret"]}
    assert client.post(f"/v1/workflows/{second['id']}/invoke", json={"input": "hello"}, headers=wrong).status_code == 401
    assert client.post(path, json={"input": "hello", "version_id": str(uuid4())}, headers=headers).status_code == 401
    assert client.post(path, json={"input": "hello"}, headers={**headers, "X-Aegis-Version-ID": str(uuid4())}).status_code == 401
    assert client.post(path, json={"input": "hello"}, headers={"X-Aegis-Invoke-Key": key["secret"]}).status_code == 401
    response = client.post(path, json={"input": "hello"}, headers=headers)
    assert response.status_code == 200, response.text
    with sessions() as db:
        run = db.get(models.WorkflowRun, UUID(response.json()["run_id"]))
        assert str(run.workflow_version_id) == key["version_id"]
    generic = client.post("/v1/invoke", json={"workflow_id": first["id"], "input": "generic"}, headers=headers)
    assert generic.status_code == 200, generic.text
    assert client.post("/v1/invoke", json={"workflow_id": second["id"], "input": "wrong"}, headers=headers).status_code == 401


def test_account_keys_cannot_invoke_and_invoke_keys_cannot_manage(deployment_client, monkeypatch):
    client, _ = deployment_client
    wf = workflow(client)
    key = issue(client, wf)
    path = f"/v1/workflows/{wf['id']}/invoke"
    for enabled in (False, True):
        monkeypatch.setattr(settings, "auth_enabled", enabled)
        monkeypatch.setattr(settings, "aegis_api_key", "account-admin")
        assert client.post(path, json={"input": "hi"}, headers={"X-Aegis-API-Key": "account-admin"}).status_code == 401
        assert client.get("/api/workflows", headers={"X-Aegis-Invoke-Key": key["secret"]}).status_code == 401
        assert client.get("/api/workflows", headers={"Authorization": f"Bearer {key['secret']}"}).status_code == 401
        assert client.post(f"/api/workflows/{wf['id']}/deploy/credentials/invoke_key", headers=invoke_headers(key)).status_code == 401


def test_only_owner_editor_can_rotate_or_revoke(deployment_client, monkeypatch):
    client, _ = deployment_client
    wf = workflow(client)
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "aegis_api_key", "admin")
    monkeypatch.setattr(settings, "aegis_api_key_user_map", json.dumps({
        "other": {"user_id": str(uuid4()), "role": "editor"},
        "viewer": {"user_id": "00000000-0000-0000-0000-000000000001", "role": "viewer"},
    }))
    route = f"/api/workflows/{wf['id']}/deploy/credentials/invoke_key"
    for method in (client.post, client.delete):
        assert method(route, headers={"X-Aegis-API-Key": "other"}).status_code == 404
        assert method(route, headers={"X-Aegis-API-Key": "viewer"}).status_code == 403
    issue(client, wf, headers={"X-Aegis-API-Key": "admin"})


def test_rotation_revocation_and_new_publication_invalidate_old_credentials(deployment_client):
    client, sessions = deployment_client
    wf = workflow(client)
    first = issue(client, wf)
    rotated = issue(client, wf)
    path = f"/v1/workflows/{wf['id']}/invoke"
    assert client.post(path, json={"input": "old"}, headers=invoke_headers(first)).status_code == 401
    assert client.post(path, json={"input": "new"}, headers=invoke_headers(rotated)).status_code == 200
    assert client.delete(f"/api/workflows/{wf['id']}/deploy/credentials/invoke_key").status_code == 200
    assert client.post(path, json={"input": "revoked"}, headers=invoke_headers(rotated)).status_code == 401
    key = issue(client, wf)
    webhook = issue(client, wf, "webhook_secret")
    with sessions() as db:
        new_version = models.WorkflowVersion(workflow_id=UUID(wf["id"]), version_number=2, graph_json=wf["latest_version"]["graph_json"])
        db.add(new_version)
        db.commit()
        new_id = str(new_version.id)
    assert client.post(f"/api/workflows/{wf['id']}/publish", json={"version_id": new_id}).status_code == 200
    assert client.post(path, json={"input": "stale"}, headers=invoke_headers(key)).status_code == 401
    body = b'{"input":"stale webhook"}'
    assert client.post(path, content=body, headers=signed_headers(webhook, path, body)).status_code == 401
    descriptor = client.get(f"/api/workflows/{wf['id']}/deploy").json()
    assert not descriptor["invoke_key_active"] and not descriptor["webhook_secret_active"]


def test_webhook_raw_body_timestamp_path_and_replay_protection(deployment_client):
    client, _ = deployment_client
    wf = workflow(client)
    credential = issue(client, wf, "webhook_secret")
    path = f"/v1/workflows/{wf['id']}/invoke"
    body = b'{"input":"signed"}'
    headers = signed_headers(credential, path, body)
    assert client.post(path, content=b'{"input": "signed"}', headers=headers).status_code == 401
    assert client.post(path, content=body, headers={**headers, "X-Aegis-Signature": "invalid"}).status_code == 401
    assert client.post(path, content=body, headers=signed_headers(credential, path, body, timestamp=int(time.time())-301)).status_code == 401
    assert client.post(path, content=body, headers=signed_headers(credential, path, body, timestamp=int(time.time())+301)).status_code == 401
    assert client.post(path, content=body, headers=signed_headers(credential, path, body, nonce="short")).status_code == 401
    assert client.post(path, content=body, headers=headers).status_code == 200
    assert client.post(path, content=body, headers=headers).status_code == 409
    generic_body = json.dumps({"workflow_id": wf["id"], "input": "generic signed"}).encode()
    assert client.post("/v1/invoke", content=generic_body, headers=signed_headers(credential, path, generic_body)).status_code == 401
    generic_headers = signed_headers(credential, "/v1/invoke", generic_body)
    assert client.post("/v1/invoke", content=generic_body, headers=generic_headers).status_code == 200
    assert client.post("/v1/invoke", content=generic_body, headers=generic_headers).status_code == 409
    rotated = issue(client, wf, "webhook_secret")
    assert client.post(path, content=body, headers=signed_headers(credential, path, body)).status_code == 401
    assert client.post(path, content=body, headers=signed_headers(rotated, path, body)).status_code == 200
    assert client.delete(f"/api/workflows/{wf['id']}/deploy/credentials/webhook_secret").status_code == 200
    assert client.post(path, content=body, headers=signed_headers(rotated, path, body)).status_code == 401


def test_secrets_stored_safely_and_never_retrieved(deployment_client, monkeypatch):
    client, sessions = deployment_client
    wf = workflow(client)
    key, webhook = issue(client, wf), issue(client, wf, "webhook_secret")
    with sessions() as db:
        deployment = db.get(models.WorkflowDeployment, UUID(key["deployment_id"]))
        assert deployment.invoke_key_hash == hashlib.sha256(key["secret"].encode()).hexdigest()
        assert deployment.webhook_secret_encrypted.startswith("v1:")
        assert webhook["secret"] not in deployment.webhook_secret_encrypted
    for path in (f"/api/workflows/{wf['id']}/deploy", f"/api/workflows/{wf['id']}/versions", "/api/audit"):
        response = client.get(path)
        assert response.status_code == 200, response.text
        assert key["secret"] not in response.text and webhook["secret"] not in response.text
    monkeypatch.setattr(settings, "app_encryption_key", "")
    assert client.post(f"/api/workflows/{wf['id']}/deploy/credentials/webhook_secret").status_code == 503


def test_unpublished_and_legacy_publication_require_provisioning(deployment_client):
    client, sessions = deployment_client
    unpublished = workflow(client, publish=False)
    assert client.post(f"/api/workflows/{unpublished['id']}/deploy/credentials/invoke_key").status_code == 409
    assert client.post(f"/v1/workflows/{unpublished['id']}/invoke", json={"input": "no publication"}).status_code == 401
    with sessions() as db:
        legacy = db.get(models.Workflow, UUID(unpublished["id"]))
        legacy.published_version_id = UUID(unpublished["latest_version"]["id"])
        db.commit()
    assert client.post(f"/v1/workflows/{unpublished['id']}/invoke", json={"input": "legacy"}).status_code == 401
    key = issue(client, unpublished)
    assert client.post(f"/v1/workflows/{unpublished['id']}/invoke", json={"input": "provisioned"}, headers=invoke_headers(key)).status_code == 200


def test_invoke_quota_shared_across_routes_and_ignores_account_headers(deployment_client, monkeypatch):
    client, _ = deployment_client
    wf = workflow(client)
    credential = issue(client, wf)
    other = workflow(client)
    other_credential = issue(client, other)
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_invoke_per_minute", 2)
    headers = invoke_headers(credential)
    path = f"/v1/workflows/{wf['id']}/invoke"
    first = client.post(path, json={"input": "first"}, headers={**headers, "X-Aegis-API-Key": "bogus-one"})
    assert first.status_code == 200, first.text
    second = client.post("/v1/invoke?api_key=bogus-two", json={"workflow_id": wf["id"], "input": "second"}, headers={**headers, "Authorization": "Bearer bogus-three"})
    assert second.status_code == 200, second.text
    third = client.post(path, json={"input": "third"}, headers={**headers, "X-Aegis-API-Key": "bogus-four"})
    assert third.status_code == 429, third.text
    assert client.post("/v1/invoke", json={"workflow_id": wf["id"], "input": "fourth"}, headers={**headers, "Authorization": "Bearer bogus-five"}).status_code == 429
    assert client.post("/v1/invoke", json={"workflow_id": other["id"], "input": "separate deployment"}, headers=invoke_headers(other_credential)).status_code == 200
