"""Background cron scheduler for workflow Trigger nodes (n8n Schedule Trigger)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from croniter import croniter
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.executor import active_run_count, schedule_run
from app.services.graph_validation import GraphValidationError, validate_workflow_graph

logger = logging.getLogger("aegis.scheduler")

_scheduler_task: asyncio.Task[None] | None = None
_last_retention_at: datetime | None = None


def cron_matches_now(cron_expr: str, now: datetime | None = None) -> bool:
    moment = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    try:
        itr = croniter(cron_expr.strip(), moment - timedelta(minutes=1))
        next_fire = itr.get_next(datetime).replace(second=0, microsecond=0)
        return next_fire == moment
    except (ValueError, KeyError):
        return False


def should_fire_schedule(workflow_id: str, minute_key: str, fired: dict[str, str]) -> bool:
    """In-memory dedup helper (tests); production uses DB-backed last_fired_at."""
    if fired.get(workflow_id) == minute_key:
        return False
    fired[workflow_id] = minute_key
    return True


def _claim_schedule_fire(db, schedule_id: UUID, minute_key: str) -> bool:
    from sqlalchemy import update as _sa_update

    window_start = datetime.strptime(minute_key, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
    # Single-statement compare-and-set: exactly one claimant wins the minute.
    # FOR UPDATE is a parsed-and-ignored no-op on SQLite, and even on Postgres
    # two replicas can both pass the Python check between SELECT and COMMIT.
    claimed = db.execute(
        _sa_update(models.WorkflowSchedule)
        .where(
            models.WorkflowSchedule.id == schedule_id,
            (models.WorkflowSchedule.last_fired_at.is_(None))
            | (models.WorkflowSchedule.last_fired_at < window_start),
        )
        .values(last_fired_at=window_start)
    ).rowcount
    if claimed == 1:
        db.commit()
        return True
    db.rollback()
    return False


def _try_claim_schedule(schedule_id: UUID, minute_key: str) -> bool:
    db = SessionLocal()
    try:
        return _claim_schedule_fire(db, schedule_id, minute_key)
    finally:
        db.close()


def _release_schedule_claim(schedule_id: UUID, minute_key: str) -> None:
    """Give back a consumed minute claim (capacity skip): reset last_fired_at
    only if it still holds this minute's stamp, so a concurrent claimant that
    legitimately won afterwards is never clobbered."""
    from sqlalchemy import update as _sa_update

    window_start = datetime.strptime(minute_key, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        db.execute(
            _sa_update(models.WorkflowSchedule)
            .where(
                models.WorkflowSchedule.id == schedule_id,
                models.WorkflowSchedule.last_fired_at == window_start,
            )
            .values(last_fired_at=None)
        )
        db.commit()
    except Exception:  # noqa: BLE001 — best effort; worst case the fire waits a minute
        logger.exception("Schedule claim release failed", extra={"schedule_id": str(schedule_id)})
        db.rollback()
    finally:
        db.close()

def _trigger_schedules(graph_json: dict) -> list[tuple[str | None, str]]:
    """All ``(trigger_node_id, cron_expr)`` entries configured on the trigger.

    One workflow may carry N schedules: the node's ``scheduleCrons`` list is the
    multi-entry shape; a lone ``scheduleCron`` (legacy graphs) reads as one entry.
    """
    entries: list[tuple[str | None, str]] = []
    for node in graph_json.get("nodes", []):
        data = node.get("data") or {}
        if data.get("nodeType") != "trigger":
            continue
        if data.get("triggerType") != "schedule":
            return entries
        raw = data.get("scheduleCrons")
        crons = raw if isinstance(raw, list) else [data.get("scheduleCron")]
        for cron in crons:
            if isinstance(cron, str) and cron.strip():
                entries.append((node.get("id"), cron.strip()))
        return entries
    return entries



def _scan_scheduled_workflows() -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(models.WorkflowSchedule, models.Workflow, models.WorkflowVersion)
            .join(models.Workflow, models.Workflow.id == models.WorkflowSchedule.workflow_id)
            .join(
                models.WorkflowVersion,
                models.WorkflowVersion.id == models.WorkflowSchedule.workflow_version_id,
            )
            .filter(
                models.WorkflowSchedule.enabled.is_(True),
                models.WorkflowSchedule.cron_valid.is_(True),
            )
            .all()
        )

        due: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        minute_key = now.strftime("%Y-%m-%dT%H:%M")

        for schedule, workflow, version in rows:
            if not cron_matches_now(schedule.cron_expr, now):
                continue
            try:
                validate_workflow_graph(version.graph_json)
            except GraphValidationError:
                continue
            from app.services.budgets import check_workflow_budget

            try:
                breach = check_workflow_budget(db, workflow)
            except Exception:
                logger.exception(
                    "Skipping scheduled fire — budget check failed",
                    extra={"workflow_id": str(workflow.id)},
                )
                continue
            if breach:
                logger.warning(
                    "Skipping scheduled fire — budget breached",
                    extra={"workflow_id": str(workflow.id), "reason": breach},
                )
                continue
            if not _try_claim_schedule(schedule.id, minute_key):
                continue
            due.append(
                {
                    "workflow_id": workflow.id,
                    "version_id": version.id,
                    "user_id": workflow.user_id,
                    "schedule_id": schedule.id,
                    "minute_key": minute_key,
                }
            )
        return due
    finally:
        db.close()


def _create_scheduled_run_row(
    workflow_id: UUID,
    version_id: UUID,
    schedule_id: UUID | None = None,
    minute_key: str | None = None,
) -> UUID | None:
    """Insert the pending run row (blocking DB work — safe to run in a worker
    thread). Returns the run id to schedule on the event loop, or None when the
    run should not be started here (concurrency cap reached, or worker mode where
    a separate process claims it).

    Scheduling itself (asyncio.create_task via schedule_run) must NOT happen in
    this thread: it requires a running event loop, and doing it here raised
    "no running event loop", stranding every scheduled run as pending forever.
    The caller runs schedule_run on the loop instead.
    """
    if active_run_count() >= settings.max_concurrent_runs:
        if schedule_id is not None and minute_key is not None:
            # L5: the minute's claim was already consumed by _try_claim_schedule —
            # release it so a later tick inside this same minute retries the fire
            # instead of dropping it silently.
            _release_schedule_claim(schedule_id, minute_key)
        logger.warning(
            "Skipping scheduled run — max concurrent runs reached",
            extra={"workflow_id": str(workflow_id), "event": "schedule_skipped"},
        )
        return None
    db = SessionLocal()
    try:
        run = models.WorkflowRun(
            workflow_version_id=version_id,
            status="pending",
            input_text=json.dumps({"scheduled": True, "trigger": "cron"}),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        if settings.run_execution_mode == "worker":
            return None
        return run.id
    finally:
        db.close()


def _maybe_run_retention() -> None:
    global _last_retention_at
    if not settings.retention_enabled:
        return
    now = datetime.now(timezone.utc)
    if _last_retention_at and (now - _last_retention_at).total_seconds() < 86_400:
        return
    from app.services.retention import purge_old_runs

    deleted = purge_old_runs()
    _last_retention_at = now
    if deleted:
        logger.info("Retention purge completed", extra={"deleted_runs": deleted, "event": "retention_purge"})


def _evaluate_alerts() -> None:
    from app.services.alerts import evaluate_alert_rules

    db = SessionLocal()
    try:
        evaluate_alert_rules(db)
    finally:
        db.close()


_last_recovery_at: datetime | None = None


def _maybe_recover_stale_runs() -> None:
    """Periodically re-run boot recovery for rows young at boot time.

    Boot recovery skips young in-flight rows (they may belong to a live
    sibling after a rolling restart). Without this tick, an orphan created
    shortly before a restart would sit unrecovered until the *next* restart.
    This runs at most once per stale window and is a no-op in worker mode
    (the worker owns recovery there).
    """
    global _last_recovery_at
    from app.services.startup import recover_stale_runs

    if getattr(settings, "run_execution_mode", "inline") == "worker":
        return
    now = datetime.now(timezone.utc)
    window = max(60, int(getattr(settings, "run_stale_after_seconds", 900) or 900))
    if _last_recovery_at is not None and (now - _last_recovery_at).total_seconds() < window:
        return
    _last_recovery_at = now
    recovered = recover_stale_runs()
    if recovered:
        logger.info(
            "Periodic recovery re-queued stale run(s)",
            extra={"count": recovered, "event": "stale_runs_recovered"},
        )


def _sweep_stale_runs() -> None:
    """Reap runs left pending/running past the staleness window. Complements
    startup.recover_stale_runs for processes that stay up for days, where a
    scheduled fire that never progresses would otherwise pile up and (before the
    gate fix) wedge run creation with 429s."""
    from app.services.run_concurrency import sweep_stale_runs

    db = SessionLocal()
    try:
        sweep_stale_runs(db)
    finally:
        db.close()


async def _scheduler_loop() -> None:
    while True:
        try:
            if settings.schedule_enabled:
                due = await asyncio.to_thread(_scan_scheduled_workflows)
                for item in due:
                    # DB insert in a worker thread; schedule_run on the event loop
                    # (it calls asyncio.create_task, which needs a running loop).
                    run_id = await asyncio.to_thread(
                        _create_scheduled_run_row, item["workflow_id"], item["version_id"],
                        item.get("schedule_id"), item.get("minute_key"),
                    )
                    if run_id is not None:
                        schedule_run(run_id)
                        logger.info(
                            "Scheduled run created",
                            extra={
                                "workflow_id": str(item["workflow_id"]),
                                "run_id": str(run_id),
                                "event": "schedule_fired",
                            },
                        )
            # Recovery before sweep: aged orphans re-queue (with a fresh
            # resumed_at the sweeper honors) instead of being failed first.
            # resume_orphaned_runs then claims+schedules them inline, so the
            # tick both recovers and executes without waiting for a restart.
            await asyncio.to_thread(_maybe_recover_stale_runs)
            from app.services.startup import resume_orphaned_runs

            await resume_orphaned_runs()
            await asyncio.to_thread(_sweep_stale_runs)
            await asyncio.to_thread(_evaluate_alerts)
            await asyncio.to_thread(_maybe_run_retention)
        except Exception:
            logger.exception("Scheduler tick failed")
        # L4: sleep to the next minute boundary (capped at the configured
        # poll) instead of a fixed interval — a slow tick that overruns its
        # minute no longer skips the following minute silently; the next wake
        # lands on the boundary and the scan's cron_matches_now catches it.
        now = datetime.now(timezone.utc)
        to_boundary = 60 - (now.second + now.microsecond / 1e6) + 1
        await asyncio.sleep(min(to_boundary, max(15, settings.schedule_poll_seconds)))


def start_schedule_worker() -> None:
    global _scheduler_task
    if not settings.schedule_enabled:
        return
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("Schedule worker started", extra={"poll_seconds": settings.schedule_poll_seconds})


async def stop_schedule_worker() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    _scheduler_task = None


def scheduler_status() -> dict[str, object]:
    running = _scheduler_task is not None and not _scheduler_task.done()
    return {
        "enabled": settings.schedule_enabled,
        "running": running,
        "poll_seconds": settings.schedule_poll_seconds,
        "last_fired_workflows": None,
    }


def count_scheduled_workflows(graphs: list[dict]) -> int:
    total = 0
    for graph in graphs:
        total += len(_trigger_schedules(graph))
    return total