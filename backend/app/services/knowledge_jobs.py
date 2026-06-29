"""Background knowledge base indexing jobs."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.db import models
from app.db.database import SessionLocal
from app.services.knowledge_indexing import apply_embedding

logger = logging.getLogger("aegis.knowledge_jobs")


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
            apply_embedding(row)
            db.add(row)
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
            apply_embedding(row)
        db.commit()
        return len(rows)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def enqueue_bulk_import(workflow_id: UUID, documents: list[dict[str, str | None]]) -> None:
    try:
        count = await asyncio.to_thread(_bulk_import_sync, workflow_id, documents)
        logger.info(
            "Bulk knowledge import completed",
            extra={"workflow_id": str(workflow_id), "count": count},
        )
    except Exception:
        logger.exception(
            "Bulk knowledge import failed",
            extra={"workflow_id": str(workflow_id)},
        )


async def enqueue_reindex(workflow_id: UUID) -> None:
    try:
        count = await asyncio.to_thread(_reindex_sync, workflow_id)
        logger.info(
            "Knowledge reindex completed",
            extra={"workflow_id": str(workflow_id), "count": count},
        )
    except Exception:
        logger.exception(
            "Knowledge reindex failed",
            extra={"workflow_id": str(workflow_id)},
        )