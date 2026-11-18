"""Google Drive sync into sealed knowledge revisions.

The HTTP connector stays unavailable until encryption, authenticated ownership,
and an OAuth client are configured. Sync itself is provider-agnostic so tests
can exercise membership, unsupported types, and failed activation without Google.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid5, NAMESPACE_URL

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models
from app.services.crypto import encryption_enabled
from app.services.documents import chunk_text
from app.services.embeddings import apply_embedding
from app.services.knowledge_revisions import LOCAL_PROFILE, _profile_hash, _sha, lock_scope, seal_scope

FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
SUPPORTED = {
    "application/vnd.google-apps.document",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}
TEXT_OCTET_SUFFIXES = (".txt", ".md", ".markdown")


@dataclass
class RemoteFile:
    file_id: str
    name: str
    mime: str
    parents: list[str] = field(default_factory=list)
    trashed: bool = False
    can_download: bool = True
    text: str = ""


class DriveProvider:
    """Test double and the shape a live Google client must match."""

    def list_children(self, folder_id: str) -> list[RemoteFile]:
        raise NotImplementedError

    def get_file(self, file_id: str) -> RemoteFile:
        raise NotImplementedError

    def export_text(self, remote: RemoteFile) -> str:
        if remote.mime not in SUPPORTED and not _octet_text(remote):
            raise RuntimeError("export called for an unsupported type")
        return remote.text


def _octet_text(remote: RemoteFile) -> bool:
    return remote.mime == "application/octet-stream" and remote.name.lower().endswith(TEXT_OCTET_SUFFIXES)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def connector_block_reason() -> str | None:
    if not settings.knowledge_drive_enabled:
        return "connector_unavailable"
    if not encryption_enabled():
        return "connector_unavailable"
    if not settings.auth_enabled:
        return "connector_unavailable"
    if not settings.google_oauth_client_id or not settings.google_oauth_redirect_uri:
        return "connector_unavailable"
    return None


def start_oauth(db: Session, *, user_id: UUID, knowledge_base_id: UUID) -> dict:
    reason = connector_block_reason()
    if reason:
        raise HTTPException(status_code=409, detail=reason)
    state = secrets.token_urlsafe(32)
    binding = secrets.token_urlsafe(32)
    attempt = models.KnowledgeOAuthAttempt(
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        state_hash=_hash(state),
        browser_binding_hash=_hash(binding),
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(attempt)
    db.flush()
    query = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_oauth_client_id}"
        f"&redirect_uri={settings.google_oauth_redirect_uri}"
        "&response_type=code&access_type=offline&prompt=consent"
        "&scope=openid%20email%20https://www.googleapis.com/auth/drive.readonly"
        f"&state={state}"
    )
    return {
        "authorize_url": query,
        "binding": binding,
        "attempt_id": str(attempt.id),
    }


def reject_callback(db: Session, *, state: str | None, binding: str | None) -> models.KnowledgeOAuthAttempt:
    """Validate the attempt. Does not exchange a code or store a grant."""
    if not state or not binding:
        raise HTTPException(status_code=400, detail="oauth_state_invalid")
    attempt = (
        db.query(models.KnowledgeOAuthAttempt)
        .filter(models.KnowledgeOAuthAttempt.state_hash == _hash(state))
        .first()
    )
    if attempt is None or attempt.browser_binding_hash != _hash(binding):
        raise HTTPException(status_code=400, detail="oauth_state_invalid")
    expires_at = attempt.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if attempt.status != "pending" or expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="oauth_state_invalid")
    attempt.status = "exchanging"
    db.flush()
    # Code exchange requires a configured token client. Refuse rather than
    # invent a grant. The attempt is consumed so the code cannot be retried.
    attempt.status = "failed"
    attempt.consumed_at = datetime.now(timezone.utc)
    db.flush()
    raise HTTPException(status_code=409, detail="connector_unavailable")


def collect(provider: DriveProvider, roots: list[RemoteFile]) -> tuple[list[RemoteFile], list[dict], list[dict]]:
    accepted: list[RemoteFile] = []
    excluded: list[dict] = []
    errors: list[dict] = []
    seen: set[str] = set()
    queue = list(roots)
    while queue:
        remote = queue.pop(0)
        if remote.file_id in seen:
            continue
        seen.add(remote.file_id)
        if remote.trashed or not remote.can_download:
            excluded.append({"file_id": remote.file_id, "reason": "unavailable"})
            continue
        if remote.mime == SHORTCUT:
            excluded.append({"file_id": remote.file_id, "reason": "shortcut_not_followed"})
            continue
        if remote.mime == FOLDER:
            queue.extend(provider.list_children(remote.file_id))
            continue
        if remote.mime not in SUPPORTED and not _octet_text(remote):
            excluded.append({"file_id": remote.file_id, "reason": "unsupported_type"})
            continue
        try:
            text = provider.export_text(remote)
        except Exception as exc:  # noqa: BLE001 — one file must not activate a partial corpus
            errors.append({"file_id": remote.file_id, "reason": type(exc).__name__})
            continue
        if not (text or "").strip():
            errors.append({"file_id": remote.file_id, "reason": "empty"})
            continue
        remote.text = text
        accepted.append(remote)
    return accepted, excluded, errors


def _drive_source_ids(db: Session, base_id: UUID) -> set[UUID]:
    rows = (
        db.query(models.KnowledgeSourceDocument.remote_file_id)
        .filter(
            models.KnowledgeSourceDocument.knowledge_base_id == base_id,
            models.KnowledgeSourceDocument.origin_kind == "google_drive",
        )
        .all()
    )
    found: set[UUID] = set()
    for (remote_file_id,) in rows:
        try:
            found.add(UUID(str(remote_file_id)))
        except (TypeError, ValueError):
            continue
    return found


def _delete_working_chunks(db: Session, base_id: UUID, source_ids: set[UUID]) -> None:
    if not source_ids:
        return
    from app.services.vector_search import delete_embedding_vector

    rows = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.knowledge_base_id == base_id,
            models.KnowledgeDocument.document_version_id.is_(None),
            models.KnowledgeDocument.source_document_id.in_(source_ids),
        )
        .all()
    )
    for row in rows:
        delete_embedding_vector(db, row.id)
        db.delete(row)
    db.flush()


def _drive_version_matches(
    db: Session,
    base: models.KnowledgeBase,
    source_id: UUID,
    chunks: list[dict],
    profile_hash: str,
) -> bool:
    """True when the active revision already sealed this exact file text."""
    if base.active_revision_id is None:
        return False
    logical = (
        db.query(models.KnowledgeSourceDocument)
        .filter(
            models.KnowledgeSourceDocument.knowledge_base_id == base.id,
            models.KnowledgeSourceDocument.remote_file_id == str(source_id),
        )
        .first()
    )
    if logical is None:
        return False
    member = (
        db.query(models.KnowledgeRevisionMember)
        .filter(
            models.KnowledgeRevisionMember.revision_id == base.active_revision_id,
            models.KnowledgeRevisionMember.source_document_id == logical.id,
        )
        .first()
    )
    if member is None:
        return False
    version = db.get(models.KnowledgeDocumentVersion, member.document_version_id)
    if version is None or version.embedding_profile_hash != profile_hash:
        return False
    body = [
        {"index": index, "text": chunk["text"], "start": chunk["start"], "end": chunk["end"]}
        for index, chunk in enumerate(chunks)
    ]
    return version.content_hash == _sha({"text": body, "profile": profile_hash})


def sync_files(
    db: Session,
    *,
    user_id: UUID,
    base: models.KnowledgeBase,
    roots: list[RemoteFile],
    provider: DriveProvider,
) -> dict:
    """Import accepted files into the library. Errors leave the active revision unchanged."""
    previous = base.active_revision_id
    accepted, excluded, errors = collect(provider, roots)
    if errors:
        base_status = "blocked"
        return {
            "activated": False,
            "status": base_status,
            "revision_id": str(previous) if previous else None,
            "excluded": excluded,
            "errors": errors,
            "imported": 0,
        }
    lock_scope(db, knowledge_base_id=base.id)
    profile_hash = _profile_hash(LOCAL_PROFILE)
    scan_ids = {
        uuid5(NAMESPACE_URL, f"drive:{base.id}:{remote.file_id}"): remote for remote in accepted
    }
    previous_ids = _drive_source_ids(db, base.id)
    missing = previous_ids - set(scan_ids)
    _delete_working_chunks(db, base.id, missing)
    for source_id, remote in scan_ids.items():
        chunks = chunk_text(remote.text)
        if _drive_version_matches(db, base, source_id, chunks, profile_hash):
            continue
        _delete_working_chunks(db, base.id, {source_id})
        for index, chunk in enumerate(chunks):
            row = models.KnowledgeDocument(
                knowledge_base_id=base.id,
                title=remote.name[:255],
                text=chunk["text"],
                source_document_id=source_id,
                source_name=remote.name,
                source_mime=remote.mime,
                chunk_index=index,
                chunk_start=chunk["start"],
                chunk_end=chunk["end"],
            )
            db.add(row)
            db.flush()
            apply_embedding(row, db)
    revision = seal_scope(
        db,
        knowledge_base_id=base.id,
        origin="google_drive",
        omit_source_ids=missing,
    )
    return {
        "activated": revision is not None,
        "status": "active",
        "revision_id": str(revision.id) if revision is not None else None,
        "excluded": excluded,
        "errors": [],
        "imported": len(accepted),
    }
