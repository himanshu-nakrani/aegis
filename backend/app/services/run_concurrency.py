"""Concurrency accounting for workflow runs.

The concurrency gate must reflect runs that could *plausibly still be
executing* — not every row ever left in a non-terminal state. Runs execute
in-process as asyncio tasks (see ``executor.active_run_count``); a
``pending``/``running`` row with no live task — orphaned by a crash, a restart,
or a scheduled fire that never progressed — can never resume. Counting those
rows lets a handful of zombies permanently exhaust ``max_concurrent_runs`` and
``429`` every future run (the failure this module fixes).

Two guards:

* :func:`count_active_runs` bounds the DB count by a staleness window so
  orphans age out of the gate.
* :func:`sweep_stale_runs` marks orphaned rows terminal, complementing
  ``startup.recover_stale_runs`` for long-lived processes where scheduled
  fires can accumulate pending rows over days.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models
from app.db.database import SessionLocal
from app.services.time_utils import db_utcnow, to_db_utc

logger = logging.getLogger("aegis.run_concurrency")

ACTIVE_STATUSES = ("pending", "running")
STALE_RUN_MESSAGE = "Run interrupted by server restart or crash"


def _stale_cutoff(db: Session) -> datetime:
    # A floor keeps a misconfigured tiny window from culling live runs.
    window = max(60, getattr(settings, "run_stale_after_seconds", 900))
    return to_db_utc(db, datetime.now(timezone.utc) - timedelta(seconds=window))


def count_active_runs(db: Session) -> int:
    """Count runs that could still be executing, ignoring stale orphans.

    In ``inline`` mode the authoritative signal is the in-memory task count
    (``executor.active_run_count``); this DB count is the cross-process signal
    used in ``worker`` mode. Either way, rows older than the staleness window
    are excluded so orphaned pending/running runs cannot wedge the gate.
    """
    return (
        db.query(func.count(models.WorkflowRun.id))
        .filter(models.WorkflowRun.status.in_(ACTIVE_STATUSES))
        .filter(models.WorkflowRun.created_at >= _stale_cutoff(db))
        .scalar()
        or 0
    )


def mark_run_unscheduled(run_id: uuid.UUID, reason: str) -> None:
    """Mark a committed run terminal when post-commit admission fails.

    Runs in a worker thread via ``asyncio.to_thread``; uses a fresh session so
    it never shares state with the request-scoped session.
    """
    session = SessionLocal()
    try:
        row = (
            session.query(models.WorkflowRun)
            .filter(models.WorkflowRun.id == run_id)
            .first()
        )
        if row is None or row.status not in ACTIVE_STATUSES:
            return
        row.status = "cancelled"
        row.final_output = reason
        row.completed_at = db_utcnow(session)
        session.commit()
    finally:
        session.close()


async def schedule_committed_run(
    run_id: uuid.UUID,
    *,
    before_schedule: Callable[[], None] | None = None,
) -> bool:
    """Admission-check then schedule a committed run (inline mode only).

    The run row was committed in a worker thread, so the pre-commit capacity
    check races with other requests scheduling in between. Re-checking here —
    adjacent to ``schedule_run`` with no interleaving await — restores the
    atomic check→schedule the pre-thread code had. An over-capacity run is
    marked cancelled rather than lingering pending until the staleness sweep.
    """
    from app.services.executor import active_run_count, schedule_run

    if active_run_count() < settings.max_concurrent_runs:
        if before_schedule is not None:
            before_schedule()
        schedule_run(run_id)
        return True
    await asyncio.to_thread(
        mark_run_unscheduled,
        run_id,
        f"Exceeded the concurrent-run limit ({settings.max_concurrent_runs})",
    )
    return False


def sweep_stale_runs(db: Session) -> int:
    """Mark orphaned pending/running runs (older than the staleness window) as
    failed, returning the count swept.

    Skips runs that still have a live in-process asyncio task (inline mode
    after a long human-approval pause), so a post-approval ``running`` row is
    not thrashing ``failed``→``completed``. Also treats ``awaiting_approval``
    as non-stale while younger than the approval timeout budget.
    """
    from app.services.executor import active_run_ids

    cutoff = _stale_cutoff(db)
    approval_window = max(
        60, int(getattr(settings, "approval_timeout_seconds", 3600) or 3600)
    )
    approval_cutoff = to_db_utc(
        db, datetime.now(timezone.utc) - timedelta(seconds=approval_window)
    )

    live_ids = active_run_ids()
    candidates = (
        db.query(models.WorkflowRun)
        .filter(
            models.WorkflowRun.status.in_(
                (*ACTIVE_STATUSES, "awaiting_approval", "queued")
            )
        )
        .filter(models.WorkflowRun.created_at < cutoff)
        .all()
    )
    stale = []
    for run in candidates:
        if run.id in live_ids or str(run.id) in live_ids:
            continue
        # Approval-parked runs may legitimately outlive run_stale_after_seconds.
        if run.status == "awaiting_approval" and run.created_at and run.created_at >= approval_cutoff:
            continue
        stale.append(run)
    if not stale:
        return 0

    now = db_utcnow(db)
    for run in stale:
        run.status = "failed"
        run.final_output = STALE_RUN_MESSAGE
        run.completed_at = now
        if not run.started_at:
            run.started_at = now

    db.commit()
    logger.warning(
        "Swept stale runs to failed",
        extra={"count": len(stale), "event": "stale_runs_swept"},
    )
    return len(stale)
