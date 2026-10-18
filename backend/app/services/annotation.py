"""Annotation queue: runs staged for human labels before they join a dataset.

Enqueue is deduped on (user_id, run_id) — a run already in the queue (any
status) returns its existing task instead of a duplicate row. Labeling applies
the human expected_output through the shared ``copy_runs`` seam so dataset
provenance (``tags.source_run``) stays uniform across capture paths.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models
from app.services.dataset_service import copy_runs

def get_queue_item(db: Session, task_id: UUID, user_id: UUID) -> models.AnnotationTask:
    task = (
        db.query(models.AnnotationTask)
        .filter(models.AnnotationTask.id == task_id, models.AnnotationTask.user_id == user_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Annotation task not found")
    return task


def enqueue_run(
    db: Session,
    run: models.WorkflowRun,
    user_id: UUID,
    *,
    source: str,
    priority: int = 0,
    assignee: str | None = None,
) -> tuple[models.AnnotationTask, bool]:
    """Queue a run for labeling; returns (task, created). Deduped on run_id."""
    existing = (
        db.query(models.AnnotationTask)
        .filter(
            models.AnnotationTask.user_id == user_id,
            models.AnnotationTask.run_id == run.id,
        )
        .first()
    )
    if existing:
        return existing, False
    task = models.AnnotationTask(
        user_id=user_id,
        run_id=run.id,
        workflow_id=run.version.workflow_id,
        status="pending",
        priority=priority,
        assignee=assignee,
        created_by=source,
    )
    db.add(task)
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:
        # Lost the insert race (concurrent double-enqueue): return the
        # winner's row instead of 500ing on the unique constraint.
        existing = (
            db.query(models.AnnotationTask)
            .filter(
                models.AnnotationTask.user_id == user_id,
                models.AnnotationTask.run_id == run.id,
            )
            .first()
        )
        if existing is not None:
            return existing, False
        raise
    return task, True


def annotation_dataset(db: Session, task: models.AnnotationTask, user_id: UUID) -> models.Dataset:
    """Default target for labels that don't name a dataset — mirrors the
    "Negative feedback" convention so review output lands somewhere stable."""
    db.query(models.Workflow).filter(models.Workflow.id == task.workflow_id).with_for_update().first()
    dataset = (
        db.query(models.Dataset)
        .filter(
            models.Dataset.user_id == user_id,
            models.Dataset.workflow_id == task.workflow_id,
            models.Dataset.name == "Review queue",
        )
        .order_by(models.Dataset.created_at)
        .with_for_update()
        .first()
    )
    if dataset is None:
        dataset = models.Dataset(user_id=user_id, workflow_id=task.workflow_id, name="Review queue")
        db.add(dataset)
        db.flush()
    return dataset


def apply_label_to_dataset(
    db: Session,
    task: models.AnnotationTask,
    run: models.WorkflowRun,
    dataset: models.Dataset | None,
    *,
    expected_output: str | None,
) -> models.DatasetItem:
    """Land the labeled run in the dataset, deduped on tags.source_run.

    A run already captured for this workflow (e.g. by thumbs-down feedback
    into "Negative feedback", recorded on the task) is labeled in place —
    the human expected_output fills the empty label rather than duplicating
    the row in a second dataset. Otherwise copy_runs supplies provenance
    tags and the label becomes expected_output.
    """
    if task.dataset_item_id:
        existing = db.get(models.DatasetItem, task.dataset_item_id)
        if existing is not None:
            if expected_output is not None:
                existing.expected_output = expected_output
                db.flush()
            return existing
    if dataset is None:
        # No explicit target and no prior capture row — fall back to the
        # workflow's default "Review queue" dataset.
        dataset = annotation_dataset(db, task, task.user_id)
    items, skipped = copy_runs(db, dataset, [run], source="annotation", use_output=False)
    if items:
        item = items[0]
    else:
        if not skipped:
            raise HTTPException(status_code=400, detail="Run could not be captured for labeling")
        item = next(
            i for i in dataset.items if (i.tags or {}).get("source_run") == str(run.id)
        )
    if expected_output is not None:
        item.expected_output = expected_output
        db.flush()
    return item
