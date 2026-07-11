"""Hourly observability rollups updated on run completion."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import models


def _bucket_hour(moment: datetime | None = None) -> datetime:
    now = moment or datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def record_run_rollup(
    db: Session,
    *,
    user_id: UUID,
    workflow_id: UUID | None,
    status: str,
    metrics: dict | None,
) -> None:
    metrics = metrics or {}
    bucket = _bucket_hour()
    row = (
        db.query(models.ObservabilityRollup)
        .filter(
            models.ObservabilityRollup.user_id == user_id,
            models.ObservabilityRollup.workflow_id == workflow_id,
            models.ObservabilityRollup.bucket_hour == bucket,
        )
        .first()
    )
    if not row:
        row = models.ObservabilityRollup(
            user_id=user_id,
            workflow_id=workflow_id,
            bucket_hour=bucket,
        )
        db.add(row)

    # Column defaults only apply at flush; freshly added rows hold None here.
    row.run_count = (row.run_count or 0) + 1
    if status == "completed":
        row.completed_count = (row.completed_count or 0) + 1
    elif status == "failed":
        row.failed_count = (row.failed_count or 0) + 1
    if metrics.get("guardrail_blocked"):
        row.guardrail_blocked_count = (row.guardrail_blocked_count or 0) + 1
    if metrics.get("eval_aggregate") is not None:
        row.eval_sum = (row.eval_sum or 0.0) + float(metrics["eval_aggregate"])
        row.eval_count = (row.eval_count or 0) + 1


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