"""Hourly observability rollups updated on run completion."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models


def _bucket_hour(moment: datetime | None = None) -> datetime:
    now = moment or datetime.now(timezone.utc)
    # Normalise aware timestamps to UTC so buckets align with the live path
    # regardless of the source tz; naive values (SQLite) are already UTC.
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def record_run_rollup(
    db: Session,
    *,
    user_id: UUID,
    workflow_id: UUID | None,
    status: str,
    metrics: dict | None,
    occurred_at: datetime | None = None,
    run_id: UUID | None = None,
    attempt: int = 1,
) -> None:
    """Atomically increment the hourly rollup bucket for a finished run.

    Uses UPDATE … increment first; on a miss inserts a new row. Concurrent
    inserts hit the unique constraint and retry as UPDATE so increments are
    never dropped and never race-double-create.

    ``occurred_at`` selects the hour bucket — pass the run's timestamp when
    backfilling historical runs so they land in their real hour instead of all
    collapsing into the current one (audit P2-19). Defaults to now.

    ``run_id`` + ``attempt`` keep one logical run counted once: the ledger
    holds one row per run_id with the last-counted attempt and its exact
    contribution. A same-attempt refire is a no-op; a newer attempt subtracts
    the prior contribution from its original bucket and applies the new one,
    so a crash + checkpoint resume never double-counts and a changed outcome
    (failed attempt 1 → completed attempt 2) moves the count correctly.
    Callers without an attempt identity (backfill) pass run_id=None and keep
    the legacy always-count behavior.
    """
    metrics = metrics or {}
    bucket = _bucket_hour(occurred_at)
    completed_inc = 1 if status == "completed" else 0
    failed_inc = 1 if status == "failed" else 0
    guardrail_inc = 1 if metrics.get("guardrail_blocked") else 0
    eval_val = metrics.get("eval_aggregate")
    has_eval = isinstance(eval_val, (int, float))
    eval_inc = 1 if has_eval else 0
    eval_sum_inc = float(eval_val) if has_eval else 0.0

    if run_id is not None:
        # Atomic claim first: exactly one session wins the transition from
        # the observed attempt, so two concurrent replacements cannot both
        # subtract the prior contribution and both add the new one.
        claimed = _claim_ledger_transition(
            db, run_id, attempt, bucket, status,
            completed_inc, failed_inc, guardrail_inc, eval_inc, eval_sum_inc,
        )
        if claimed is None:
            # Another session counted this attempt or a newer one — no-op.
            return
        prior_bucket, prior_incs = claimed
        if prior_bucket is not None:
            # Won the replacement: subtract the old contribution from its
            # original bucket before adding the new one below.
            _adjust_bucket(
                db, user_id, workflow_id, prior_bucket,
                run_delta=-1,
                completed_delta=-prior_incs[0],
                failed_delta=-prior_incs[1],
                guardrail_delta=-prior_incs[2],
                eval_delta=-prior_incs[3],
                eval_sum_delta=-prior_incs[4],
            )
    _adjust_bucket(
        db, user_id, workflow_id, bucket,
        run_delta=1,
        completed_delta=completed_inc,
        failed_delta=failed_inc,
        guardrail_delta=guardrail_inc,
        eval_delta=eval_inc,
        eval_sum_delta=eval_sum_inc,
    )


def _adjust_bucket(
    db: Session,
    user_id: UUID,
    workflow_id: UUID | None,
    bucket,
    *,
    run_delta: int,
    completed_delta: int,
    failed_delta: int,
    guardrail_delta: int,
    eval_delta: int,
    eval_sum_delta: float,
) -> None:
    """Apply a signed increment to one bucket row, inserting on miss."""
    stmt = (
        update(models.ObservabilityRollup)
        .where(
            models.ObservabilityRollup.user_id == user_id,
            models.ObservabilityRollup.workflow_id == workflow_id,
            models.ObservabilityRollup.bucket_hour == bucket,
        )
        .values(
            run_count=models.ObservabilityRollup.run_count + run_delta,
            completed_count=models.ObservabilityRollup.completed_count + completed_delta,
            failed_count=models.ObservabilityRollup.failed_count + failed_delta,
            guardrail_blocked_count=(
                models.ObservabilityRollup.guardrail_blocked_count + guardrail_delta
            ),
            eval_sum=models.ObservabilityRollup.eval_sum + eval_sum_delta,
            eval_count=models.ObservabilityRollup.eval_count + eval_delta,
        )
    )
    if int(db.execute(stmt).rowcount or 0) > 0:
        return
    try:
        with db.begin_nested():
            db.add(models.ObservabilityRollup(
                id=uuid.uuid4(),
                user_id=user_id,
                workflow_id=workflow_id,
                bucket_hour=bucket,
                run_count=run_delta,
                completed_count=completed_delta,
                failed_count=failed_delta,
                guardrail_blocked_count=guardrail_delta,
                eval_sum=eval_sum_delta,
                eval_count=eval_delta,
            ))
            db.flush()
    except IntegrityError:
        # Concurrent insert won the unique key — apply as an increment.
        if int(db.execute(stmt).rowcount or 0) == 0:
            raise

def _claim_ledger_transition(
    db: Session,
    run_id: UUID,
    attempt: int,
    bucket,
    status: str,
    completed_inc: int,
    failed_inc: int,
    guardrail_inc: int,
    eval_inc: int,
    eval_sum_inc: float,
) -> tuple | None:
    """Claim the ledger move to ``attempt``; None when already counted.

    Returns ``(prior_bucket, prior_incs)`` — ``(None, …)`` on first insert.
    First insert races resolve via savepoint + PK conflict: the loser
    re-reads the winner's row and retries the claim as a replacement (or
    no-ops when the winner is already at/newer than ``attempt``).
    """
    from app.db import models as _models

    for _ in range(2):
        prior = db.get(_models.RunRollupLedger, run_id)
        if prior is not None and int(prior.attempt) >= attempt:
            return None
        if prior is None:
            try:
                with db.begin_nested():
                    db.add(_models.RunRollupLedger(
                        run_id=run_id, attempt=attempt, bucket_hour=bucket,
                        status=status, completed_inc=completed_inc,
                        failed_inc=failed_inc, guardrail_inc=guardrail_inc,
                        eval_inc=eval_inc, eval_sum_inc=eval_sum_inc,
                    ))
                    db.flush()
                return (None, (0, 0, 0, 0, 0.0))
            except IntegrityError:
                # Lost the insert race — the winner's row is now visible;
                # loop once to claim as a replacement (or no-op).
                continue
        # Snapshot BEFORE the UPDATE: bulk updates sync the in-session
        # instance to the new values, which would corrupt the subtraction.
        prior_attempt = int(prior.attempt)
        prior_bucket = prior.bucket_hour
        prior_incs = (
            int(prior.completed_inc), int(prior.failed_inc),
            int(prior.guardrail_inc), int(prior.eval_inc),
            float(prior.eval_sum_inc),
        )
        claimed = db.execute(
            update(_models.RunRollupLedger)
            .where(
                _models.RunRollupLedger.run_id == run_id,
                _models.RunRollupLedger.attempt == prior_attempt,
            )
            .values(
                attempt=attempt, bucket_hour=bucket, status=status,
                completed_inc=completed_inc, failed_inc=failed_inc,
                guardrail_inc=guardrail_inc, eval_inc=eval_inc,
                eval_sum_inc=eval_sum_inc,
            )
            .execution_options(synchronize_session=False)
        ).rowcount
        if claimed == 1:
            return (prior_bucket, prior_incs)
        # Lost the replacement race — expire the stale instance so the
        # retry's get re-reads the winner's row instead of the identity map.
        db.expire(prior)
    return None


def aggregate_rollups_for_user(db: Session, user_id: UUID) -> dict[str, Any]:
    """Aggregate hourly rollup rows for a user's workflows."""
    rows = (
        db.query(
            models.ObservabilityRollup.workflow_id,
            func.sum(models.ObservabilityRollup.run_count).label("run_count"),
            func.sum(models.ObservabilityRollup.completed_count).label("completed_count"),
            func.sum(models.ObservabilityRollup.failed_count).label("failed_count"),
            func.sum(models.ObservabilityRollup.eval_sum).label("eval_sum"),
            func.sum(models.ObservabilityRollup.eval_count).label("eval_count"),
            func.sum(models.ObservabilityRollup.guardrail_blocked_count).label("guardrail_blocked_count"),
        )
        .filter(models.ObservabilityRollup.user_id == user_id)
        .group_by(models.ObservabilityRollup.workflow_id)
        .all()
    )

    totals = {
        "run_count": 0,
        "completed_count": 0,
        "failed_count": 0,
        "eval_sum": 0.0,
        "eval_count": 0,
        "guardrail_blocked_count": 0,
    }
    per_workflow: dict[str, dict[str, Any]] = {}

    for row in rows:
        run_count = int(row.run_count or 0)
        completed_count = int(row.completed_count or 0)
        failed_count = int(row.failed_count or 0)
        eval_sum = float(row.eval_sum or 0)
        eval_count = int(row.eval_count or 0)
        guardrail_blocked = int(row.guardrail_blocked_count or 0)

        totals["run_count"] += run_count
        totals["completed_count"] += completed_count
        totals["failed_count"] += failed_count
        totals["eval_sum"] += eval_sum
        totals["eval_count"] += eval_count
        totals["guardrail_blocked_count"] += guardrail_blocked

        if row.workflow_id and eval_count > 0:
            wf_id = str(row.workflow_id)
            per_workflow[wf_id] = {
                "run_count": run_count,
                "eval_count": eval_count,
                "avg_eval_score": round(eval_sum / eval_count, 2),
            }

    leaderboard = [
        {
            "workflow_id": wf_id,
            "workflow_name": "",
            "run_count": data["run_count"],
            "avg_eval_score": data["avg_eval_score"],
        }
        for wf_id, data in per_workflow.items()
    ]
    leaderboard.sort(key=lambda row: row["avg_eval_score"], reverse=True)

    avg_eval = (
        round(totals["eval_sum"] / totals["eval_count"], 2) if totals["eval_count"] > 0 else None
    )
    status_counts: dict[str, int] = {}
    if totals["completed_count"]:
        status_counts["completed"] = totals["completed_count"]
    if totals["failed_count"]:
        status_counts["failed"] = totals["failed_count"]
    other = totals["run_count"] - totals["completed_count"] - totals["failed_count"]
    if other > 0:
        status_counts["other"] = other

    return {
        **totals,
        "avg_eval_score": avg_eval,
        "status_counts": status_counts,
        "workflow_eval_leaderboard": leaderboard[:10],
    }


def merge_rollup_quality(
    rollup_totals: dict[str, Any],
    recent_quality: dict[str, Any],
) -> dict[str, Any]:
    """Blend rollup aggregates with recent-run detail metrics."""
    merged = dict(recent_quality)
    if rollup_totals["eval_count"] > 0:
        merged["eval_run_count"] = max(
            int(rollup_totals["eval_count"]),
            int(recent_quality.get("eval_run_count") or 0),
        )
    if rollup_totals["guardrail_blocked_count"] > 0:
        guardrail_stats = dict(merged.get("guardrail_stats") or {})
        guardrail_stats["blocked_runs"] = max(
            int(rollup_totals["guardrail_blocked_count"]),
            int(guardrail_stats.get("blocked_runs") or 0),
        )
        merged["guardrail_stats"] = guardrail_stats

    rollup_leaderboard = rollup_totals.get("workflow_eval_leaderboard") or []
    if rollup_leaderboard and not merged.get("workflow_eval_leaderboard"):
        merged["workflow_eval_leaderboard"] = rollup_leaderboard

    return merged


def enrich_leaderboard_names(
    db: Session,
    leaderboard: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not leaderboard:
        return leaderboard
    workflow_ids = [UUID(row["workflow_id"]) for row in leaderboard if row.get("workflow_id")]
    if not workflow_ids:
        return leaderboard
    names = {
        str(row.id): row.name
        for row in db.query(models.Workflow.id, models.Workflow.name)
        .filter(models.Workflow.id.in_(workflow_ids))
        .all()
    }
    enriched: list[dict[str, Any]] = []
    for row in leaderboard:
        item = dict(row)
        if not item.get("workflow_name"):
            item["workflow_name"] = names.get(item["workflow_id"], item["workflow_id"])
        enriched.append(item)
    return enriched
