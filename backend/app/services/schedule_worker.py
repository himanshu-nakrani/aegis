"""Background cron scheduler for workflow Trigger nodes (n8n Schedule Trigger)."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from croniter import croniter
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.executor import active_run_count, schedule_run
from app.services.graph_validation import GraphValidationError, validate_workflow_graph

logger = logging.getLogger("aegis.scheduler")

_scheduler_task: asyncio.Task[None] | None = None
_last_retention_at: datetime | None = None

# Set when a capacity-skip releases a minute claim — tells the scheduler loop
# a same-minute re-scan is worthwhile (the boundary sleep below would land in
# the NEXT minute and lose the fire entirely).
_capacity_retry = threading.Event()
_CAPACITY_RETRY_DELAY_SECONDS = 15.0
_CAPACITY_RETRY_MIN_RUNWAY_SECONDS = 20.0
# Minutes whose claim was given back (capacity skip or a failed insert).
# The next tick scans them again even though they are already "scanned",
# so a released fire is not dropped on the floor. Bounded by the catch-up cap.
_retry_minutes: set[str] = set()
_last_scanned_minute: datetime | None = None
_CATCHUP_MINUTES = 5


def cron_matches_now(cron_expr: str, now: datetime | None = None) -> bool:
    moment = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    try:
        itr = croniter(cron_expr.strip(), moment - timedelta(minutes=1))
        next_fire = itr.get_next(datetime).replace(second=0, microsecond=0)
        return next_fire == moment
    except (ValueError, KeyError):
        return False


def should_fire_schedule(workflow_id: str, minute_key: str, fired: dict[str, str]) -> bool:
    """In-memory dedup helper (tests); production claims via the run row."""
    if fired.get(workflow_id) == minute_key:
        return False
    fired[workflow_id] = minute_key
    return True


def _schedule_minute_claimed(db, schedule_id: UUID, minute_key: str) -> bool:
    """Durable per-minute claim check: the pending run row IS the claim.

    Replaces the old ``workflow_schedules.last_fired_at`` CAS, which could only
    hold one stamp per schedule — catch-up claiming several minutes overwrote
    the earlier stamp, so a released minute either never came back (lost fire)
    or clearing the stamp made already-fired minutes claimable again (double
    fire). A run row per (schedule, minute) survives restarts and cannot lie
    about which minutes ran.
    """
    return (
        db.query(models.WorkflowRun.id)
        .filter(
            models.WorkflowRun.schedule_id == schedule_id,
            models.WorkflowRun.minute_key == minute_key,
        )
        .first()
        is not None
    )




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



def _catchup_minutes(now: datetime) -> list[datetime]:
    """Minutes to scan on this tick.

    A tick that starts in minute M and finishes in M+k used to sleep to the
    following boundary and never look at the minutes it crossed. Scan each
    minute strictly after the last scanned one through ``now``, capped so a
    long outage does not replay a day of crons. Re-scanning a minute is safe:
    the DB claim is what prevents a double fire.
    """
    current = now.replace(second=0, microsecond=0)
    last = _last_scanned_minute
    if last is None or last >= current:
        minutes = [current]
    else:
        earliest = current - timedelta(minutes=_CATCHUP_MINUTES - 1)
        start = max(last + timedelta(minutes=1), earliest)
        minutes = []
        cursor = start
        while cursor <= current:
            minutes.append(cursor)
            cursor += timedelta(minutes=1)
        if not minutes:
            minutes = [current]
    earliest = current - timedelta(minutes=_CATCHUP_MINUTES - 1)
    stale = [key for key in _retry_minutes if _minute_key_dt(key) < earliest]
    for key in stale:
        _retry_minutes.discard(key)
    seen = set(minutes)
    for key in list(_retry_minutes):
        moment = _minute_key_dt(key)
        if moment not in seen and earliest <= moment <= current:
            minutes.append(moment)
            seen.add(moment)
    minutes.sort()
    return minutes


def _minute_key_dt(minute_key: str) -> datetime:
    return datetime.strptime(minute_key, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)


def _scan_scheduled_workflows(at: datetime | None = None) -> list[dict[str, Any]]:
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
        moment = at or datetime.now(timezone.utc)
        minute = moment.replace(second=0, microsecond=0)
        minute_key = minute.strftime("%Y-%m-%dT%H:%M")

        for schedule, workflow, version in rows:
            if not cron_matches_now(schedule.cron_expr, minute):
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
            # The run row is the claim: a minute that already produced one
            # (pending, running, finished — any status) never fires again.
            # This is a cheap pre-check; the unique index on
            # workflow_runs(schedule_id, minute_key) makes the actual claim
            # atomic when two schedulers race the insert.
            if _schedule_minute_claimed(db, schedule.id, minute_key):
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
    """Claim the fire minute by inserting its pending run row.

    The row IS the claim: ``workflow_runs(schedule_id, minute_key)`` is unique,
    so a concurrent scheduler (or a re-scan of this minute) loses atomically on
    insert instead of racing a mutable ``last_fired_at`` stamp. That removes the
    old release path entirely — a minute without a run row was never claimed,
    so a capacity skip or a failed insert only needs the in-memory
    ``_retry_minutes`` nudge to be re-scanned on the next tick.

    Returns the run id to schedule on the event loop, or None when the run
    should not be started here (concurrency cap, duplicate claim, or worker
    mode where a separate process claims pending rows).

    Scheduling itself (asyncio.create_task via schedule_run) must NOT happen in
    this thread: it requires a running event loop, and doing it here raised
    "no running event loop", stranding every scheduled run as pending forever.
    The caller runs schedule_run on the loop instead.
    """
    if active_run_count() >= settings.max_concurrent_runs:
        # No run row exists, so the minute stays unclaimed — but the normal
        # catch-up window may never cover it again, so keep it in the retry
        # set and wake the loop's same-tick retry pass.
        if minute_key is not None:
            _retry_minutes.add(minute_key)
        _capacity_retry.set()
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
            schedule_id=schedule_id,
            minute_key=minute_key,
        )
        db.add(run)
        try:
            db.commit()
        except IntegrityError:
            # Unique (schedule_id, minute_key): a sibling claimed this minute
            # first (or the scan raced a successful fire). Not an error.
            db.rollback()
            if minute_key is not None:
                _retry_minutes.discard(minute_key)
            return None
        if minute_key is not None:
            _retry_minutes.discard(minute_key)
        db.refresh(run)
        if schedule_id is not None:
            # Display-only stamp; claim correctness no longer depends on it.
            try:
                sched = db.get(models.WorkflowSchedule, schedule_id)
                if sched is not None:
                    window = _minute_key_dt(minute_key) if minute_key else None
                    if window is not None and (
                        sched.last_fired_at is None or sched.last_fired_at < window
                    ):
                        sched.last_fired_at = window
                        db.commit()
            except Exception:  # noqa: BLE001 — informational only
                db.rollback()
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


async def _dispatch_due_runs(due: list[dict[str, Any]]) -> None:
    """Create + schedule the run rows for one scan's worth of due schedules."""
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


def _seconds_left_in_minute(now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    return 60 - (now.second + now.microsecond / 1e6)


async def _scheduler_loop() -> None:
    while True:
        try:
            if settings.schedule_enabled:
                global _last_scanned_minute
                minutes = _catchup_minutes(datetime.now(timezone.utc))
                due: list[dict[str, Any]] = []
                for minute in minutes:
                    due.extend(await asyncio.to_thread(_scan_scheduled_workflows, minute))
                # Record the minutes we actually looked at, not the minute the
                # tick finishes in. An overrun then catches the gap next tick.
                _last_scanned_minute = minutes[-1]
                await _dispatch_due_runs(due)
                # L5: a capacity-skipped fire released its minute claim —
                # re-scan inside this minute while runway remains. Without
                # this, the boundary sleep (L4) lands in the NEXT minute and
                # cron_matches_now no longer matches — the fire is lost.
                # Self-bounding: each retry sleeps _CAPACITY_RETRY_DELAY and
                # the minute ends the loop.
                while _capacity_retry.is_set():
                    _capacity_retry.clear()
                    remaining = _seconds_left_in_minute()
                    if remaining < _CAPACITY_RETRY_MIN_RUNWAY_SECONDS:
                        break
                    await asyncio.sleep(
                        min(_CAPACITY_RETRY_DELAY_SECONDS, remaining - 2)
                    )
                    due = await asyncio.to_thread(_scan_scheduled_workflows)
                    await _dispatch_due_runs(due)
                # A skip in the last retry pass left the event set with no
                # runway to act on — drop it so the next tick doesn't burn a
                # stale re-scan.
                _capacity_retry.clear()
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
        # Sleep toward the next minute boundary (capped at the configured
        # poll). The boundary sleep only helps when the tick finishes inside
        # the minute it scanned; missed minutes are recovered by
        # _catchup_minutes on the next tick.
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