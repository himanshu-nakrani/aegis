from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user_id
from app.config import settings
from app.db import models
from app.db.database import get_db
from app.services.executor import active_run_count
from app.services.quality_metrics import aggregate_quality_metrics, enrich_run_summary
from app.services.schedule_info import list_user_scheduled_workflows
from app.services.schedule_worker import count_scheduled_workflows, scheduler_status

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/summary")
def observability_summary(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflows = (
        db.query(models.Workflow)
        .options(joinedload(models.Workflow.versions))
        .filter(models.Workflow.user_id == user_id)
        .all()
    )
    workflow_count = len(workflows)
    workflow_ids = [w.id for w in workflows]

    latest_graphs: list[dict] = []
    for workflow in workflows:
        if not workflow.versions:
            continue
        version = max(workflow.versions, key=lambda v: v.version_number)
        latest_graphs.append(version.graph_json)

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

    runs = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow))
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(models.Workflow.user_id == user_id)
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(100)
        .all()
    )

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
        "scheduled_workflow_count": count_scheduled_workflows(latest_graphs),
        "scheduled_workflows": list_user_scheduled_workflows(db, user_id),
        "active_runs": active_run_count(),
        "max_concurrent_runs": settings.max_concurrent_runs,
        "scheduler": scheduler_status(),
        "quality": aggregate_quality_metrics(runs),
        "recent_runs": [enrich_run_summary(r) for r in runs[:20]],
    }