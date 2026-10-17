"""Platform surface: publish/rollback, stable invoke API, external trace ingestion, audit."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from fastapi import status

from app.auth.deps import get_current_user_id, get_owner_user_id
from app.config import settings
from app.db import models
from app.db.database import get_db
from app.services.audit import record_audit
from app.services.deploy_descriptor import (
    _sanitize_tool_name,
    build_deploy_descriptor,
    build_mcp_input_schema,
)
from app.services.deployments import (
    CredentialKind, credential_status, issue_credential,
    owner_published_workflow, revoke_credential, sync_deployment,
)
from app.services.executor import schedule_run, stream_run_events
from app.services.async_tasks import schedule_task
from app.services.run_concurrency import schedule_committed_run
from app.services.schedule_sync import sync_workflow_schedule
from app.services.invoke_runner import (
    create_invoked_run as _create_invoked_run,
    poll_run_terminal_result as _poll_run_terminal_result,
)
from app.services.otlp_ingest import (
    ingest_otlp_run,
    is_otlp_payload,
    resolve_external_workflow,
)

router = APIRouter(tags=["platform"])


# ---------- publish / rollback (environments-lite) ----------


class PublishPayload(BaseModel):
    version_id: UUID


@router.post("/api/workflows/{workflow_id}/publish")
def publish_version(
    workflow_id: UUID,
    payload: PublishPayload,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
        .with_for_update().first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    version = (
        db.query(models.WorkflowVersion)
        .filter(
            models.WorkflowVersion.id == payload.version_id,
            models.WorkflowVersion.workflow_id == workflow_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    previous = workflow.published_version_id
    workflow.published_version_id = version.id
    sync_deployment(db, workflow)
    # Schedules follow the published graph: re-pin rows to the published
    # version so cron fires what /v1/invoke serves (draft saves never touch
    # schedules once published — see save_version/import_into_workflow).
    sync_workflow_schedule(
        db,
        workflow_id=workflow_id,
        version_id=version.id,
        graph_json=version.graph_json or {},
    )
    record_audit(
        db,
        user_id,
        "publish",
        "workflow",
        workflow_id,
        {"version": version.version_number, "previous_version_id": str(previous) if previous else None},
    )
    db.commit()
    return {
        "workflow_id": str(workflow_id),
        "published_version_id": str(version.id),
        "published_version_number": version.version_number,
    }


@router.get("/api/workflows/{workflow_id}/published")
def get_published(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
        .first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    version_number = None
    if workflow.published_version_id:
        version = (
            db.query(models.WorkflowVersion)
            .filter(models.WorkflowVersion.id == workflow.published_version_id)
            .first()
        )
        version_number = version.version_number if version else None
    return {
        "published_version_id": str(workflow.published_version_id)
        if workflow.published_version_id
        else None,
        "published_version_number": version_number,
    }


@router.get("/api/workflows/{workflow_id}/deploy")
def get_deploy_descriptor(
    workflow_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Deploy descriptor for the currently-published version.

    Returns the stable invoke URL, a ready-to-paste cURL snippet, and an MCP
    tool descriptor whose input schema is derived from the workflow's
    input_schema node. 409 when no version has been published yet.
    """
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
        .first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not workflow.published_version_id:
        raise HTTPException(
            status_code=409,
            detail="Workflow has no published version. Publish a version before deploying.",
        )
    version = (
        db.query(models.WorkflowVersion)
        .filter(
            models.WorkflowVersion.id == workflow.published_version_id,
            models.WorkflowVersion.workflow_id == workflow_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(
            status_code=409,
            detail="Published version no longer exists. Re-publish a version before deploying.",
        )

    deployment = db.query(models.WorkflowDeployment).filter(
        models.WorkflowDeployment.workflow_id == workflow_id,
        models.WorkflowDeployment.version_id == version.id,
    ).first()
    base_url = str(request.base_url).rstrip("/")
    return build_deploy_descriptor(
        workflow_id=str(workflow_id),
        workflow_name=workflow.name,
        description=workflow.description,
        published_version_id=str(version.id),
        published_version_number=version.version_number,
        graph_json=version.graph_json or {},
        base_url=base_url,
        **credential_status(deployment),
    )


@router.post("/api/workflows/{workflow_id}/deploy/credentials/{kind}")
def provision_deployment_credential(
    workflow_id: UUID,
    kind: CredentialKind,
    response: Response,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_owner_user_id),
):
    workflow = owner_published_workflow(db, workflow_id, user_id)
    deployment, secret = issue_credential(db, workflow, kind)
    record_audit(db, user_id, "rotate_deployment_credential", "workflow", workflow_id, {"kind": kind})
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return {"kind": kind, "secret": secret, "version_id": str(deployment.version_id), **credential_status(deployment)}


@router.delete("/api/workflows/{workflow_id}/deploy/credentials/{kind}")
def revoke_deployment_credential(
    workflow_id: UUID,
    kind: CredentialKind,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_owner_user_id),
):
    workflow = owner_published_workflow(db, workflow_id, user_id)
    deployment = revoke_credential(db, workflow, kind)
    record_audit(db, user_id, "revoke_deployment_credential", "workflow", workflow_id, {"kind": kind})
    db.commit()
    return credential_status(deployment)


# ---------- stable invoke API (workflow-as-API) ----------


class InvokePayload(BaseModel):
    input: str = Field(min_length=1, max_length=20_000)
    # Thread multi-turn calls into one session (e.g. a chatbot conversation)
    # and tag them for filtering — surfaced in the observability Sessions view.
    session_id: str | None = Field(default=None, max_length=128)
    tags: list[str] | None = None
    version_id: UUID | None = None


class GenericInvokePayload(InvokePayload):
    workflow_id: UUID





@router.post("/v1/workflows/{workflow_id}/invoke")
async def invoke_workflow(
    workflow_id: UUID,
    payload: InvokePayload,
    request: Request,
    wait: bool = Query(default=False, description="Block until the run finishes (max 90s)"),
    stream: bool = Query(default=False, description="Stream run events as SSE"),
    db: Session = Depends(get_db),
):
    """Run only the authenticated deployment's pinned published version."""
    if wait and stream:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="wait and stream are mutually exclusive",
        )
    raw_body = await request.body()
    create = asyncio.ensure_future(
        asyncio.to_thread(_create_invoked_run, db, workflow_id, payload, dict(request.headers), raw_body, request.url.path)
    )
    try:
        run_id, version_number = await asyncio.shield(create)
    except asyncio.CancelledError:
        # to_thread is not cancellable — the commit still lands. Preserve the
        # pre-thread contract (a committed run always gets scheduled) so the
        # row does not linger pending until the staleness sweep.
        run_id, _ = await create
        if settings.run_execution_mode != "worker":
            schedule_run(run_id)
        raise

    if settings.run_execution_mode != "worker":
        if not await schedule_committed_run(run_id):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many concurrent runs (limit: {settings.max_concurrent_runs})",
            )

    if stream:
        async def event_generator():
            yield "retry: 3000\n\n"
            async for event in stream_run_events(str(run_id)):
                seq = event.get("seq")
                if isinstance(seq, int):
                    yield f"id: {seq}\ndata: {json.dumps(event, default=str)}\n\n"
                else:
                    yield f"data: {json.dumps(event, default=str)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if not wait:
        return {"run_id": str(run_id), "status": "pending", "version": version_number}

    deadline = 90.0
    poll = 0.5
    while deadline > 0:
        await asyncio.sleep(poll)
        deadline -= poll
        result = await asyncio.to_thread(_poll_run_terminal_result, run_id)
        if result is not None:
            return {"run_id": str(run_id), "version": version_number, **result}
    return {"run_id": str(run_id), "status": "running", "version": version_number}


@router.post("/v1/invoke")
async def invoke_deployment(
    payload: GenericInvokePayload,
    request: Request,
    wait: bool = Query(default=False, description="Block until the run finishes (max 90s)"),
    stream: bool = Query(default=False, description="Stream run events as SSE"),
    db: Session = Depends(get_db),
):
    return await invoke_workflow(payload.workflow_id, payload, request, wait, stream, db)


@router.get("/v1/deployments/{deployment_id}/descriptor")
def deployment_descriptor(
    deployment_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """Resolve a deployment's invoke target for scoped invoke-key holders.

    No account key: the X-Aegis-Invoke-Key alone authenticates against this
    deployment's invoke_key_hash (same digest check as invoke, keyed by the
    deployment id rather than workflow/version headers). Returns only what a
    chat/widget host needs — never credential material.
    """
    deployment = (
        db.query(models.WorkflowDeployment)
        .filter(models.WorkflowDeployment.id == deployment_id)
        .first()
    )
    key = request.headers.get("x-aegis-invoke-key") or ""
    digest = hashlib.sha256(key.encode()).hexdigest()
    if (
        not deployment
        or not deployment.invoke_key_hash
        or not hmac.compare_digest(digest, deployment.invoke_key_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid deployment credentials")

    version = (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.id == deployment.version_id)
        .first()
    )
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == deployment.workflow_id)
        .first()
    )
    if not version or not workflow:
        raise HTTPException(status_code=401, detail="Invalid deployment target")

    return {
        "deployment_id": str(deployment.id),
        "workflow_id": str(workflow.id),
        "version_id": str(version.id),
        "workflow_name": workflow.name,
        "description": workflow.description,
        "tool_name": f"invoke_{_sanitize_tool_name(workflow.name)}",
        "input_schema": build_mcp_input_schema(version.graph_json or {}),
    }


# ---------- external trace ingestion ----------


class IngestNodeEvent(BaseModel):
    node_id: str
    label: str | None = None
    node_type: str = "external"
    status: str = "completed"
    output: str | None = None
    latency_ms: int | None = None


class IngestRunPayload(BaseModel):
    workflow_name: str = Field(min_length=1, max_length=255)
    input: str = Field(default="", max_length=50_000)
    output: str | None = Field(default=None, max_length=100_000)
    status: str = "completed"
    latency_ms: int | None = None
    total_tokens: int | None = None
    total_cost_usd: float | None = None
    node_events: list[IngestNodeEvent] = Field(default_factory=list, max_length=100)
    evaluate: bool = Field(default=False, description="Score the output with the LLM judge async")
    session_id: str | None = Field(default=None, max_length=128)
    tags: list[str] | None = None



@router.post("/v1/ingest/runs", status_code=201)
def ingest_run(
    payload: dict,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Record a run executed OUTSIDE Aegis so it gets dashboards, clusters, and evals.

    Two payload formats on one path:

    - **Aegis JSON** (default): the bespoke ``IngestRunPayload`` shape —
      ``workflow_name`` + ``node_events``. The named workflow is created on
      first ingest (marked external).
    - **OTLP/GenAI**: an OTLP/JSON ``resourceSpans`` envelope as emitted by
      an OTel collector/exporter. Auto-detected from the ``resourceSpans``
      key, or forced with ``{"format": "otlp", ...}``. Attribute → field
      mapping is documented in ``app/services/otlp_ingest.py``.

    ``{"format": "aegis", ...}`` forces the bespoke validation explicitly.
    """
    fmt = str(payload.get("format") or "").strip().lower()
    if is_otlp_payload(payload):
        try:
            result = ingest_otlp_run(db, user_id, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        run = result["run"]
        workflow = result["workflow"]
        record_audit(
            db, user_id, "ingest", "run", run.id,
            {"workflow": workflow.name, "format": "otlp"},
        )
        db.commit()
        return {
            "run_id": str(run.id),
            "run_ids": [str(r.id) for r in result.get("runs") or [run]],
            "workflow_id": str(workflow.id),
            "format": "otlp",
            "spans": result["spans"],
            "node_results": result["node_results"],
            "llm_calls": result["llm_calls"],
        }
    if fmt and fmt != "aegis":
        raise HTTPException(
            status_code=400, detail=f"unsupported ingest format: {fmt}"
        )
    try:
        aegis = IngestRunPayload.model_validate(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail=f"invalid ingest payload: {exc}"
        ) from exc

    workflow, version = resolve_external_workflow(
        db, user_id, aegis.workflow_name
    )

    if aegis.status not in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=400, detail="status must be completed|failed|cancelled")

    now = datetime.now(timezone.utc)
    metrics: dict = {"ingested": True}
    if aegis.latency_ms is not None:
        metrics["latency_ms"] = aegis.latency_ms
    if aegis.total_tokens is not None:
        metrics["total_tokens"] = aegis.total_tokens
    if aegis.total_cost_usd is not None:
        metrics["total_cost_usd"] = aegis.total_cost_usd

    run = models.WorkflowRun(
        workflow_version_id=version.id,
        status=aegis.status,
        input_text=aegis.input,
        final_output=aegis.output,
        metrics_json=metrics,
        started_at=now,
        completed_at=now,
        session_id=(aegis.session_id or "").strip() or None,
        tags_json=(
            [t.strip() for t in aegis.tags if isinstance(t, str) and t.strip()]
            if aegis.tags
            else None
        ),
    )
    db.add(run)
    db.flush()
    for event in aegis.node_events:
        db.add(
            models.NodeResult(
                run_id=run.id,
                node_id=event.node_id,
                node_type=event.node_type,
                node_label=event.label or event.node_id,
                status=event.status,
                output=event.output,
                latency_ms=event.latency_ms,
            )
        )
    record_audit(db, user_id, "ingest", "run", run.id, {"workflow": aegis.workflow_name})
    db.commit()

    if aegis.evaluate and aegis.output:
        from app.services.executor import _sampled_online_eval

        schedule_task(_sampled_online_eval(run.id, aegis.output, aegis.input))

    return {"run_id": str(run.id), "workflow_id": str(workflow.id)}


# ---------- audit log ----------


@router.get("/api/audit")
def list_audit(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    rows = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.user_id == user_id)
        .order_by(models.AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(row.id),
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "meta": row.meta,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
