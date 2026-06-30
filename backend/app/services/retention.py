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
        deleted = (
            db.query(models.WorkflowRun)
            .filter(
                models.WorkflowRun.created_at < cutoff,
                models.WorkflowRun.status.in_(["completed", "failed", "cancelled"]),
            )
            .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted or 0)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()