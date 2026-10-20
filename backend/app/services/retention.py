"""Data retention for old workflow runs."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.time_utils import to_db_utc


_PURGE_BATCH_SIZE = 500


def purge_old_runs() -> int:
    days = max(1, int(getattr(settings, "run_retention_days", 90) or 90))
    db = SessionLocal()
    try:
        cutoff = to_db_utc(db, datetime.now(timezone.utc) - timedelta(days=days))
        total = 0
        while True:
            # One bounded chunk per transaction: the full id list would blow
            # past SQLITE_MAX_VARIABLE_NUMBER / Postgres 65535 bind params on
            # a busy instance and hold one giant lock for the whole purge.
            chunk = [
                rid
                for (rid,) in db.query(models.WorkflowRun.id).filter(
                    models.WorkflowRun.created_at < cutoff,
                    models.WorkflowRun.status.in_(["completed", "failed", "cancelled"]),
                ).limit(_PURGE_BATCH_SIZE)
            ]
            if not chunk:
                db.commit()
                return total

            # Bulk deletes bypass ORM relationship cascade, and SQLite does not
            # enable PRAGMA foreign_keys, so DB-level ON DELETE CASCADE does not
            # fire either — remove every child row explicitly or spans/results are
            # orphaned permanently (audit P2-17).
            db.query(models.RunSpan).filter(
                models.RunSpan.run_id.in_(chunk)
            ).delete(synchronize_session=False)
            db.query(models.NodeResult).filter(
                models.NodeResult.run_id.in_(chunk)
            ).delete(synchronize_session=False)
            db.query(models.LlmCall).filter(
                models.LlmCall.run_id.in_(chunk)
            ).delete(synchronize_session=False)
            db.query(models.Feedback).filter(
                models.Feedback.run_id.in_(chunk)
            ).delete(synchronize_session=False)
            # No FK on the ledger (migration 030). Leaving these rows behind
            # keeps a purged run's attempt marker forever and blocks nothing
            # the user can still see — delete them with the run.
            db.query(models.RunRollupLedger).filter(
                models.RunRollupLedger.run_id.in_(chunk)
            ).delete(synchronize_session=False)

            deleted = (
                db.query(models.WorkflowRun)
                .filter(models.WorkflowRun.id.in_(chunk))
                .delete(synchronize_session=False)
            )
            db.commit()
            total += int(deleted or 0)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()