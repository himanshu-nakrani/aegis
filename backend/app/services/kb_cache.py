"""Per-run knowledge document cache."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session, load_only

from app.db import models


def load_workflow_kb_documents(
    db: Session,
    workflow_id: UUID,
    *,
    include_embeddings: bool = True,
    ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    columns = [
        models.KnowledgeDocument.id,
        models.KnowledgeDocument.title,
        models.KnowledgeDocument.text,
        models.KnowledgeDocument.source_name,
        models.KnowledgeDocument.source_document_id,
        models.KnowledgeDocument.chunk_index,
        models.KnowledgeDocument.chunk_start,
        models.KnowledgeDocument.chunk_end,
        models.KnowledgeDocument.updated_at,
    ]
    if include_embeddings:
        columns.append(models.KnowledgeDocument.embedding)
    query = (
        db.query(models.KnowledgeDocument)
        .options(load_only(*columns))
        .filter(models.KnowledgeDocument.workflow_id == workflow_id)
    )
    if ids is not None:
        from uuid import UUID as _UUID

        query = query.filter(
            models.KnowledgeDocument.id.in_(
                [_UUID(doc_id) for doc_id in ids if doc_id]
            )
        )
    rows = query.order_by(models.KnowledgeDocument.updated_at.desc()).all()
    return [
        {
            "id": str(row.id),
            "title": row.title,
            "text": row.text,
            "embedding": row.embedding if include_embeddings else None,
            "source_name": row.source_name,
            "source_document_id": (
                str(row.source_document_id) if row.source_document_id else None
            ),
            "chunk_index": row.chunk_index,
            "char_start": row.chunk_start,
            "char_end": row.chunk_end,
        }
        for row in rows
    ]