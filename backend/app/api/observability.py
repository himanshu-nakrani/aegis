from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/summary")
def observability_summary(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow_count = (
        db.query(func.count(models.Workflow.id))
        .filter(models.Workflow.user_id == user_id)
        .scalar()
        or 0
    )

    runs = (
        db.query(models.WorkflowRun)
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
        "recent_runs": [
            {
                "run_id": str(r.id),
                "status": r.status,
                "created_at": r.created_at,
                "eval_aggregate": (r.metrics_json or {}).get("eval_aggregate"),
                "latency_ms": (r.metrics_json or {}).get("latency_ms"),
            }
            for r in runs[:20]
        ],
    }