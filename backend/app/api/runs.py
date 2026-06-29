import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import models
from app.db.database import get_db
from app.schemas.run import RunCreate, RunListItem, RunResponse
from app.services.executor import cancel_run, schedule_run, stream_run_events

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _workflow_needs_gemini(graph_json: dict) -> bool:
    for node in graph_json.get("nodes", []):
        data = node.get("data", {}) or {}
        node_type = data.get("nodeType")
        if node_type in {"agent", "evaluation"}:
            return True
        if node_type == "tool" and data.get("toolType") == "search" and data.get("searchProvider", "google") == "google":
            return True
    return False


@router.get("", response_model=list[RunListItem])
def list_runs(db: Session = Depends(get_db)):
    runs = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow))
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(50)
        .all()
    )
    items: list[RunListItem] = []
    for run in runs:
        workflow = run.version.workflow if run.version else None
        items.append(
            RunListItem(
                id=run.id,
                workflow_version_id=run.workflow_version_id,
                workflow_id=workflow.id if workflow else None,
                workflow_name=workflow.name if workflow else None,
                status=run.status,
                input_text=run.input_text,
                final_output=run.final_output,
                created_at=run.created_at,
                completed_at=run.completed_at,
            )
        )
    return items


@router.post("", response_model=RunResponse)
async def create_run(payload: RunCreate, db: Session = Depends(get_db)):
    workflow = db.query(models.Workflow).filter(models.Workflow.id == payload.workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.version_id:
        version = (
            db.query(models.WorkflowVersion)
            .filter(
                models.WorkflowVersion.id == payload.version_id,
                models.WorkflowVersion.workflow_id == payload.workflow_id,
            )
            .first()
        )
    else:
        version = (
            db.query(models.WorkflowVersion)
            .filter(models.WorkflowVersion.workflow_id == payload.workflow_id)
            .order_by(models.WorkflowVersion.version_number.desc())
            .first()
        )

    if not version:
        raise HTTPException(status_code=404, detail="Workflow version not found")

    if _workflow_needs_gemini(version.graph_json) and not settings.google_api_key:
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_API_KEY is not configured. Add it to .env to run LLM workflows.",
        )

    run = models.WorkflowRun(
        workflow_version_id=version.id,
        status="pending",
        input_text=payload.input_text,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    schedule_run(run.id)

    return RunResponse(
        id=run.id,
        workflow_version_id=run.workflow_version_id,
        status=run.status,
        input_text=run.input_text,
        final_output=run.final_output,
        metrics_json=run.metrics_json,
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_at=run.created_at,
        node_results=[],
    )


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: UUID, db: Session = Depends(get_db)):
    run = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.node_results))
        .filter(models.WorkflowRun.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.delete("/{run_id}")
async def stop_run(run_id: UUID, db: Session = Depends(get_db)):
    run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in {"pending", "running"}:
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")

    cancelled = await cancel_run(str(run_id))
    if not cancelled:
        run.status = "cancelled"
        run.completed_at = run.completed_at or datetime.now(timezone.utc)
        db.commit()

    return {"status": "cancelled", "run_id": str(run_id)}


@router.get("/{run_id}/stream")
async def stream_run(run_id: UUID):
    async def event_generator():
        async for event in stream_run_events(str(run_id)):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")