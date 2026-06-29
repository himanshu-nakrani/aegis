from fastapi import APIRouter, HTTPException, Query

from app.services.cron_utils import cron_is_valid, cron_next_runs
from app.services.node_registry import NODE_REGISTRY

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/nodes")
def list_node_types():
    return {"nodes": NODE_REGISTRY}


@router.get("/cron-preview")
def preview_cron(
    expr: str = Query(..., min_length=1),
    count: int = Query(default=3, ge=1, le=10),
):
    if not cron_is_valid(expr):
        raise HTTPException(status_code=400, detail="Invalid cron expression")
    runs = cron_next_runs(expr, count=count)
    return {
        "expr": expr.strip(),
        "next_runs": [dt.isoformat() for dt in runs],
    }