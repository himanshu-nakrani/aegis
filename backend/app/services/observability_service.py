"""Optimized observability queries and response builders."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import models
from app.services.executor import active_run_count
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

    runs = _user_runs_query(db, user_id, limit=100).all()

    status_counts: dict[str, int] = {}
    eval_scores: list[float] = []
    total_latency = 0
    latency_count = 0

    for run in runs:
        status_counts[run.status] = status_counts.get(run.status, 0) + 1
        metrics = run.metrics_json or {}
        if metrics.get("eval_aggregate") is not None:
            eval_scores.append(float(metrics["eval_aggregate"]))
        if metrics.get("latency_ms") is not None:
            total_latency += int(metrics["latency_ms"])
            latency_count += 1

    return {
        "workflow_count": workflow_count,
        "run_count": len(runs),
        "status_counts": status_counts,
        "avg_eval_score": round(sum(eval_scores) / len(eval_scores), 2) if eval_scores else None,
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
    runs = _user_runs_query(db, user_id, limit=100).all()
    return aggregate_quality_metrics(runs)


def build_recent_runs(db: Session, user_id: UUID, *, limit: int = 20) -> list[dict[str, Any]]:
    runs = _user_runs_query(db, user_id, limit=limit).all()
    return [enrich_run_summary(r) for r in runs]


def build_summary(db: Session, user_id: UUID) -> dict[str, Any]:
    overview = build_overview(db, user_id)
    runs = _user_runs_query(db, user_id, limit=100).all()
    overview["quality"] = aggregate_quality_metrics(runs)
    overview["recent_runs"] = [enrich_run_summary(r) for r in runs[:20]]
    return overview