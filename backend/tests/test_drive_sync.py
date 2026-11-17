"""Drive sync against a fake provider. The public connector stays closed."""

from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.main import app
from app.services.drive_sync import FOLDER, RemoteFile, reject_callback, start_oauth, sync_files

client = TestClient(app)


class FakeDrive:
    def __init__(self, files: dict[str, list[RemoteFile]], fail: set[str] | None = None):
        self.files = files
        self.fail = fail or set()

    def list_children(self, folder_id: str) -> list[RemoteFile]:
        return list(self.files.get(folder_id, []))

    def get_file(self, file_id: str) -> RemoteFile:
        raise NotImplementedError

    def export_text(self, remote: RemoteFile) -> str:
        if remote.file_id in self.fail:
            raise RuntimeError("download failed")
        return remote.text


def _base() -> models.KnowledgeBase:
    response = client.post("/api/knowledge", json={"name": "Drive"})
    assert response.status_code == 201, response.text
    db = SessionLocal()
    base = db.get(models.KnowledgeBase, UUID(response.json()["id"]))
    db.expunge(base)
    db.close()
    return base


def test_connect_is_unavailable_until_the_connector_is_configured():
    base = _base()
    refused = client.post(f"/api/knowledge/{base.id}/drive/connect")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "connector_unavailable"


def test_configured_connect_stores_an_attempt_and_callback_does_not_grant(monkeypatch):
    base = _base()
    monkeypatch.setattr(settings, "knowledge_drive_enabled", True)
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "google_oauth_client_id", "client")
    monkeypatch.setattr(settings, "google_oauth_redirect_uri", "http://localhost/cb")
    monkeypatch.setattr("app.services.drive_sync.encryption_enabled", lambda: True)
    db = SessionLocal()
    stored = db.get(models.KnowledgeBase, base.id)
    started = start_oauth(db, user_id=stored.user_id, knowledge_base_id=stored.id)
    db.commit()
    assert "accounts.google.com" in started["authorize_url"]
    with pytest.raises(HTTPException) as missing:
        reject_callback(db, state="nope", binding="nope")
    assert missing.value.status_code == 400
    state = started["authorize_url"].split("state=")[-1]
    with pytest.raises(HTTPException) as blocked:
        reject_callback(db, state=state, binding=started["binding"])
    assert blocked.value.status_code == 409
    assert blocked.value.detail == "connector_unavailable"
    db.commit()
    attempt = db.get(models.KnowledgeOAuthAttempt, UUID(started["attempt_id"]))
    assert attempt.status == "failed"
    assert attempt.consumed_at is not None
    db.close()


def test_sync_seals_supported_files_and_blocks_when_an_accepted_file_fails():
    base = _base()
    folder = RemoteFile(file_id="folder", name="Docs", mime=FOLDER)
    note = RemoteFile(file_id="note", name="note.txt", mime="text/plain", text="drive alpha token")
    image = RemoteFile(file_id="img", name="pic.png", mime="image/png", text="ignored")
    provider = FakeDrive({"folder": [note, image]})
    db = SessionLocal()
    stored = db.get(models.KnowledgeBase, base.id)
    first = sync_files(db, user_id=stored.user_id, base=stored, roots=[folder], provider=provider)
    db.commit()
    assert first["activated"] is True
    revision_id = stored.active_revision_id
    broken = RemoteFile(file_id="bad", name="bad.txt", mime="text/plain", text="should not land")
    second = sync_files(
        db,
        user_id=stored.user_id,
        base=stored,
        roots=[folder, broken],
        provider=FakeDrive({"folder": [note, broken]}, fail={"bad"}),
    )
    assert second["activated"] is False
    assert stored.active_revision_id == revision_id
    db.close()

    queried = client.post(
        f"/api/knowledge/{base.id}/query",
        json={"query": "drive alpha token", "method": "keyword"},
    )
    assert queried.status_code == 200, queried.text
    assert queried.json()["results"]
