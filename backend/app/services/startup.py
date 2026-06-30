from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import text

from app.db import models
from app.db.database import SessionLocal, engine
from app.services.compiler import clear_compile_cache

logger = logging.getLogger("aegis.startup")

STALE_RUN_MESSAGE = "Run interrupted by server restart or crash"
STALE_JOB_MESSAGE = "Job interrupted by server restart or crash"


def check_database() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False


def recover_stale_runs() -> int:
    """Mark orphaned pending/running runs as failed after a crash or deploy."""
    db = SessionLocal()
    try:
        stale = (
            db.query(models.WorkflowRun)
            .filter(models.WorkflowRun.status.in_(["pending", "running", "queued", "awaiting_approval"]))
            .all()
        )
        if not stale:
            return 0

        now = datetime.now(timezone.utc)
        for run in stale:
            run.status = "failed"
            run.final_output = STALE_RUN_MESSAGE
            run.completed_at = now
            if not run.started_at:
                run.started_at = now

        db.commit()
        logger.warning(
            "Recovered stale runs",
            extra={"count": len(stale), "event": "stale_runs_recovered"},
        )
        return len(stale)
    finally:
        db.close()


def recover_stale_jobs() -> int:
    """Mark orphaned running jobs as failed after a crash or deploy."""
    db = SessionLocal()
    try:
        stale = (
            db.query(models.BackgroundJob)
            .filter(models.BackgroundJob.status == "running")
            .all()
        )
        if not stale:
            return 0

        now = datetime.now(timezone.utc)
        for job in stale:
            job.status = "failed"
            job.error = STALE_JOB_MESSAGE
            job.completed_at = now
            if not job.started_at:
                job.started_at = now

        db.commit()
        logger.warning(
            "Recovered stale jobs",
            extra={"count": len(stale), "event": "stale_jobs_recovered"},
        )
        return len(stale)
    finally:
        db.close()


def run_startup_tasks() -> dict[str, int | bool]:
    clear_compile_cache()
    db_ok = check_database()
    recovered_runs = recover_stale_runs() if db_ok else 0
    recovered_jobs = recover_stale_jobs() if db_ok else 0
    return {
        "database_ok": db_ok,
        "stale_runs_recovered": recovered_runs,
        "stale_jobs_recovered": recovered_jobs,
    }