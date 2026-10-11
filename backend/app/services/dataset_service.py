"""Shared run-to-dataset copy path for capture, run detail, and feedback."""
from __future__ import annotations

import re
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import models


def error_signature(output: str | None) -> str:
    raw = (output or "unknown error").strip()
    signature = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<id>", raw)
    return re.sub(r"\d+", "<n>", signature)[:200]


def get_user_dataset(db: Session, dataset_id: UUID, user_id: UUID) -> models.Dataset:
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def get_user_run(db: Session, run_id: UUID, user_id: UUID) -> models.WorkflowRun:
    run = (
        db.query(models.WorkflowRun)
        .join(models.WorkflowVersion, models.WorkflowRun.workflow_version_id == models.WorkflowVersion.id)
        .join(models.Workflow, models.WorkflowVersion.workflow_id == models.Workflow.id)
        .filter(models.WorkflowRun.id == run_id, models.Workflow.user_id == user_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def copy_runs(
    db: Session,
    dataset: models.Dataset,
    runs: list[models.WorkflowRun],
    *,
    source: str,
    use_output: bool = True,
    limit: int | None = None,
) -> tuple[list[models.DatasetItem], int]:
    """Copy once per source_run, without committing the caller's transaction.

    Only completed runs can supply an expected output. Negative feedback always
    leaves it unset; an existing example (including a human label) is retained.
    The observed output remains provenance, never a gold label for a failure.
    """
    if any(run.version.workflow_id != dataset.workflow_id for run in runs):
        raise HTTPException(status_code=400, detail="Runs and dataset must belong to the same workflow")
    existing = set()
    for (tags,) in db.query(models.DatasetItem.tags).filter(models.DatasetItem.dataset_id == dataset.id).all():
        source_run = (tags or {}).get("source_run")
        if isinstance(source_run, str):
            existing.add(source_run)
    items = []
    skipped = 0
    for run in runs:
        if not (run.input_text or "").strip():
            raise HTTPException(status_code=400, detail=f"Run {run.id} has no input")
        if str(run.id) in existing:
            skipped += 1
            continue
        if limit is not None and len(items) >= limit:
            break
        item = models.DatasetItem(
            dataset_id=dataset.id,
            input_text=run.input_text,
            expected_output=run.final_output if use_output and run.status == "completed" else None,
            tags={
                "source_run": str(run.id),
                "source_workflow": str(dataset.workflow_id),
                "capture": source,
                "source_status": run.status,
                "observed_output": run.final_output,
            },
        )
        db.add(item)
        items.append(item)
        existing.add(str(run.id))
    db.flush()
    return items, skipped


def feedback_dataset(db: Session, run: models.WorkflowRun, user_id: UUID) -> models.Dataset:
    # Serialize default-dataset creation with other feedback for this workflow.
    db.query(models.Workflow).filter(models.Workflow.id == run.version.workflow_id).with_for_update().first()
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.user_id == user_id,
                models.Dataset.workflow_id == run.version.workflow_id,
                models.Dataset.name == "Negative feedback")
        .order_by(models.Dataset.created_at).with_for_update().first()
    )
    if dataset is None:
        dataset = models.Dataset(user_id=user_id, workflow_id=run.version.workflow_id, name="Negative feedback")
        db.add(dataset)
        db.flush()
    return dataset
