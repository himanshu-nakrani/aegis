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

from sqlalchemy.exc import IntegrityError
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


def _scope_rows(db: Session, *, knowledge_base_id: UUID | None, workflow_id: UUID | None):
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


def _working_chunks(
    db: Session,
    *,
    knowledge_base_id: UUID | None,
    workflow_id: UUID | None,
    omit_source_ids: set[UUID] | None = None,
):
    """Rows that belong in the next revision.

    A null ``document_version_id`` is the editable copy. Version-owned rows stay
    with the revision that sealed them. A new editable copy for a source replaces
    that source's currently active rows; omitted sources leave the next revision
    without deleting the historical copies.
    """
    omitted = {str(item) for item in (omit_source_ids or set())}
    rows = [
        row
        for row in _scope_rows(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
        if str(row.source_document_id or row.id) not in omitted
    ]
    editable = [row for row in rows if row.document_version_id is None]
    current = _active_revision(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    if current is None:
        return editable or [row for row in rows if row.document_version_id is None]
    version_ids = {
        row.document_version_id
        for row in db.query(models.KnowledgeRevisionMember.document_version_id)
        .filter(models.KnowledgeRevisionMember.revision_id == current.id)
        .all()
    }
    replaced = {row.source_document_id for row in editable if row.source_document_id is not None}
    live = [
        row
        for row in rows
        if row.document_version_id in version_ids and row.source_document_id not in replaced
    ]
    return editable + live


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
    omit_source_ids: set[UUID] | None = None,
) -> models.KnowledgeRevision | None:
    """Build one sealed revision from the chunks currently stored for this scope."""
    if (knowledge_base_id is None) == (workflow_id is None):
        raise ValueError("seal_scope requires exactly one scope")
    # A caller that already flushed an insert still holds FOR KEY SHARE from
    # that insert. Locking here cannot put the owner lock ahead of it.
    # Writers call lock_scope before their own inserts.
    lock_scope(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    # Callers delete or insert in this transaction with autoflush disabled.
    # Membership has to see those pending changes before it hashes the scope.
    db.flush()
    last_conflict: IntegrityError | None = None
    for _attempt in range(5):
        nested = db.begin_nested()
        try:
            revision = _seal_once(
                db,
                knowledge_base_id=knowledge_base_id,
                workflow_id=workflow_id,
                origin=origin,
                profile=profile,
                omit_source_ids=omit_source_ids,
            )
            nested.commit()
            return revision
        except IntegrityError as exc:
            nested.rollback()
            last_conflict = exc
    raise last_conflict or RuntimeError("Could not allocate a knowledge revision")


def lock_scope(db: Session, *, knowledge_base_id: UUID | None = None, workflow_id: UUID | None = None) -> None:
    """Lock one library or workflow before this transaction inserts knowledge rows.

    PostgreSQL takes FOR KEY SHARE on the owner when a child row is inserted,
    and that share lock conflicts with FOR UPDATE. The owner lock has to be
    acquired first. SQLite ignores FOR UPDATE; the savepoint retry around the
    revision insert covers that dialect.
    """
    if (knowledge_base_id is None) == (workflow_id is None):
        raise ValueError("lock_scope requires exactly one scope")
    if knowledge_base_id is not None:
        row = (
            db.query(models.KnowledgeBase)
            .filter(models.KnowledgeBase.id == knowledge_base_id)
            .with_for_update()
            .one()
        )
    else:
        row = (
            db.query(models.Workflow)
            .filter(models.Workflow.id == workflow_id)
            .with_for_update()
            .one()
        )
    db.refresh(row)


def _copy_version_chunks(
    db: Session,
    version: models.KnowledgeDocumentVersion,
    rows: list[models.KnowledgeDocument],
    profile_hash: str,
) -> None:
    """Give a document version its own chunk rows.

    Editable rows keep a null ``document_version_id``. Rows that already belong
    to this version stay there. Rows owned by an older version are copied, not
    reassigned, so the older version still has its text.
    """
    if any(row.document_version_id == version.id for row in rows):
        for row in rows:
            if row.document_version_id == version.id:
                row.chunk_hash = _sha(row.text)
                row.embedding_profile_hash = profile_hash
        return
    existing = (
        db.query(models.KnowledgeDocument.id)
        .filter(models.KnowledgeDocument.document_version_id == version.id)
        .first()
    )
    if existing is not None:
        return
    from app.services.embeddings import apply_embedding

    for row in rows:
        clone = models.KnowledgeDocument(
            workflow_id=row.workflow_id,
            knowledge_base_id=row.knowledge_base_id,
            tags_json=list(row.tags_json) if row.tags_json else None,
            source_url=row.source_url,
            title=row.title,
            text=row.text,
            embedding=list(row.embedding) if row.embedding else None,
            source_document_id=row.source_document_id,
            source_name=row.source_name,
            source_mime=row.source_mime,
            chunk_index=row.chunk_index,
            chunk_start=row.chunk_start,
            chunk_end=row.chunk_end,
            document_version_id=version.id,
            chunk_hash=_sha(row.text),
            embedding_profile_hash=profile_hash,
        )
        db.add(clone)
        db.flush()
        apply_embedding(clone, db)


def knowledge_cache_token(db: Session, *, workflow_id: UUID) -> str:
    """Identity of the corpus a workflow retrieval cache is allowed to serve."""
    workflow = db.get(models.Workflow, workflow_id)
    if workflow is None:
        return ""
    return ":".join(
        (
            str(workflow.active_knowledge_revision_id or ""),
            str(int(workflow.knowledge_access_generation or 0)),
            str(int(workflow.knowledge_activation_generation or 0)),
        )
    )


def _logical_keys_for_versions(db: Session, version_ids: set[UUID]) -> dict[UUID, str]:
    if not version_ids:
        return {}
    rows = (
        db.query(
            models.KnowledgeRevisionMember.document_version_id,
            models.KnowledgeSourceDocument.remote_file_id,
        )
        .join(
            models.KnowledgeSourceDocument,
            models.KnowledgeSourceDocument.id == models.KnowledgeRevisionMember.source_document_id,
        )
        .filter(models.KnowledgeRevisionMember.document_version_id.in_(version_ids))
        .all()
    )
    return {version_id: remote for version_id, remote in rows if remote}


def assign_stable_source_ids(db: Session, rows: list[models.KnowledgeDocument]) -> None:
    """Give pasted chunks one source id shared by the editable row and its copies.

    A null ``source_document_id`` makes grouping fall back to each row's own
    id, so a version copy and the editable row look like two documents.
    """
    version_ids = {
        row.document_version_id
        for row in rows
        if row.source_document_id is None and row.document_version_id is not None
    }
    keys = _logical_keys_for_versions(db, version_ids)
    for row in rows:
        if row.source_document_id is not None:
            continue
        remote = keys.get(row.document_version_id) if row.document_version_id is not None else None
        if remote:
            try:
                row.source_document_id = UUID(str(remote))
                continue
            except ValueError:
                pass
        if row.document_version_id is None:
            row.source_document_id = row.id


def source_identity(db: Session, row: models.KnowledgeDocument) -> UUID:
    """The id delete and omission use for one chunk, including a version copy."""
    if row.source_document_id is not None:
        return row.source_document_id
    if row.document_version_id is not None:
        remote = _logical_keys_for_versions(db, {row.document_version_id}).get(row.document_version_id)
        if remote:
            try:
                return UUID(str(remote))
            except ValueError:
                pass
    return row.id


def _seal_once(
    db: Session,
    *,
    knowledge_base_id: UUID | None,
    workflow_id: UUID | None,
    origin: str,
    profile: dict | None,
    omit_source_ids: set[UUID] | None,
) -> models.KnowledgeRevision | None:
    lock_scope(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    assign_stable_source_ids(
        db, _scope_rows(db, knowledge_base_id=knowledge_base_id, workflow_id=workflow_id)
    )
    chunks = _working_chunks(
        db,
        knowledge_base_id=knowledge_base_id,
        workflow_id=workflow_id,
        omit_source_ids=omit_source_ids,
    )
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
        _copy_version_chunks(db, version, rows, profile_hash)
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
    return _insert_revision(
        db,
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        workflow_id=workflow_id,
        digest=digest,
        profile=profile,
        member_count=len(members),
        chunk_count=len(chunks),
        origin=origin,
        members=members,
    )


def _insert_revision(
    db: Session,
    *,
    user_id: UUID,
    knowledge_base_id: UUID | None,
    workflow_id: UUID | None,
    digest: str,
    profile: dict,
    member_count: int,
    chunk_count: int,
    origin: str,
    members: list[tuple[models.KnowledgeSourceDocument, models.KnowledgeDocumentVersion, str]],
) -> models.KnowledgeRevision:
    """Allocate the next sequence. A concurrent sealer raises IntegrityError so
    the caller can roll back this savepoint and read the committed sequence."""
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
        member_count=member_count,
        chunk_count=chunk_count,
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
    db.flush()
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
    return _insert_revision(
        db,
        user_id=user_id,
        knowledge_base_id=knowledge_base_id,
        workflow_id=workflow_id,
        digest=digest,
        profile=LOCAL_PROFILE,
        member_count=0,
        chunk_count=0,
        origin=origin,
        members=[],
    )


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
