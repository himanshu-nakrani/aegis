import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user_id
from app.config import settings
from app.db import models
from app.db.database import SessionLocal, get_db
from app.schemas.run import (
    RunApprovalPayload,
    RunCreate,
    RunListItem,
    RunResponse,
    RunTimelineResponse,
    TimelineNode,
)
from app.services.approval_service import submit_approval
from app.services.executor import (
    active_run_count,
    cancel_run,
    register_authoring_overrides,
    schedule_run,
    stream_run_events,
)
from app.services.run_concurrency import count_active_runs
from app.services.run_filters import apply_run_quality_sql_filters
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.workflow_capabilities import workflow_needs_gemini

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _get_user_run(db: Session, run_id: UUID, user_id: UUID) -> models.WorkflowRun:
    run = (
        db.query(models.WorkflowRun)
        .options(
            joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow),
            joinedload(models.WorkflowRun.node_results),
        )
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(models.WorkflowRun.id == run_id, models.Workflow.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("", response_model=list[RunListItem])
def list_runs(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    status_filter: str | None = Query(default=None, alias="status"),
    eval_passed: bool | None = Query(default=None),
    guardrail_blocked: bool | None = Query(default=None),
    has_eval: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    query = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow))
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(models.Workflow.user_id == user_id)
    )
    if status_filter:
        query = query.filter(models.WorkflowRun.status == status_filter)
    query = apply_run_quality_sql_filters(
        query,
        has_eval=has_eval,
        eval_passed=eval_passed,
        guardrail_blocked=guardrail_blocked,
    )
    runs = (
        query.order_by(models.WorkflowRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items: list[RunListItem] = []
    for run in runs:
        workflow = run.version.workflow if run.version else None
        metrics = run.metrics_json or {}
        run_eval_passed = metrics.get("eval_passed")
        run_guardrail_blocked = bool(metrics.get("guardrail_blocked"))
        run_eval_aggregate = metrics.get("eval_aggregate")
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
                eval_aggregate=float(run_eval_aggregate) if run_eval_aggregate is not None else None,
                eval_passed=run_eval_passed,
                guardrail_blocked=run_guardrail_blocked,
            )
        )
    return items


@router.post("", response_model=RunResponse)
async def create_run(
    payload: RunCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == payload.workflow_id, models.Workflow.user_id == user_id)
        .first()
    )
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

    if not (payload.input_text or "").strip():
        raise HTTPException(status_code=400, detail="input_text is required")

    from app.services.budgets import check_workflow_budget

    budget_breach = check_workflow_budget(db, workflow)
    if budget_breach:
        raise HTTPException(status_code=429, detail=budget_breach)

    try:
        validate_workflow_graph(version.graph_json)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # In "inline" mode the authoritative concurrency signal is the in-memory
    # asyncio-task count; the (staleness-bounded) DB count is only needed as the
    # cross-process signal in "worker" mode. Counting raw pending/running rows
    # let orphaned runs (crash/restart/stuck scheduled fires) permanently exhaust
    # the limit and 429 every future run — see services/run_concurrency.
    in_memory_runs = active_run_count()
    if settings.run_execution_mode == "worker":
        active = max(in_memory_runs, count_active_runs(db))
    else:
        active = in_memory_runs
    if active >= settings.max_concurrent_runs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
        )

    if workflow_needs_gemini(version.graph_json) and not settings.google_api_key:
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_API_KEY is not configured. Add it to .env to run LLM workflows.",
        )

    # Authoring-only pin/run-from-here validation (builder UI only; guarded off
    # the published invoke path, which never sets these). Validate against the
    # version graph before scheduling so a bad node id fails fast with a 400.
    if payload.pinned_outputs or payload.start_node_id:
        node_ids = {n.get("id") for n in (version.graph_json or {}).get("nodes", [])}
        if payload.start_node_id and payload.start_node_id not in node_ids:
            raise HTTPException(
                status_code=400,
                detail=f"start_node_id '{payload.start_node_id}' is not a node in this workflow.",
            )
        for pinned_id in (payload.pinned_outputs or {}):
            if pinned_id not in node_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"pinned_outputs references unknown node '{pinned_id}'.",
                )

    run = models.WorkflowRun(
        workflow_version_id=version.id,
        status="pending",
        input_text=payload.input_text,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    register_authoring_overrides(
        run.id,
        pinned_outputs=payload.pinned_outputs,
        start_node_id=payload.start_node_id,
    )

    if settings.run_execution_mode == "worker":
        pass
    else:
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
def get_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return _get_user_run(db, run_id, user_id)


@router.get("/{run_id}/llm-calls")
def get_run_llm_calls(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_run(db, run_id, user_id)  # ownership check
    calls = (
        db.query(models.LlmCall)
        .filter(models.LlmCall.run_id == run_id)
        .order_by(models.LlmCall.created_at)
        .all()
    )
    return [
        {
            "id": str(c.id),
            "node_id": c.node_id,
            "model": c.model,
            "prompt_text": c.prompt_text,
            "completion_text": c.completion_text,
            "prompt_tokens": c.prompt_tokens,
            "completion_tokens": c.completion_tokens,
            "thinking_tokens": c.thinking_tokens,
            "total_tokens": c.total_tokens,
            "cost_usd": c.cost_usd,
            "latency_ms": c.latency_ms,
        }
        for c in calls
    ]


def _as_utc(dt: datetime) -> datetime:
    """Normalize DB-loaded (possibly naive) datetimes to aware UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/{run_id}/timeline", response_model=RunTimelineResponse)
def get_run_timeline(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Node executions as a waterfall (offset+width spans) for canvas replay.

    Offsets are derived from each NodeResult's ``created_at`` (recorded at node
    completion) minus its ``latency_ms``, relative to the run's ``started_at``.
    Serialization only — no schema change (NodeResult.started_at was not added).
    """
    run = _get_user_run(db, run_id, user_id)

    results = (
        db.query(models.NodeResult)
        .filter(models.NodeResult.run_id == run_id)
        .order_by(models.NodeResult.created_at.asc())
        .all()
    )

    run_start = _as_utc(run.started_at) if run.started_at else None
    # Fallback anchor: if the run never recorded started_at, anchor at the first
    # node's derived start so offsets stay non-negative and relative.
    if run_start is None and results:
        first = results[0]
        first_latency = first.latency_ms or 0
        run_start = _as_utc(first.created_at) - timedelta(milliseconds=first_latency)

    # Label lookup from the version graph when available.
    label_by_node: dict[str, str] = {}
    graph = (run.version.graph_json if run.version else None) or {}
    for node in graph.get("nodes", []):
        data = node.get("data") or {}
        label = data.get("label")
        if node.get("id") and label:
            label_by_node[str(node["id"])] = label

    nodes: list[TimelineNode] = []
    for nr in results:
        latency = nr.latency_ms or 0
        completed_at = _as_utc(nr.created_at)
        node_start = completed_at - timedelta(milliseconds=latency)
        if run_start is not None:
            start_offset_ms = max(0, int((node_start - run_start).total_seconds() * 1000))
        else:
            start_offset_ms = 0
        nodes.append(
            TimelineNode(
                node_id=nr.node_id,
                node_type=nr.node_type,
                label=label_by_node.get(nr.node_id) or nr.node_label,
                status=nr.status,
                latency_ms=nr.latency_ms,
                start_offset_ms=start_offset_ms,
                duration_ms=max(0, latency),
            )
        )

    total_duration_ms = None
    if run.started_at and run.completed_at:
        total_duration_ms = max(
            0, int((_as_utc(run.completed_at) - _as_utc(run.started_at)).total_seconds() * 1000)
        )

    return RunTimelineResponse(
        run_id=run.id,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        total_duration_ms=total_duration_ms,
        nodes=nodes,
    )


@router.get("/{run_id}/export")
def export_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    run = _get_user_run(db, run_id, user_id)
    workflow = run.version.workflow if run.version else None
    payload = {
        "run_id": str(run.id),
        "workflow_id": str(workflow.id) if workflow else None,
        "workflow_name": workflow.name if workflow else None,
        "status": run.status,
        "input_text": run.input_text,
        "final_output": run.final_output,
        "metrics_json": run.metrics_json,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "node_results": [
            {
                "node_id": nr.node_id,
                "node_label": nr.node_label,
                "node_type": nr.node_type,
                "status": nr.status,
                "output": nr.output,
                "evaluation_scores": nr.evaluation_scores,
                "guardrail_status": nr.guardrail_status,
                "latency_ms": nr.latency_ms,
                "token_usage": nr.token_usage,
            }
            for nr in (run.node_results or [])
        ],
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="run-{run_id}.json"'},
    )


@router.post("/{run_id}/approve")
def approve_run(
    run_id: UUID,
    payload: RunApprovalPayload,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Resume a run paused at a Human Approval node."""
    run = _get_user_run(db, run_id, user_id)
    if run.status != "awaiting_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Run is not awaiting approval (status: {run.status})",
        )

    submit_approval(str(run_id), approved=payload.approved, comment=payload.comment or "")
    metrics = dict(run.metrics_json or {})
    metrics.pop("pending_approval", None)
    metrics["approval_decision"] = {
        "approved": payload.approved,
        "comment": payload.comment,
    }
    run.metrics_json = metrics
    if payload.approved:
        run.status = "running"
    else:
        run.status = "failed"
        run.completed_at = run.completed_at or datetime.now(timezone.utc)
        run.final_output = payload.comment or "Approval rejected"
    db.commit()

    return {
        "status": "running" if payload.approved else "failed",
        "run_id": str(run_id),
        "approved": payload.approved,
    }


@router.delete("/{run_id}")
async def stop_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    run = _get_user_run(db, run_id, user_id)
    if run.status not in {"pending", "running", "queued", "awaiting_approval"}:
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")

    cancelled = await cancel_run(str(run_id))
    if not cancelled:
        run.status = "cancelled"
        run.completed_at = run.completed_at or datetime.now(timezone.utc)
        db.commit()

    return {"status": "cancelled", "run_id": str(run_id)}


_TERMINAL_RUN_STATES = {"completed", "failed", "cancelled"}


def _terminal_run_events(run: models.WorkflowRun) -> list[dict]:
    """Build synthetic SSE events mirroring the executor's terminal emissions.

    A client reconnecting after a run finished (or after the in-memory event
    TTL expired) would otherwise only receive heartbeats forever, since the
    executor's event broker is gone. Reconstruct the terminal event from the DB
    row so the stream ends cleanly.
    """
    run_key = str(run.id)
    if run.status == "completed":
        node_results = [
            {
                "node_id": nr.node_id,
                "node_label": nr.node_label,
                "node_type": nr.node_type,
                "status": nr.status,
                "output": nr.output,
                "evaluation_scores": nr.evaluation_scores,
                "guardrail_status": nr.guardrail_status,
                "latency_ms": nr.latency_ms,
            }
            for nr in (run.node_results or [])
        ]
        terminal = {
            "type": "run_completed",
            "run_id": run_key,
            "final_output": run.final_output,
            "metrics": run.metrics_json or {},
            "node_results": node_results,
        }
    elif run.status == "cancelled":
        terminal = {"type": "run_cancelled", "run_id": run_key}
    else:  # failed
        terminal = {
            "type": "run_failed",
            "run_id": run_key,
            "error": run.final_output or "Run failed",
        }
    return [terminal, {"type": "stream_end"}]


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
):
    db = SessionLocal()
    try:
        run = _get_user_run(db, run_id, user_id)
        terminal_events = (
            _terminal_run_events(run) if run.status in _TERMINAL_RUN_STATES else None
        )
    finally:
        db.close()

    async def event_generator():
        if terminal_events is not None:
            for event in terminal_events:
                yield f"data: {json.dumps(event, default=str)}\n\n"
            return
        async for event in stream_run_events(str(run_id)):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")