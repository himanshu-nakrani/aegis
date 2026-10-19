from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

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


class MigrationsBehindError(RuntimeError):
    """Raised when the database is behind the latest Alembic revision."""


def _alembic_head_revisions() -> set[str]:
    """Resolve the current Alembic head revision(s) from alembic/versions."""
    from pathlib import Path

    from alembic.config import Config
    from alembic.script import ScriptDirectory

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    return set(script.get_heads())


def _current_db_revisions() -> set[str]:
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        context = MigrationContext.configure(conn)
        return set(context.get_current_heads())


def check_migrations_current(*, strict: bool = True) -> bool:
    """Compare the DB's Alembic revision to head; log loudly / refuse to boot if behind.

    When ``strict`` is False and the check itself cannot run (e.g. DB
    unreachable) we log and return False rather than crash. When ``strict``
    is True the check is fail-closed: a behind/unstamped database raises
    ``MigrationsBehindError`` and an indeterminate check re-raises, so boot
    refuses to continue on either drift or a check outage (L22).
    """
    try:
        heads = _alembic_head_revisions()
        current = _current_db_revisions()
    except Exception:
        logger.exception("Could not determine Alembic migration state")
        if strict:
            raise
        return False

    if current == heads:
        return True

    detail = (
        f"Database is not at the latest Alembic revision. "
        f"db={sorted(current) or '<none/unstamped>'} expected_head={sorted(heads)}. "
        f"Run `alembic upgrade head` before starting the app."
    )
    logger.error(detail, extra={"event": "migrations_behind"})
    if strict:
        raise MigrationsBehindError(detail)
    return False


def _older_than(value: datetime | None, cutoff: datetime) -> bool:
    """True when a stored timestamp is older than the staleness cutoff."""
    if value is None:
        return True
    if value.tzinfo is None and cutoff.tzinfo is not None:
        value = value.replace(tzinfo=timezone.utc)
    return value < cutoff


def recover_stale_runs(*, force: bool = False) -> int:
    """Recover orphaned runs after a crash or deploy.
    Only rows older than ``run_stale_after_seconds`` are treated as orphans:
    a young running/awaiting_approval row may belong to a live sibling after
    a rolling restart, and re-queueing it would double-execute.
    (Multi-replica inline execution is unsupported — inline assumes a single
    API process; use worker mode for horizontal scale.)
    With ``resume_runs_on_boot`` (default): ``pending``/``queued`` rows are
    left claimable (a worker poll or the inline drain picks them up), and
    ``running``/``awaiting_approval`` orphans are re-queued for checkpoint
    resume — parked ``ApprovalRequest`` rows are resolved to 'cancelled' so
    the approval node re-parks a fresh row when it re-executes, stale
    ``metrics.pending_approval`` is cleared, and
    ``metrics.resume_attempts``/``resumed_at`` are stamped. Runs that exceed
    ``resume_max_attempts`` are failed with ``STALE_RUN_MESSAGE`` instead of
    looping forever.
    With ``resume_runs_on_boot`` false: the pre-durable behavior — every
    orphaned non-terminal run is marked failed.

    Guard for "worker" execution mode: run execution lives in a separate
    worker.py process, so an API-process restart must NOT touch runs the
    worker is actively executing. In that mode we leave in-flight runs alone
    unless ``force=True`` (used by the worker process on its own boot).
    """
    from app.config import settings

    if not force and getattr(settings, "run_execution_mode", "inline") == "worker":
        return 0

    resume_enabled = bool(getattr(settings, "resume_runs_on_boot", True))
    max_attempts = int(getattr(settings, "resume_max_attempts", 3) or 3)
    # Only rows older than the stale window are orphans. A young
    # running/awaiting_approval row may belong to a live sibling process
    # (rolling restart) or to this process's own not-yet-started tasks —
    # re-queueing it would double-execute. Fresh pending/queued rows are
    # claimed normally by the poll/drain; only old ones need recovery.
    window = max(60, int(getattr(settings, "run_stale_after_seconds", 900) or 900))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window)

    try:
        from app.services.executor import active_run_ids

        live_ids = active_run_ids()
    except Exception:  # noqa: BLE001 — executor import failure must not block boot
        live_ids = set()

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
        handled = 0
        failed_ids: list = []
        for run in stale:
            if str(run.id) in live_ids or run.id in live_ids:
                # Live in-process task: never re-queue (double-execution) or
                # cancel its parked approvals, on any tick or boot.
                continue
            if resume_enabled and run.status in ("pending", "queued"):
                # Still claimable — the worker poll or inline drain resumes
                # them; there is no in-flight work to interrupt.
                continue

            if not force and not _older_than(run.created_at, cutoff):
                # Young in-flight row: leave it for its owner. A later boot
                # or the periodic re-recovery below picks it up once stale.
                # force=True (single worker's own boot) owns every row.
                continue
            if resume_enabled:
                # Cancel parked approvals so the node re-parks a fresh row on
                # resume (the parked row's wait is dead with the process).
                db.query(models.ApprovalRequest).filter(
                    models.ApprovalRequest.run_id == run.id,
                    models.ApprovalRequest.status == "parked",
                ).update(
                    {"status": "cancelled", "resolved_at": now},
                    synchronize_session=False,
                )

                metrics = dict(run.metrics_json or {})
                attempts = int(metrics.get("resume_attempts") or 0) + 1
                if attempts > max_attempts:
                    run.status = "failed"
                    run.final_output = STALE_RUN_MESSAGE
                    run.completed_at = now
                    if not run.started_at:
                        run.started_at = now
                    handled += 1
                    failed_ids.append(run.id)
                    continue

                metrics["resume_attempts"] = attempts
                metrics["resumed_at"] = now.isoformat()
                metrics.pop("pending_approval", None)
                run.metrics_json = metrics
                # Re-queued, not running: the run is claimable again and the
                # executor resumes it from run_checkpoints at the frontier.
                run.status = "queued"
                handled += 1
                continue

            run.status = "failed"
            run.final_output = STALE_RUN_MESSAGE
            run.completed_at = now
            if not run.started_at:
                run.started_at = now
            handled += 1
            failed_ids.append(run.id)

        if not handled:
            return 0
        db.commit()
        if failed_ids:
            from app.services.event_bus import publish_terminal_sync

            for rid in failed_ids:
                publish_terminal_sync(rid, "run_failed", {"error": STALE_RUN_MESSAGE})
        logger.warning(
            "Recovered stale runs",
            extra={
                "count": handled,
                "resume_enabled": resume_enabled,
                "event": "stale_runs_recovered",
            },
        )
        return handled
    finally:
        db.close()


async def resume_orphaned_runs() -> int:
    """Claim pending/queued runs and schedule them in-process (inline mode).

    Called from the API lifespan on boot: runs left ``pending``/``queued`` by
    a crash (or re-queued by ``recover_stale_runs``) have no worker to pick
    them up in inline mode, so claim them here — oldest first, bounded by
    ``max_concurrent_runs - active``, via FOR UPDATE SKIP LOCKED so a
    concurrent claim never double-schedules. Worker mode is a no-op: the
    dedicated worker process's poll loop owns claiming there.
    """
    import asyncio

    from app.config import settings

    if getattr(settings, "run_execution_mode", "inline") != "inline":
        return 0

    from app.services.executor import schedule_run
    from app.services.run_worker import claim_pending_runs

    run_ids = await asyncio.to_thread(claim_pending_runs)
    for run_id in run_ids:
        schedule_run(run_id)
    if run_ids:
        logger.info(
            "Resumed orphaned runs on boot",
            extra={"count": len(run_ids), "event": "orphaned_runs_resumed"},
        )
    return len(run_ids)


def recover_stale_jobs() -> int:
    """Fail orphaned running jobs after a crash or deploy; keep queued ones.

    Only ``running`` rows older than the stale window are failed — a young
    ``running`` row may belong to a live sibling process (same split-brain
    class as runs; multi-replica inline is unsupported, but rolling
    restarts must not kill in-flight jobs). ``queued`` rows are left for
    the caller to re-dispatch (see ``pending_job_ids``) — they never execute
    on their own after a restart.
    """
    from app.config import settings

    window = max(60, int(getattr(settings, "run_stale_after_seconds", 900) or 900))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window)
    db = SessionLocal()
    try:
        stale = (
            db.query(models.BackgroundJob)
            .filter(models.BackgroundJob.status == "running")
            .all()
        )
        # Compare in a naive frame on SQLite (stored datetimes are naive).
        cutoff_cmp = cutoff.replace(tzinfo=None) if db.bind and db.bind.dialect.name == "sqlite" else cutoff
        failed = 0
        now = datetime.now(timezone.utc)
        for job in stale:
            started = job.started_at or job.created_at
            if started is not None:
                anchor = started.replace(tzinfo=None) if started.tzinfo is not None and cutoff_cmp.tzinfo is None else started
                if anchor >= cutoff_cmp:
                    continue
            job.status = "failed"
            job.error = STALE_JOB_MESSAGE
            job.completed_at = now
            if not job.started_at:
                job.started_at = now
            failed += 1

        db.commit()
        if failed:
            logger.warning(
                "Recovered stale jobs",
                extra={"count": failed, "event": "stale_jobs_recovered"},
            )
        return failed
    finally:
        db.close()


def pending_job_ids() -> list:
    """Ids of ``queued`` background jobs to re-dispatch after boot."""
    db = SessionLocal()
    try:
        return [
            row[0]
            for row in db.query(models.BackgroundJob.id)
            .filter(models.BackgroundJob.status == "queued")
            .all()
        ]
    finally:
        db.close()


def run_startup_tasks() -> dict[str, int | bool]:
    from app.config import settings

    clear_compile_cache()
    db_ok = check_database()

    migrations_current = True
    if db_ok and getattr(settings, "migration_check_enabled", True):
        # Gate startup on migrations being current. Strict mode raises
        # MigrationsBehindError (refuse to boot) unless explicitly disabled.
        migrations_current = check_migrations_current(
            strict=getattr(settings, "migration_check_strict", True)
        )

    recovered_runs = recover_stale_runs() if db_ok else 0
    recovered_jobs = recover_stale_jobs() if db_ok else 0
    return {
        "database_ok": db_ok,
        "migrations_current": migrations_current,
        "stale_runs_recovered": recovered_runs,
        "stale_jobs_recovered": recovered_jobs,
    }