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

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import models

logger = logging.getLogger("aegis.run_concurrency")

ACTIVE_STATUSES = ("pending", "running")
STALE_RUN_MESSAGE = "Run interrupted by server restart or crash"


def _utcnow_naive() -> datetime:
    # Naive UTC to match created_at populated by func.now() (SQLite stores it
    # naive); comparing tz-aware values against those rows fails on SQLite.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stale_cutoff() -> datetime:
    # A floor keeps a misconfigured tiny window from culling live runs.
    window = max(60, getattr(settings, "run_stale_after_seconds", 900))
    return _utcnow_naive() - timedelta(seconds=window)


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
        .filter(models.WorkflowRun.created_at >= _stale_cutoff())
        .scalar()
        or 0
    )


def sweep_stale_runs(db: Session) -> int:
    """Mark orphaned pending/running runs (older than the staleness window) as
    failed, returning the count swept.

    No-op in ``worker`` mode, where the dedicated worker process owns recovery
    of the runs it is actively executing (mirrors ``recover_stale_runs``).
    """
    if getattr(settings, "run_execution_mode", "inline") == "worker":
        return 0

    cutoff = _stale_cutoff()
    stale = (
        db.query(models.WorkflowRun)
        .filter(models.WorkflowRun.status.in_(ACTIVE_STATUSES))
        .filter(models.WorkflowRun.created_at < cutoff)
        .all()
    )
    if not stale:
        return 0

    now = _utcnow_naive()
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
