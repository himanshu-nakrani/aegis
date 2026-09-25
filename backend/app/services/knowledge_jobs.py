"""Background knowledge base indexing jobs."""

from __future__ import annotations

from uuid import UUID

from app.db import models
from app.db.database import SessionLocal
from app.services.embeddings import apply_embedding


def run_bulk_import_job(workflow_id: UUID, documents: list[dict[str, str | None]]) -> int:
    return _bulk_import_sync(workflow_id, documents)


def run_reindex_job(workflow_id: UUID) -> int:
    return _reindex_sync(workflow_id)


def _bulk_import_sync(workflow_id: UUID, documents: list[dict[str, str | None]]) -> int:
    db = SessionLocal()
    try:
        created = 0
        for item in documents:
            row = models.KnowledgeDocument(
                workflow_id=workflow_id,
                title=item.get("title"),
                text=str(item.get("text") or ""),
            )
            db.add(row)
            db.flush()
            apply_embedding(row, db)
            created += 1
        db.commit()
        return created
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _reindex_sync(workflow_id: UUID) -> int:
    db = SessionLocal()
    try:
        rows = (
            db.query(models.KnowledgeDocument)
            .filter(models.KnowledgeDocument.workflow_id == workflow_id)
            .all()
        )
        for row in rows:
            apply_embedding(row, db)
        db.commit()
        return len(rows)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()