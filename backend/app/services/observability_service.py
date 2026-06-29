"""Optimized observability queries and response builders."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import models
from app.services.executor import active_run_count
from app.services.observability_rollups import (
    aggregate_rollups_for_user,
    enrich_leaderboard_names,
    merge_rollup_quality,
)
from app.services.quality_metrics import aggregate_quality_metrics, enrich_run_summary
from app.services.schedule_info import list_user_scheduled_workflows
from app.services.schedule_worker import scheduler_status
from app.services.tracing import is_tracing_enabled


def _user_workflow_ids(db: Session, user_id: UUID) -> list[UUID]:
    rows = db.query(models.Workflow.id).filter(models.Workflow.user_id == user_id).all()
    return [row[0] for row in rows]


def _user_runs_query(db: Session, user_id: UUID, *, limit: int = 100):
    return (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow))
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(models.Workflow.user_id == user_id)
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(limit)
    )


def build_overview(db: Session, user_id: UUID) -> dict[str, Any]:
    workflow_ids = _user_workflow_ids(db, user_id)
    workflow_count = len(workflow_ids)

    knowledge_doc_count = 0
    memory_entry_count = 0
    if workflow_ids:
        knowledge_doc_count = (
            db.query(func.count(models.KnowledgeDocument.id))
            .filter(models.KnowledgeDocument.workflow_id.in_(workflow_ids))
            .scalar()
            or 0
        )
        memory_entry_count = (
            db.query(func.count(models.WorkflowMemory.id))
            .filter(models.WorkflowMemory.workflow_id.in_(workflow_ids))
            .scalar()
            or 0
        )

    rollup_totals = aggregate_rollups_for_user(db, user_id)
    runs = _user_runs_query(db, user_id, limit=100).all()

    status_counts: dict[str, int] = dict(rollup_totals.get("status_counts") or {})
    eval_scores: list[float] = []
    total_latency = 0
    latency_count = 0

    for run in runs:
        if not rollup_totals["run_count"]:
            status_counts[run.status] = status_counts.get(run.status, 0) + 1
        metrics = run.metrics_json or {}
        if metrics.get("eval_aggregate") is not None:
            eval_scores.append(float(metrics["eval_aggregate"]))
        if metrics.get("latency_ms") is not None:
            total_latency += int(metrics["latency_ms"])
            latency_count += 1

    run_count = rollup_totals["run_count"] or len(runs)
    avg_eval = rollup_totals.get("avg_eval_score")
    if avg_eval is None and eval_scores:
        avg_eval = round(sum(eval_scores) / len(eval_scores), 2)

    return {
        "workflow_count": workflow_count,
        "run_count": run_count,
        "status_counts": status_counts,
        "avg_eval_score": avg_eval,
        "avg_latency_ms": round(total_latency / latency_count) if latency_count else None,
        "knowledge_doc_count": knowledge_doc_count,
        "memory_entry_count": memory_entry_count,
        "scheduled_workflow_count": (
            db.query(func.count(models.WorkflowSchedule.id))
            .join(models.Workflow, models.Workflow.id == models.WorkflowSchedule.workflow_id)
            .filter(models.Workflow.user_id == user_id, models.WorkflowSchedule.enabled.is_(True))
            .scalar()
            or 0
        ),
        "scheduled_workflows": list_user_scheduled_workflows(db, user_id),
        "active_runs": active_run_count(),
        "max_concurrent_runs": settings.max_concurrent_runs,
        "scheduler": scheduler_status(),
        "tracing": {
            "enabled": is_tracing_enabled(),
            "ui_base_url": settings.otel_ui_base_url or None,
        },
    }


def build_quality(db: Session, user_id: UUID) -> dict[str, Any]:
    rollup_totals = aggregate_rollups_for_user(db, user_id)
    runs = _user_runs_query(db, user_id, limit=100).all()
    recent_quality = aggregate_quality_metrics(runs)
    merged = merge_rollup_quality(rollup_totals, recent_quality)
    leaderboard = enrich_leaderboard_names(
        db,
        merged.get("workflow_eval_leaderboard") or rollup_totals.get("workflow_eval_leaderboard") or [],
    )
    merged["workflow_eval_leaderboard"] = leaderboard
    return merged


def build_recent_runs(db: Session, user_id: UUID, *, limit: int = 20) -> list[dict[str, Any]]:
    runs = _user_runs_query(db, user_id, limit=limit).all()
    return [enrich_run_summary(r) for r in runs]


def build_summary(db: Session, user_id: UUID) -> dict[str, Any]:
    overview = build_overview(db, user_id)
    runs = _user_runs_query(db, user_id, limit=100).all()
    overview["quality"] = build_quality(db, user_id)
    overview["recent_runs"] = [enrich_run_summary(r) for r in runs[:20]]
    return overview