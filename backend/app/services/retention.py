"""Data retention for old workflow runs."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db import models
from app.db.database import SessionLocal


def purge_old_runs() -> int:
    days = max(1, int(getattr(settings, "run_retention_days", 90) or 90))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    db = SessionLocal()
    try:
        run_ids = [
            rid
            for (rid,) in db.query(models.WorkflowRun.id).filter(
                models.WorkflowRun.created_at < cutoff,
                models.WorkflowRun.status.in_(["completed", "failed", "cancelled"]),
            )
        ]
        if not run_ids:
            db.commit()
            return 0

        # Bulk deletes bypass ORM relationship cascade, so remove the child
        # rows (which carry no DB-level cascade on existing databases) first.
        db.query(models.NodeResult).filter(
            models.NodeResult.run_id.in_(run_ids)
        ).delete(synchronize_session=False)
        db.query(models.LlmCall).filter(
            models.LlmCall.run_id.in_(run_ids)
        ).delete(synchronize_session=False)
        db.query(models.Feedback).filter(
            models.Feedback.run_id.in_(run_ids)
        ).delete(synchronize_session=False)

        deleted = (
            db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.id.in_(run_ids))
            .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted or 0)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()