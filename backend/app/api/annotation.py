"""Annotation queue: runs waiting on human labels before joining a dataset."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.services.annotation import (
    apply_label_to_dataset,
    enqueue_run,
    get_queue_item,
)
from app.services.dataset_service import get_user_dataset, get_user_run

router = APIRouter(prefix="/api/annotation", tags=["annotation"])

TASK_STATUSES = {"pending", "labeled", "skipped"}


class EnqueueRequest(BaseModel):
    """Manual single-run review, or opt-in bulk capture by run quality."""

    run_id: UUID | None = None
    workflow_id: UUID | None = None
    filter: Literal["failed", "low_eval"] | None = None
    limit: int = Field(default=20, ge=1, le=200)
    max_eval: float = Field(default=3.0, ge=0, le=5)
    priority: int = Field(default=0, ge=0, le=100)
    assignee: str | None = Field(default=None, max_length=255)


class LabelRequest(BaseModel):
    expected_output: str | None = None
    notes: str | None = Field(default=None, max_length=4000)
    rating: int | None = Field(default=None, ge=1, le=5)
    category: str | None = Field(default=None, max_length=64)
    dataset_id: UUID | None = None


def _serialize(task: models.AnnotationTask, run: models.WorkflowRun | None, workflow_name: str | None) -> dict:
    metrics = (run.metrics_json or {}) if run else {}
    return {
        "id": str(task.id),
        "run_id": str(task.run_id),
        "workflow_id": str(task.workflow_id),
        "workflow_name": workflow_name,
        "status": task.status,
        "priority": task.priority,
        "assignee": task.assignee,
        "created_by": task.created_by,
        "expected_output": task.expected_output,
        "notes": task.notes,
        "rating": task.rating,
        "category": task.category,
        "dataset_item_id": str(task.dataset_item_id) if task.dataset_item_id else None,
        "labeled_at": task.labeled_at.isoformat() if task.labeled_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "run": (
            {
                "status": run.status,
                "input_text": run.input_text,
                "final_output": run.final_output,
                "eval_aggregate": metrics.get("eval_aggregate"),
                "eval_passed": metrics.get("eval_passed"),
                "created_at": run.created_at.isoformat() if run.created_at else None,
            }
            if run
            else None
        ),
    }


def _serialize_many(db: Session, tasks: list[models.AnnotationTask]) -> list[dict]:
    run_ids = [task.run_id for task in tasks]
    runs = {
        run.id: run
        for run in db.query(models.WorkflowRun).filter(models.WorkflowRun.id.in_(run_ids)).all()
    } if run_ids else {}
    workflow_ids = {task.workflow_id for task in tasks}
    names = {
        workflow.id: workflow.name
        for workflow in db.query(models.Workflow).filter(models.Workflow.id.in_(workflow_ids)).all()
    } if workflow_ids else {}
    return [
        _serialize(task, runs.get(task.run_id), names.get(task.workflow_id))
        for task in tasks
    ]


@router.get("/queue")
def list_queue(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    status_filter: str | None = Query(default=None, alias="status"),
    workflow_id: UUID | None = Query(default=None),
    unlabeled_first: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    query = db.query(models.AnnotationTask).filter(models.AnnotationTask.user_id == user_id)
    if status_filter:
        if status_filter not in TASK_STATUSES:
            raise HTTPException(status_code=400, detail="status must be pending, labeled, or skipped")
        query = query.filter(models.AnnotationTask.status == status_filter)
    if workflow_id:
        query = query.filter(models.AnnotationTask.workflow_id == workflow_id)
    order = [models.AnnotationTask.priority.desc(), models.AnnotationTask.created_at.desc()]
    if unlabeled_first:
        order.insert(0, case((models.AnnotationTask.status == "pending", 0), else_=1))
    total = query.count()
    tasks = query.order_by(*order).offset(offset).limit(limit).all()
    return {"total": total, "items": _serialize_many(db, tasks)}


@router.post("/enqueue", status_code=201)
def enqueue(
    payload: EnqueueRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    if payload.filter:
        if not payload.workflow_id:
            raise HTTPException(status_code=422, detail="workflow_id is required for bulk capture")
        workflow = (
            db.query(models.Workflow)
            .filter(models.Workflow.id == payload.workflow_id, models.Workflow.user_id == user_id)
            .first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        query = (
            db.query(models.WorkflowRun)
            .join(models.WorkflowVersion, models.WorkflowRun.workflow_version_id == models.WorkflowVersion.id)
            .filter(models.WorkflowVersion.workflow_id == payload.workflow_id)
            .order_by(models.WorkflowRun.created_at.desc())
        )
        if payload.filter == "failed":
            query = query.filter(models.WorkflowRun.status == "failed")
        candidates = query.limit(min(payload.limit * 5, 500)).all()
        if payload.filter == "low_eval":
            candidates = [
                run
                for run in candidates
                if isinstance((run.metrics_json or {}).get("eval_aggregate"), (int, float))
                and run.metrics_json["eval_aggregate"] < payload.max_eval
            ]
        candidates = candidates[: payload.limit]
        created = 0
        existing = 0
        for run in candidates:
            _, is_new = enqueue_run(
                db, run, user_id, source=payload.filter, priority=payload.priority,
                assignee=payload.assignee,
            )
            created += 1 if is_new else 0
            existing += 0 if is_new else 1
        db.commit()
        return {"enqueued": created, "already_queued": existing, "filter": payload.filter}

    if not payload.run_id:
        raise HTTPException(status_code=422, detail="run_id is required to queue a run for review")
    run = get_user_run(db, payload.run_id, user_id)
    task, is_new = enqueue_run(
        db, run, user_id, source="manual", priority=payload.priority, assignee=payload.assignee
    )
    db.commit()
    return {"task": _serialize(task, run, run.version.workflow.name), "created": is_new}


@router.post("/{task_id}/label")
def label_task(
    task_id: UUID,
    payload: LabelRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    task = get_queue_item(db, task_id, user_id)
    if task.status != "pending":
        raise HTTPException(status_code=409, detail=f"Task already {task.status}")
    run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == task.run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run no longer exists")

    task.expected_output = payload.expected_output
    task.notes = payload.notes
    task.rating = payload.rating
    task.category = payload.category
    task.status = "labeled"
    task.labeled_at = datetime.now(timezone.utc)

    dataset_result = None
    if payload.expected_output is not None:
        dataset = (
            get_user_dataset(db, payload.dataset_id, user_id) if payload.dataset_id else None
        )
        if dataset is not None and dataset.workflow_id != task.workflow_id:
            raise HTTPException(status_code=400, detail="Dataset must belong to the run's workflow")
        item = apply_label_to_dataset(
            db, task, run, dataset, expected_output=payload.expected_output
        )
        task.dataset_item_id = item.id
        item_dataset = db.get(models.Dataset, item.dataset_id)
        dataset_result = {
            "dataset_id": str(item.dataset_id),
            "dataset_name": item_dataset.name if item_dataset else None,
            "item_id": str(item.id),
        }

    db.commit()
    return {"task": _serialize(task, run, run.version.workflow.name), "dataset": dataset_result}


@router.post("/{task_id}/skip")
def skip_task(
    task_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    task = get_queue_item(db, task_id, user_id)
    if task.status != "pending":
        raise HTTPException(status_code=409, detail=f"Task already {task.status}")
    task.status = "skipped"
    task.labeled_at = datetime.now(timezone.utc)
    db.commit()
    run = db.query(models.WorkflowRun).filter(models.WorkflowRun.id == task.run_id).first()
    return {"task": _serialize(task, run, run.version.workflow.name if run else None)}
