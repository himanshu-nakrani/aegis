import asyncio
import json
import uuid
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import SessionLocal, get_db
from app.schemas.knowledge import KnowledgeBulkImport, KnowledgeDocumentCreate, KnowledgeDocumentResponse
from app.schemas.memory import WorkflowMemoryEntry, WorkflowMemoryResponse
from app.schemas.workflow import (
    RunCompareResponse,
    ScheduledWorkflowInfo,
    UploadKnowledgeResponse,
    WorkflowCreate,
    WorkflowImportIntoExisting,
    WorkflowImportPayload,
    WorkflowListItem,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionListItem,
    WorkflowVersionResponse,
)
from app.services.compiler import clear_compile_cache
from app.services.schedule_sync import sync_workflow_schedule
from app.services.eval import compute_aggregate_score, scores_delta
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.embeddings import apply_embedding
from app.services.job_queue import create_job, dispatch_job
from app.services.documents import (
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    MAX_UPLOAD_BYTES,
    chunk_text,
    parse_document,
)
from app.services.persistent_memory import clear_workflow_memory, load_workflow_memory, namespace_to_dict
from app.services.quality_metrics import aggregate_workflow_quality
from app.services.schedule_info import list_user_scheduled_workflows, list_workflow_schedules, schedule_infos_for_graph
from app.services.workflow_import import WorkflowImportError, normalize_workflow_import
from app.services.workflow_capabilities import validate_mcp_tool_bindings

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# Endpoint-side write bounds: these dict/str payloads land in JSON or
# String(N) columns the schema layer cannot size, so they are capped here.
_MAX_GRAPH_JSON_BYTES = 4 * 1024 * 1024
# Bulk-import documents are staged whole into background_jobs.payload_json.
_MAX_BULK_JOB_PAYLOAD_BYTES = 8 * 1024 * 1024
# Multipart framing (part headers + boundary) sits around the file part.
_UPLOAD_MULTIPART_OVERHEAD_BYTES = 64 * 1024
# knowledge_documents column sizes for upload provenance metadata.
_DOC_TITLE_MAX = 255
_SOURCE_NAME_MAX = 512
_SOURCE_MIME_MAX = 128


def _reject_oversized_json(payload: object, limit: int, label: str) -> None:
    """413 when a payload bound for a JSON column exceeds the write cap."""
    if len(json.dumps(payload, default=str).encode("utf-8")) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"{label} exceeds the {limit:,} byte limit",
        )


def _get_user_workflow(db: Session, workflow_id: UUID, user_id: UUID) -> models.Workflow:
    workflow = (
        db.query(models.Workflow)
        .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
        .first()
    )
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


def _latest_version(db: Session, workflow_id: UUID) -> models.WorkflowVersion | None:
    return (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .first()
    )


@router.get("", response_model=list[WorkflowListItem])
def list_workflows(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    version_stats = (
        db.query(
            models.WorkflowVersion.workflow_id.label("workflow_id"),
            func.count(models.WorkflowVersion.id).label("version_count"),
            func.max(models.WorkflowVersion.version_number).label("latest_version_number"),
        )
        .group_by(models.WorkflowVersion.workflow_id)
        .subquery()
    )

    rows = (
        db.query(
            models.Workflow,
            version_stats.c.version_count,
            version_stats.c.latest_version_number,
        )
        .outerjoin(version_stats, models.Workflow.id == version_stats.c.workflow_id)
        .filter(models.Workflow.user_id == user_id)
        .order_by(models.Workflow.updated_at.desc())
        .all()
    )

    return [
        WorkflowListItem(
            id=wf.id,
            name=wf.name,
            description=wf.description,
            created_at=wf.created_at,
            updated_at=wf.updated_at,
            version_count=int(version_count or 0),
            latest_version_number=int(latest_version_number) if latest_version_number else None,
            published=wf.published_version_id is not None,
            is_external=(wf.description or "") == "External agent (ingested traces)",
        )
        for wf, version_count, latest_version_number in rows
    ]


@router.post("", response_model=WorkflowResponse)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _reject_oversized_json(payload.graph_json, _MAX_GRAPH_JSON_BYTES, "graph_json")

    try:
        validate_workflow_graph(payload.graph_json)
        validate_mcp_tool_bindings(payload.graph_json, db, user_id)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    workflow = models.Workflow(
        name=payload.name,
        description=payload.description,
        user_id=user_id,
    )
    db.add(workflow)
    db.flush()

    version = models.WorkflowVersion(
        workflow_id=workflow.id,
        version_number=1,
        graph_json=payload.graph_json,
    )
    db.add(version)
    db.flush()
    sync_workflow_schedule(
        db,
        workflow_id=workflow.id,
        version_id=version.id,
        graph_json=payload.graph_json,
    )
    db.commit()
    db.refresh(workflow)

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        webhook_url=workflow.webhook_url,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(version),
    )


@router.get("/schedules", response_model=list[ScheduledWorkflowInfo])
def list_scheduled_workflows(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """List workflows with schedule triggers and their next/last fire times."""
    rows = list_user_scheduled_workflows(db, user_id)
    return [ScheduledWorkflowInfo(**row) for row in rows]


@router.get("/eval-snippets")
def batch_eval_snippets(
    limit: int = Query(default=3, ge=1, le=50),
    per_workflow: int = Query(default=3, ge=1, le=10),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Recent eval history snippets.

    ``limit`` is the total number of snippets returned, not the number of
    workflows scanned. Empty workflows are omitted.
    """
    scan_workflows = 100
    workflows = (
        db.query(models.Workflow.id)
        .filter(models.Workflow.user_id == user_id)
        .order_by(models.Workflow.updated_at.desc())
        .limit(scan_workflows)
        .all()
    )
    workflow_rows = [row[0] for row in workflows]
    workflow_ids = {str(wf_id) for wf_id in workflow_rows}
    if not workflow_ids:
        return {"snippets": {}}

    runs = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.node_results))
        .join(models.WorkflowVersion)
        .join(models.Workflow)
        .filter(
            models.Workflow.user_id == user_id,
            models.WorkflowVersion.workflow_id.in_(workflow_rows),
        )
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(min(500, max(scan_workflows, limit * per_workflow * 20)))
        .all()
    )

    snippets: dict[str, list[dict]] = {}
    total = 0
    for run in runs:
        if total >= limit:
            break
        wf_id = str(run.version.workflow_id) if run.version else None
        if not wf_id or wf_id not in workflow_ids:
            continue
        bucket = snippets.get(wf_id)
        if bucket is not None and len(bucket) >= per_workflow:
            continue
        scores = _extract_run_eval_metrics(run)
        if not scores:
            continue
        if bucket is None:
            bucket = []
            snippets[wf_id] = bucket
        metrics = run.metrics_json or {}
        bucket.append(
            {
                "run_id": str(run.id),
                "created_at": run.created_at,
                "status": run.status,
                "input_text": run.input_text,
                "scores": scores,
                "eval_passed": metrics.get("eval_passed"),
                "eval_aggregate": metrics.get("eval_aggregate"),
                "guardrail_blocked": bool(metrics.get("guardrail_blocked")),
            }
        )
        total += 1

    return {"snippets": snippets}


@router.post("/import", response_model=WorkflowResponse)
def import_workflow(
    payload: WorkflowImportPayload,
    name_suffix: str | None = Query(default=None, description="Optional suffix appended to imported name"),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Create a new workflow from an aegis-workflow-v1 export JSON."""
    try:
        name, description, graph = normalize_workflow_import(payload.model_dump(exclude_none=True))
        _reject_oversized_json(graph, _MAX_GRAPH_JSON_BYTES, "graph_json")
        validate_mcp_tool_bindings(graph, db, user_id)
    except (WorkflowImportError, GraphValidationError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if name_suffix:
        name = f"{name} {name_suffix}".strip()[:_DOC_TITLE_MAX]

    workflow = models.Workflow(
        name=name,
        description=description,
        user_id=user_id,
    )
    db.add(workflow)
    db.flush()

    version = models.WorkflowVersion(
        workflow_id=workflow.id,
        version_number=1,
        graph_json=graph,
    )
    db.add(version)
    db.flush()
    sync_workflow_schedule(db, workflow_id=workflow.id, version_id=version.id, graph_json=graph)
    db.commit()
    db.refresh(workflow)

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        webhook_url=workflow.webhook_url,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(version),
    )


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = _get_user_workflow(db, workflow_id, user_id)
    latest = _latest_version(db, workflow_id)
    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        webhook_url=workflow.webhook_url,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(latest) if latest else None,
    )


@router.get("/{workflow_id}/quality")
def get_workflow_quality(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Per-workflow eval trends, guardrail health, and regression alerts."""
    workflow = _get_user_workflow(db, workflow_id, user_id)
    version = _latest_version(db, workflow_id)

    runs = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.version).joinedload(models.WorkflowVersion.workflow))
        .join(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(50)
        .all()
    )

    graph_json = version.graph_json if version else None
    quality = aggregate_workflow_quality(runs, graph_json)
    quality["workflow_id"] = str(workflow.id)
    quality["workflow_name"] = workflow.name
    return quality


@router.get("/{workflow_id}/schedule", response_model=list[ScheduledWorkflowInfo])
def get_workflow_schedule(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """All schedule entries for the workflow — persisted rows when synced,
    otherwise the (unsaved) graph's configured entries."""
    workflow = _get_user_workflow(db, workflow_id, user_id)
    version = _latest_version(db, workflow_id)
    if not version:
        raise HTTPException(status_code=404, detail="Workflow version not found")

    items = list_workflow_schedules(db, workflow.id, workflow.name)
    if not items:
        items = schedule_infos_for_graph(workflow.id, workflow.name, version.graph_json)
    if not items:
        raise HTTPException(status_code=404, detail="Workflow has no schedule trigger")
    return [ScheduledWorkflowInfo(**item) for item in items]


@router.post("/{workflow_id}/import", response_model=WorkflowVersionResponse)
def import_into_workflow(
    workflow_id: UUID,
    payload: WorkflowImportIntoExisting,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Replace or version the graph on an existing workflow from export JSON."""
    try:
        _, _, graph = normalize_workflow_import(payload.model_dump(exclude_none=True))
        _reject_oversized_json(graph, _MAX_GRAPH_JSON_BYTES, "graph_json")
        validate_mcp_tool_bindings(graph, db, user_id)
    except (WorkflowImportError, GraphValidationError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for _attempt in range(5):
        workflow = (
            db.query(models.Workflow)
            .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        latest = _latest_version(db, workflow_id)
        # Never mutate a published version in place — fork a new version so
        # /v1/invoke keeps serving the pinned published graph (mirrors save_version).
        published_id = getattr(workflow, "published_version_id", None)
        must_fork = (
            payload.save_as_new_version
            or latest is None
            or (published_id is not None and latest is not None and latest.id == published_id)
        )
        if must_fork:
            version_number = (latest.version_number + 1) if latest else 1
            version = models.WorkflowVersion(
                workflow_id=workflow_id,
                version_number=version_number,
                graph_json=graph,
            )
            db.add(version)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                continue
        else:
            latest.graph_json = graph
            version = latest

        # Schedules follow the published version (see save_version); skip while published.
        if published_id is None:
            sync_workflow_schedule(
                db,
                workflow_id=workflow_id,
                version_id=version.id,
                graph_json=version.graph_json,
            )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        db.refresh(version)
        clear_compile_cache()
        return version

    raise HTTPException(
        status_code=409,
        detail="Version conflict: concurrent saves collided. Please retry.",
    )


@router.get("/{workflow_id}/export")
def export_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = _get_user_workflow(db, workflow_id, user_id)
    version = _latest_version(db, workflow_id)
    if not version:
        raise HTTPException(status_code=404, detail="Workflow version not found")

    payload = {
        "format": "aegis-workflow-v1",
        "workflow_id": str(workflow.id),
        "name": workflow.name,
        "description": workflow.description,
        "version_number": version.version_number,
        "version_id": str(version.id),
        "graph_json": version.graph_json,
        "exported_at": version.created_at.isoformat(),
    }
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in workflow.name).strip("-") or "workflow"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-{workflow_id}.json"'},
    )


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: UUID,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = _get_user_workflow(db, workflow_id, user_id)

    if payload.name is not None:
        workflow.name = payload.name
    if payload.description is not None:
        workflow.description = payload.description
    if payload.webhook_url is not None:
        workflow.webhook_url = payload.webhook_url or None
    if payload.budget_json is not None:
        workflow.budget_json = payload.budget_json or None


    db.commit()
    db.refresh(workflow)
    latest = _latest_version(db, workflow_id)

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        webhook_url=workflow.webhook_url,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(latest) if latest else None,
    )


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionListItem])
def list_versions(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    versions = (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .all()
    )
    return [
        WorkflowVersionListItem(
            id=version.id,
            workflow_id=version.workflow_id,
            version_number=version.version_number,
            created_at=version.created_at,
            node_count=len((version.graph_json or {}).get("nodes", [])),
        )
        for version in versions
    ]


@router.get("/{workflow_id}/versions/{version_id}", response_model=WorkflowVersionResponse)
def get_version(
    workflow_id: UUID,
    version_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    version = (
        db.query(models.WorkflowVersion)
        .filter(
            models.WorkflowVersion.id == version_id,
            models.WorkflowVersion.workflow_id == workflow_id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionResponse)
def save_version(
    workflow_id: UUID,
    payload: WorkflowVersionCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _reject_oversized_json(payload.graph_json, _MAX_GRAPH_JSON_BYTES, "graph_json")
    try:
        validate_workflow_graph(payload.graph_json)
        validate_mcp_tool_bindings(payload.graph_json, db, user_id)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    for _attempt in range(5):
        workflow = (
            db.query(models.Workflow)
            .filter(models.Workflow.id == workflow_id, models.Workflow.user_id == user_id)
            .with_for_update()
            .first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        latest = _latest_version(db, workflow_id)
        # Never mutate a published version in place — fork a new version so
        # /v1/invoke keeps serving the pinned published graph.
        published_id = getattr(workflow, "published_version_id", None)
        must_fork = (
            payload.save_as_new_version
            or latest is None
            or (published_id is not None and latest is not None and latest.id == published_id)
        )
        if must_fork:
            version_number = (latest.version_number + 1) if latest else 1
            version = models.WorkflowVersion(
                workflow_id=workflow_id,
                version_number=version_number,
                graph_json=payload.graph_json,
            )
            db.add(version)
            try:
                db.flush()
            except IntegrityError:
                # Lost the race for version_number (SQLite ignores FOR UPDATE):
                # roll back, re-read latest, and try the next slot.
                db.rollback()
                continue
        else:
            latest.graph_json = payload.graph_json
            version = latest

        # Schedules follow the published version: while published, draft saves
        # must not re-pin rows or delete live crons — publish_version re-syncs
        # from the published graph. Unpublished workflows sync from the draft.
        if published_id is None:
            sync_workflow_schedule(
                db,
                workflow_id=workflow_id,
                version_id=version.id,
                graph_json=version.graph_json,
            )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        db.refresh(version)
        clear_compile_cache()
        return version

    raise HTTPException(
        status_code=409,
        detail="Version conflict: concurrent saves collided. Please retry.",
    )


@router.post("/{workflow_id}/duplicate", response_model=WorkflowResponse)
def duplicate_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = _get_user_workflow(db, workflow_id, user_id)

    latest = _latest_version(db, workflow_id)
    if not latest:
        raise HTTPException(status_code=404, detail="Workflow has no versions")

    copy = models.Workflow(
        name=f"{workflow.name} (copy)"[:_DOC_TITLE_MAX],
        description=workflow.description,
        user_id=user_id,
        webhook_url=workflow.webhook_url,
    )
    db.add(copy)
    db.flush()

    version = models.WorkflowVersion(
        workflow_id=copy.id,
        version_number=1,
        graph_json=latest.graph_json,
    )
    db.add(version)
    db.flush()
    sync_workflow_schedule(
        db,
        workflow_id=copy.id,
        version_id=version.id,
        graph_json=latest.graph_json,
    )
    db.commit()
    db.refresh(copy)

    return WorkflowResponse(
        id=copy.id,
        name=copy.name,
        description=copy.description,
        webhook_url=copy.webhook_url,
        created_at=copy.created_at,
        updated_at=copy.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(version),
    )


def _flatten_eval_scores(raw_scores: dict) -> dict:
    scores = {
        "faithfulness": raw_scores.get("faithfulness"),
        "helpfulness": raw_scores.get("helpfulness"),
        "relevance": raw_scores.get("relevance"),
        "toxicity": raw_scores.get("toxicity"),
        "reasoning": raw_scores.get("reasoning", ""),
    }
    aggregate = raw_scores.get("aggregate_score")
    if aggregate is None:
        aggregate = compute_aggregate_score(scores)
    if aggregate is not None:
        scores["aggregate_score"] = aggregate
    return scores


def _extract_run_eval_metrics(run: models.WorkflowRun) -> dict | None:
    metrics = run.metrics_json or {}
    eval_rows = metrics.get("eval_scores") or []
    if eval_rows and isinstance(eval_rows[0], dict):
        scores = _flatten_eval_scores(eval_rows[0])
        aggregate = metrics.get("eval_aggregate")
        if aggregate is not None:
            scores["aggregate_score"] = aggregate
        return scores

    for node in run.node_results or []:
        if node.evaluation_scores:
            return _flatten_eval_scores(dict(node.evaluation_scores))
    return None


@router.get("/{workflow_id}/eval-history")
def eval_history(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)

    runs = (
        db.query(models.WorkflowRun)
        .options(joinedload(models.WorkflowRun.node_results))
        .join(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowRun.created_at.desc())
        .limit(20)
        .all()
    )

    history = []
    for run in runs:
        scores = _extract_run_eval_metrics(run)
        if scores:
            metrics = run.metrics_json or {}
            history.append(
                {
                    "run_id": str(run.id),
                    "created_at": run.created_at,
                    "status": run.status,
                    "input_text": run.input_text,
                    "scores": scores,
                    "eval_passed": metrics.get("eval_passed"),
                    "eval_aggregate": metrics.get("eval_aggregate"),
                    "guardrail_blocked": bool(metrics.get("guardrail_blocked")),
                }
            )
    return history


@router.get("/{workflow_id}/compare-runs", response_model=RunCompareResponse)
def compare_runs(
    workflow_id: UUID,
    run_a: UUID = Query(...),
    run_b: UUID = Query(...),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)

    def load_run(run_id: UUID) -> models.WorkflowRun:
        run = (
            db.query(models.WorkflowRun)
            .options(
                joinedload(models.WorkflowRun.node_results),
                joinedload(models.WorkflowRun.version),
            )
            .filter(models.WorkflowRun.id == run_id)
            .first()
        )
        if not run or not run.version or run.version.workflow_id != workflow_id:
            raise HTTPException(status_code=404, detail=f"Run {run_id} not found for workflow")
        return run

    run_left = load_run(run_a)
    run_right = load_run(run_b)

    scores_a = _extract_run_eval_metrics(run_left)
    scores_b = _extract_run_eval_metrics(run_right)

    return RunCompareResponse(
        run_a_id=run_a,
        run_b_id=run_b,
        run_a_scores=scores_a,
        run_b_scores=scores_b,
        delta=scores_delta(scores_a, scores_b),
        run_a_output=run_left.final_output,
        run_b_output=run_right.final_output,
        run_a_version=run_left.version.version_number,
        run_b_version=run_right.version.version_number,
    )


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    workflow = _get_user_workflow(db, workflow_id, user_id)

    # Run children have FK cascades on Postgres but SQLite ignores them (and
    # the ORM cascade loads every row) — delete all run-scoped tables in bulk
    # first so large workflows delete in statements, not loads.
    run_ids = [
        rid
        for (rid,) in db.query(models.WorkflowRun.id)
        .join(models.WorkflowVersion, models.WorkflowVersion.id == models.WorkflowRun.workflow_version_id)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .all()
    ]
    if run_ids:
        for model, column in (
            (models.LlmCall, models.LlmCall.run_id),
            (models.Feedback, models.Feedback.run_id),
            (models.NodeResult, models.NodeResult.run_id),
            (models.RunSpan, models.RunSpan.run_id),
            (models.RunEvent, models.RunEvent.run_id),
            (models.RunCheckpoint, models.RunCheckpoint.run_id),
            (models.ApprovalRequest, models.ApprovalRequest.run_id),
            (models.AnnotationTask, models.AnnotationTask.run_id),
            (models.RunRollupLedger, models.RunRollupLedger.run_id),
        ):
            db.query(model).filter(column.in_(run_ids)).delete(
                synchronize_session=False
            )
        db.query(models.WorkflowRun).filter(
            models.WorkflowRun.id.in_(run_ids)
        ).delete(synchronize_session=False)

    # Dataset (+ items) and Experiment reference the workflow with no cascade.
    dataset_ids = [
        did
        for (did,) in db.query(models.Dataset.id)
        .filter(models.Dataset.workflow_id == workflow_id)
        .all()
    ]
    db.query(models.Experiment).filter(models.Experiment.workflow_id == workflow_id).delete(
        synchronize_session=False
    )
    if dataset_ids:
        db.query(models.DatasetItem).filter(
            models.DatasetItem.dataset_id.in_(dataset_ids)
        ).delete(synchronize_session=False)
        db.query(models.Dataset).filter(models.Dataset.workflow_id == workflow_id).delete(
            synchronize_session=False
        )

    db.query(models.WorkflowSchedule).filter(models.WorkflowSchedule.workflow_id == workflow_id).delete()
    # The bulk delete below bypasses the per-doc vector cleanup, and
    # sqlite-vec's ``vec_knowledge`` rows have no FK — remove them by id set
    # first or they persist forever (pgvector is a row column: it dies with
    # the row, so this is a no-op there).
    from app.services.vector_stores import delete_document_vectors

    doc_ids = [
        did
        for (did,) in db.query(models.KnowledgeDocument.id)
        .filter(models.KnowledgeDocument.workflow_id == workflow_id)
        .all()
    ]
    if doc_ids:
        delete_document_vectors(db, doc_ids)
    db.query(models.KnowledgeDocument).filter(models.KnowledgeDocument.workflow_id == workflow_id).delete()
    db.query(models.WorkflowMemory).filter(models.WorkflowMemory.workflow_id == workflow_id).delete()
    db.query(models.BackgroundJob).filter(models.BackgroundJob.workflow_id == workflow_id).delete()
    db.query(models.ObservabilityRollup).filter(models.ObservabilityRollup.workflow_id == workflow_id).delete()
    # AlertRule has no FK to workflows (deliberately — rules survive export);
    # delete explicitly so orphaned rules don't evaluate dead scopes forever.
    rule_ids = [
        rid
        for (rid,) in db.query(models.AlertRule.id)
        .filter(models.AlertRule.workflow_id == workflow_id)
        .all()
    ]
    if rule_ids:
        db.query(models.AlertEvent).filter(
            models.AlertEvent.rule_id.in_(rule_ids)
        ).delete(synchronize_session=False)
        db.query(models.AlertRule).filter(
            models.AlertRule.workflow_id == workflow_id
        ).delete(synchronize_session=False)
    clear_compile_cache()
    from app.services.audit import record_audit

    record_audit(db, user_id, "delete", "workflow", workflow_id, {"name": workflow.name})
    # Versions + deployments go in bulk too: the ORM cascade would load every
    # version row (and its runs, already deleted above) into the session.
    # Schedules were bulk-deleted above; deployments + receipts have no other
    # dependents.
    deployment_ids = [
        did
        for (did,) in db.query(models.WorkflowDeployment.id)
        .filter(models.WorkflowDeployment.workflow_id == workflow_id)
        .all()
    ]
    if deployment_ids:
        db.query(models.DeploymentWebhookReceipt).filter(
            models.DeploymentWebhookReceipt.deployment_id.in_(deployment_ids)
        ).delete(synchronize_session=False)
        db.query(models.WorkflowDeployment).filter(
            models.WorkflowDeployment.workflow_id == workflow_id
        ).delete(synchronize_session=False)
    db.query(models.WorkflowVersion).filter(
        models.WorkflowVersion.workflow_id == workflow_id
    ).delete(synchronize_session=False)
    db.delete(workflow)
    db.commit()
    return None


@router.get("/{workflow_id}/memory", response_model=WorkflowMemoryResponse)
def get_workflow_memory(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    rows = load_workflow_memory(db, workflow_id)
    return WorkflowMemoryResponse(
        workflow_id=str(workflow_id),
        entries=[WorkflowMemoryEntry(**row) for row in rows],
        namespaces=namespace_to_dict(rows),
    )


@router.delete("/{workflow_id}/memory")
def delete_workflow_memory(
    workflow_id: UUID,
    namespace: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    deleted = clear_workflow_memory(db, workflow_id, namespace)
    return {"status": "cleared", "deleted": deleted, "namespace": namespace}


@router.get("/{workflow_id}/knowledge", response_model=list[KnowledgeDocumentResponse])
def list_knowledge_documents(
    workflow_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    rows = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.workflow_id == workflow_id)
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .all()
    )
    return [KnowledgeDocumentResponse.from_row(row) for row in rows]


@router.post("/{workflow_id}/knowledge", response_model=KnowledgeDocumentResponse)
def create_knowledge_document(
    workflow_id: UUID,
    payload: KnowledgeDocumentCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    row = models.KnowledgeDocument(
        workflow_id=workflow_id,
        title=payload.title,
        text=payload.text,
    )
    db.add(row)
    db.flush()
    apply_embedding(row, db)
    db.commit()
    db.refresh(row)
    return KnowledgeDocumentResponse.from_row(row)

async def _capped_request_body(request: Request, limit: int) -> bytes:
    """Read the raw body, refusing once ``limit`` bytes have arrived.

    ``request.form()`` spools the entire multipart stream before any
    per-file check, so a chunked upload with no Content-Length (or a lying
    small one) would fill temporary storage first. Counting here stops the
    read before the parser sees the excess.
    """
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File exceeds the 8MB upload limit",
            )
        body.extend(chunk)
    return bytes(body)


async def _parse_capped_multipart(request: Request, body: bytes, limit: int):
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type.lower():
        raise HTTPException(status_code=422, detail="Expected multipart form data")

    async def _chunks():
        step = 64 * 1024
        for offset in range(0, len(body), step):
            yield body[offset : offset + step]

    parser = MultiPartParser(request.headers, _chunks(), max_part_size=limit)
    try:
        return await parser.parse()
    except MultiPartException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid multipart body",
        ) from exc


def _index_uploaded_chunks(
    workflow_id: UUID,
    user_id: UUID,
    content: bytes,
    filename: str,
    mime: str,
    title: str | None,
) -> UploadKnowledgeResponse:
    """Parse, chunk, and embed off the event loop.

    Owns its session: the request session must not be used from a worker
    thread. ``embed_text`` is a blocking Gemini call when a key is configured.
    """
    db = SessionLocal()
    try:
        _get_user_workflow(db, workflow_id, user_id)
        try:
            text, truncated = parse_document(filename, content, mime)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        chunks = chunk_text(text, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP)
        if not chunks:
            raise HTTPException(status_code=400, detail="Document has no readable text")
        base_title = ((title or "").strip() or filename)[:_DOC_TITLE_MAX]
        source_id = uuid.uuid4()
        multi = len(chunks) > 1
        for index, chunk in enumerate(chunks):
            title_text = base_title
            if multi:
                suffix = f"#{index + 1}"
                title_text = base_title[: _DOC_TITLE_MAX - len(suffix)] + suffix
            row = models.KnowledgeDocument(
                workflow_id=workflow_id,
                title=title_text,
                text=chunk["text"],
                source_document_id=source_id,
                source_name=filename,
                source_mime=(mime or None)[:_SOURCE_MIME_MAX] if mime else None,
                chunk_index=index,
                chunk_start=chunk["start"],
                chunk_end=chunk["end"],
            )
            db.add(row)
            db.flush()
            apply_embedding(row, db)
        db.commit()
        return UploadKnowledgeResponse(
            document_id=source_id,
            chunks_created=len(chunks),
            chunk_size=DEFAULT_CHUNK_SIZE,
            overlap=DEFAULT_CHUNK_OVERLAP,
            filename=filename,
            mime=mime,
            truncated=truncated,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/{workflow_id}/knowledge/upload", response_model=UploadKnowledgeResponse)
async def upload_knowledge_document(
    workflow_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Upload a document file, chunk it, and index each chunk for retrieval."""
    _get_user_workflow(db, workflow_id, user_id)

    # Reject a declared oversized body before reading it. A missing or lying
    # Content-Length is caught by the stream cap below — ``request.form()``
    # would spool the whole upload before any per-file check.
    raw_limit = MAX_UPLOAD_BYTES + _UPLOAD_MULTIPART_OVERHEAD_BYTES
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            declared_size = int(declared)
        except ValueError:
            declared_size = 0
        if declared_size > raw_limit:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File exceeds the 8MB upload limit",
            )

    body = await _capped_request_body(request, raw_limit)
    form = await _parse_capped_multipart(request, body, raw_limit)
    file = form.get("file")
    if not isinstance(file, UploadFile):
        raise HTTPException(status_code=422, detail="Missing multipart file field")
    title = form.get("title")
    if not isinstance(title, str):
        title = None

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File exceeds the 8MB upload limit",
        )
    filename = (file.filename or "document")[:_SOURCE_NAME_MAX]
    mime = file.content_type or ""
    # Parsing (PDF/DOCX) and embedding are blocking. The multipart read above
    # stays async; the rest runs on a worker thread so one upload cannot stall
    # other requests or in-flight runs.
    return await asyncio.to_thread(
        _index_uploaded_chunks,
        workflow_id,
        user_id,
        bytes(content),
        filename,
        mime,
        title,
    )



@router.post("/{workflow_id}/knowledge/bulk")
def bulk_import_knowledge(
    workflow_id: UUID,
    payload: KnowledgeBulkImport,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    documents = [
        {"title": item.title, "text": item.text}
        for item in payload.documents
    ]
    # The whole document list is staged into background_jobs.payload_json —
    # cap it at the endpoint (the per-doc text cap lives in the schema).
    _reject_oversized_json(
        {"documents": documents}, _MAX_BULK_JOB_PAYLOAD_BYTES, "bulk import"
    )
    job = create_job(
        db,
        job_type="knowledge_bulk_import",
        user_id=user_id,
        workflow_id=workflow_id,
        payload={"documents": documents},
    )
    background_tasks.add_task(dispatch_job, job.id)
    return {
        "status": "queued",
        "job_id": str(job.id),
        "document_count": len(documents),
        "workflow_id": str(workflow_id),
    }


@router.post("/{workflow_id}/knowledge/reindex")
def reindex_knowledge(
    workflow_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    count = (
        db.query(func.count(models.KnowledgeDocument.id))
        .filter(models.KnowledgeDocument.workflow_id == workflow_id)
        .scalar()
        or 0
    )
    job = create_job(
        db,
        job_type="knowledge_reindex",
        user_id=user_id,
        workflow_id=workflow_id,
        payload={"count": count},
    )
    background_tasks.add_task(dispatch_job, job.id)
    return {
        "status": "queued",
        "job_id": str(job.id),
        "count": count,
        "workflow_id": str(workflow_id),
    }


@router.delete("/{workflow_id}/knowledge/{document_id}")
def delete_knowledge_document(
    workflow_id: UUID,
    document_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)
    row = (
        db.query(models.KnowledgeDocument)
        .filter(
            models.KnowledgeDocument.id == document_id,
            models.KnowledgeDocument.workflow_id == workflow_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    from app.services.vector_search import delete_embedding_vector

    delete_embedding_vector(db, document_id)
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": str(document_id)}



