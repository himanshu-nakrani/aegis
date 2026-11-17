"""Seal manual library and workflow knowledge into immutable revisions.

Google Drive is a later writer into the same seal. A sealed revision is the
only set ``kb_retrieve`` may read once a scope has one. A denial rejects the
whole revision, including members a tag filter would have skipped.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import models

LOCAL_PROFILE = {"family": "local_hashing_v1", "dim": 768}
LEGACY_PROFILE = {"family": "legacy_unknown"}


class KnowledgeAccessDenied(Exception):
    def __init__(self, reason: str = "knowledge_access_denied"):
        self.reason = reason
        super().__init__(reason)


def _sha(payload: object) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _profile_hash(profile: dict) -> str:
    return _sha(profile)


def _scope_filter(model, *, knowledge_base_id: UUID | None, workflow_id: UUID | None):
    if knowledge_base_id is not None:
        return model.knowledge_base_id == knowledge_base_id
    return model.workflow_id == workflow_id


def _chunks(db: Session, *, knowledge_base_id: UUID | None, workflow_id: UUID | None):
    query = db.query(models.KnowledgeDocument)
    if knowledge_base_id is not None:
        query = query.filter(models.KnowledgeDocument.knowledge_base_id == knowledge_base_id)
    else:
        query = query.filter(models.KnowledgeDocument.workflow_id == workflow_id)
    return query.order_by(
        models.KnowledgeDocument.source_document_id.asc(),
        models.KnowledgeDocument.chunk_index.asc(),
        models.KnowledgeDocument.created_at.asc(),
    ).all()


def _owner_id(db: Session, *, knowledge_base_id: UUID | None, workflow_id: UUID | None) -> UUID:
    if knowledge_base_id is not None:
        base = db.get(models.KnowledgeBase, knowledge_base_id)
        if base is None:
            raise ValueError("knowledge base not found")
        return base.user_id
    workflow = db.get(models.Workflow, workflow_id)
    if workflow is None:
        raise ValueError("workflow not found")
    return workflow.user_id


def _active_revision(
    db: Session, *, knowledge_base_id: UUID | None, workflow_id: UUID | None
) -> models.KnowledgeRevision | None:
    if knowledge_base_id is not None:
        base = db.get(models.KnowledgeBase, knowledge_base_id)
        pointer = base.active_revision_id if base is not None else None
    else:
        workflow = db.get(models.Workflow, workflow_id)
        pointer = workflow.active_knowledge_revision_id if workflow is not None else None
    if pointer is None:
        return None
    return db.get(models.KnowledgeRevision, pointer)


def revision_chunk_ids(
    db: Session, *, knowledge_base_id: UUID | None = None, workflow_id: UUID | None = None
) -> set[UUID] | None:
    """Chunk ids in the active revision. None means the scope has never been sealed."""
    revision = _active_revision(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if revision is None:
        return None
    assert_allowed(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    version_ids = [
        row.document_version_id
        for row in db.query(models.KnowledgeRevisionMember.document_version_id)
        .filter(models.KnowledgeRevisionMember.revision_id == revision.id)
        .all()
    ]
    if not version_ids:
        return set()
    ids = (
        db.query(models.KnowledgeDocument.id)
        .filter(models.KnowledgeDocument.document_version_id.in_(version_ids))
        .all()
    )
    return {row[0] for row in ids}


def assert_allowed(
    db: Session, *, knowledge_base_id: UUID | None = None, workflow_id: UUID | None = None
) -> models.KnowledgeRevision | None:
    revision = _active_revision(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if revision is None:
        return None
    denied = (
        db.query(models.KnowledgeAccessDenial.id)
        .filter(_scope_filter(models.KnowledgeAccessDenial, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id))
        .first()
    )
    if denied is not None:
        member_ids = [
            row.source_document_id
            for row in db.query(models.KnowledgeRevisionMember.source_document_id)
            .filter(models.KnowledgeRevisionMember.revision_id == revision.id)
            .all()
        ]
        if member_ids:
            hit = (
                db.query(models.KnowledgeAccessDenial.id)
                .filter(
                    models.KnowledgeAccessDenial.source_document_id.in_(member_ids),
                    _scope_filter(
                        models.KnowledgeAccessDenial,
                        knowledge_base_id=knowledge_base_id,
                        workflow_id=workflow_id,
                    ),
                )
                .first()
            )
            if hit is not None:
                raise KnowledgeAccessDenied()
    return revision


def deny_document(
    db: Session,
    *,
    user_id: UUID,
    source_document_id: UUID,
    reason: str,
    knowledge_base_id: UUID | None = None,
    workflow_id: UUID | None = None,
) -> None:
    db.add(
        models.KnowledgeAccessDenial(
            user_id=user_id,
            knowledge_base_id=knowledge_base_id,
            workflow_id=workflow_id,
            source_document_id=source_document_id,
            reason=reason,
        )
    )
    if knowledge_base_id is not None:
        base = db.get(models.KnowledgeBase, knowledge_base_id)
        if base is not None:
            base.access_generation = int(base.access_generation or 0) + 1
    elif workflow_id is not None:
        workflow = db.get(models.Workflow, workflow_id)
        if workflow is not None:
            workflow.knowledge_access_generation = int(workflow.knowledge_access_generation or 0) + 1
    db.flush()


def seal_scope(
    db: Session,
    *,
    knowledge_base_id: UUID | None = None,
    workflow_id: UUID | None = None,
    origin: str = "manual",
    profile: dict | None = None,
) -> models.KnowledgeRevision | None:
    """Build one sealed revision from the chunks currently stored for this scope."""
    if (knowledge_base_id is None) == (workflow_id is None):
        raise ValueError("seal_scope requires exactly one scope")
    chunks = _chunks(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if not chunks:
        return _activate_empty(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id, origin=origin)

    user_id = _owner_id(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    profile = profile or LOCAL_PROFILE
    profile_hash = _profile_hash(profile)
    groups: dict[str, list[models.KnowledgeDocument]] = {}
    for chunk in chunks:
        key = str(chunk.source_document_id or chunk.id)
        groups.setdefault(key, []).append(chunk)

    members: list[tuple[models.KnowledgeSourceDocument, models.KnowledgeDocumentVersion, str]] = []
    for key, rows in groups.items():
        body = [{"index": row.chunk_index, "text": row.text, "start": row.chunk_start, "end": row.chunk_end} for row in rows]
        content_hash = _sha({"text": body, "profile": profile_hash})
        logical = (
            db.query(models.KnowledgeSourceDocument)
            .filter(
                models.KnowledgeSourceDocument.remote_file_id == key,
                _scope_filter(
                    models.KnowledgeSourceDocument,
                    knowledge_base_id=knowledge_base_id,
                    workflow_id=workflow_id,
                ),
            )
            .first()
        )
        if logical is None:
            logical = models.KnowledgeSourceDocument(
                user_id=user_id,
                knowledge_base_id=knowledge_base_id,
                workflow_id=workflow_id,
                origin_kind="legacy_import" if origin == "legacy_import" else origin,
                remote_file_id=key,
                availability="available",
            )
            db.add(logical)
            db.flush()
        version = (
            db.query(models.KnowledgeDocumentVersion)
            .filter(
                models.KnowledgeDocumentVersion.source_document_id == logical.id,
                models.KnowledgeDocumentVersion.content_hash == content_hash,
                models.KnowledgeDocumentVersion.embedding_profile_hash == profile_hash,
            )
            .first()
        )
        if version is None:
            version = models.KnowledgeDocumentVersion(
                user_id=user_id,
                knowledge_base_id=knowledge_base_id,
                workflow_id=workflow_id,
                source_document_id=logical.id,
                content_hash=content_hash,
                embedding_profile_hash=profile_hash,
                display_name=rows[0].title or rows[0].source_name,
                source_url=rows[0].source_url,
                chunk_count=len(rows),
                sealed_at=datetime.now(timezone.utc),
            )
            db.add(version)
            db.flush()
        for row in rows:
            row.document_version_id = version.id
            row.chunk_hash = _sha(row.text)
            row.embedding_profile_hash = profile_hash
        members.append((logical, version, content_hash))

    members.sort(key=lambda item: item[0].remote_file_id or "")
    content = {
        "members": [
            {"document": item[0].remote_file_id, "version": item[2], "profile": profile_hash}
            for item in members
        ],
        "profile": profile,
    }
    digest = _sha(content)
    current = _active_revision(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if current is not None and current.content_hash == digest:
        return current

    sequence = 1 if current is None else int(current.sequence) + 1
    revision = models.KnowledgeRevision(
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        workflow_id=workflow_id,
        sequence=sequence,
        parent_revision_id=current.id if current is not None else None,
        content_hash=digest,
        settings_json={},
        embedding_profile_json=profile,
        member_count=len(members),
        chunk_count=len(chunks),
        origin=origin,
        sealed_at=datetime.now(timezone.utc),
    )
    db.add(revision)
    db.flush()
    for ordinal, (logical, version, _content) in enumerate(members):
        db.add(
            models.KnowledgeRevisionMember(
                revision_id=revision.id,
                source_document_id=logical.id,
                document_version_id=version.id,
                ordinal=ordinal,
            )
        )
    _point(db, revision, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    db.flush()
    return revision


def _activate_empty(
    db: Session,
    *,
    knowledge_base_id: UUID | None,
    workflow_id: UUID | None,
    origin: str,
) -> models.KnowledgeRevision | None:
    current = _active_revision(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if current is not None and current.member_count == 0:
        return current
    if current is None and origin != "delete":
        return None
    user_id = _owner_id(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    digest = _sha({"members": [], "profile": LOCAL_PROFILE})
    revision = models.KnowledgeRevision(
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        workflow_id=workflow_id,
        sequence=1 if current is None else int(current.sequence) + 1,
        parent_revision_id=current.id if current is not None else None,
        content_hash=digest,
        embedding_profile_json=LOCAL_PROFILE,
        member_count=0,
        chunk_count=0,
        origin=origin,
        sealed_at=datetime.now(timezone.utc),
    )
    db.add(revision)
    db.flush()
    _point(db, revision, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    return revision


def _point(
    db: Session,
    revision: models.KnowledgeRevision,
    *,
    knowledge_base_id: UUID | None,
    workflow_id: UUID | None,
) -> None:
    if knowledge_base_id is not None:
        base = db.get(models.KnowledgeBase, knowledge_base_id)
        if base is None:
            return
        base.active_revision_id = revision.id
        base.activation_generation = int(base.activation_generation or 0) + 1
    else:
        workflow = db.get(models.Workflow, workflow_id)
        if workflow is None:
            return
        workflow.active_knowledge_revision_id = revision.id
        workflow.knowledge_activation_generation = int(workflow.knowledge_activation_generation or 0) + 1


def backfill_all(db: Session) -> int:
    """Seal existing manual chunks once. Safe to repeat."""
    sealed = 0
    for base in db.query(models.KnowledgeBase).all():
        if base.active_revision_id is None:
            revision = seal_scope(
                db,
                knowledge_base_id=base.id,
                origin="legacy_import",
                profile=LEGACY_PROFILE,
            )
            if revision is not None:
                sealed += 1
    for workflow in db.query(models.Workflow).all():
        has_chunks = (
            db.query(models.KnowledgeDocument.id)
            .filter(models.KnowledgeDocument.workflow_id == workflow.id)
            .first()
        )
        if has_chunks is not None and workflow.active_knowledge_revision_id is None:
            revision = seal_scope(
                db,
                workflow_id=workflow.id,
                origin="legacy_import",
                profile=LEGACY_PROFILE,
            )
            if revision is not None:
                sealed += 1
    return sealed
