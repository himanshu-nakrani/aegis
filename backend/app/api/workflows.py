from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.schemas.workflow import (
    RunCompareResponse,
    WorkflowCreate,
    WorkflowListItem,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionResponse,
)
from app.services.eval import compute_aggregate_score, scores_delta
from app.services.graph_validation import GraphValidationError, validate_workflow_graph

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


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
    workflows = (
        db.query(models.Workflow)
        .filter(models.Workflow.user_id == user_id)
        .order_by(models.Workflow.updated_at.desc())
        .all()
    )
    items: list[WorkflowListItem] = []
    for wf in workflows:
        version_count = (
            db.query(func.count(models.WorkflowVersion.id))
            .filter(models.WorkflowVersion.workflow_id == wf.id)
            .scalar()
            or 0
        )
        latest = _latest_version(db, wf.id)
        items.append(
            WorkflowListItem(
                id=wf.id,
                name=wf.name,
                description=wf.description,
                created_at=wf.created_at,
                updated_at=wf.updated_at,
                version_count=version_count,
                latest_version_number=latest.version_number if latest else None,
            )
        )
    return items


@router.post("", response_model=WorkflowResponse)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    try:
        validate_workflow_graph(payload.graph_json)
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


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionResponse])
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
    return versions


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionResponse)
def save_version(
    workflow_id: UUID,
    payload: WorkflowVersionCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    _get_user_workflow(db, workflow_id, user_id)

    try:
        validate_workflow_graph(payload.graph_json)
    except GraphValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    latest = _latest_version(db, workflow_id)
    if payload.save_as_new_version or latest is None:
        version_number = (latest.version_number + 1) if latest else 1
        version = models.WorkflowVersion(
            workflow_id=workflow_id,
            version_number=version_number,
            graph_json=payload.graph_json,
        )
        db.add(version)
    else:
        latest.graph_json = payload.graph_json
        version = latest

    db.commit()
    db.refresh(version)
    return version


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
        name=f"{workflow.name} (copy)",
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
            history.append(
                {
                    "run_id": str(run.id),
                    "created_at": run.created_at,
                    "status": run.status,
                    "input_text": run.input_text,
                    "scores": scores,
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