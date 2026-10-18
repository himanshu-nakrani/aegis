"""Golden datasets: CRUD, JSON/CSV import, and shared run capture."""

from __future__ import annotations

import csv
import io
import json
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.services.dataset_service import copy_runs, error_signature, get_user_dataset, get_user_run

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


class DatasetCreate(BaseModel):
    workflow_id: UUID
    name: str = Field(min_length=1, max_length=255)


class DatasetItemCreate(BaseModel):
    input_text: str = Field(min_length=1)
    expected_output: str | None = None
    tags: dict | None = None


class DatasetImport(BaseModel):
    items: list[DatasetItemCreate] = Field(min_length=1, max_length=500)


class DatasetCsvImport(BaseModel):
    csv_text: str = Field(min_length=1, max_length=2_000_000)


class DatasetCapture(BaseModel):
    filter: Literal["recent", "failed", "low_eval", "cluster"] = "recent"
    limit: int = Field(default=20, ge=1, le=1000)
    max_eval: float = Field(default=3.0, ge=0, le=5)
    run_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)
    cluster_signature: str | None = Field(default=None, max_length=200)




def _serialize(dataset: models.Dataset, item_count: int | None = None) -> dict:
    return {
        "id": str(dataset.id),
        "workflow_id": str(dataset.workflow_id),
        "name": dataset.name,
        "item_count": item_count if item_count is not None else len(dataset.items),
        "created_at": dataset.created_at.isoformat() if dataset.created_at else None,
    }


@router.get("")
def list_datasets(
    workflow_id: UUID | None = None,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    query = (
        db.query(models.Dataset, func.count(models.DatasetItem.id))
        .outerjoin(models.DatasetItem, models.DatasetItem.dataset_id == models.Dataset.id)
        .filter(models.Dataset.user_id == user_id)
        .group_by(models.Dataset.id)
    )
    if workflow_id:
        query = query.filter(models.Dataset.workflow_id == workflow_id)
    return [
        _serialize(d, item_count=count)
        for d, count in query.order_by(models.Dataset.created_at.desc()).all()
    ]


@router.post("", status_code=201)
def create_dataset(
    payload: DatasetCreate,
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
    dataset = models.Dataset(user_id=user_id, workflow_id=payload.workflow_id, name=payload.name)
    db.add(dataset)
    db.commit()
    return _serialize(dataset, item_count=0)


@router.get("/{dataset_id}")
def get_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    dataset = get_user_dataset(db, dataset_id, user_id)
    return {
        **_serialize(dataset),
        "items": [
            {
                "id": str(item.id),
                "input_text": item.input_text,
                "expected_output": item.expected_output,
                "tags": item.tags,
            }
            for item in dataset.items
        ],
    }


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    dataset = get_user_dataset(db, dataset_id, user_id)
    # Experiments reference the dataset with ON DELETE CASCADE: deleting here
    # would silently wipe regression baselines. Refuse while referenced so
    # the caller deletes (or re-points) experiments explicitly.
    experiment_count = (
        db.query(models.Experiment)
        .filter(models.Experiment.dataset_id == dataset_id)
        .count()
    )
    if experiment_count:
        raise HTTPException(
            status_code=409,
            detail=f"Dataset is referenced by {experiment_count} experiment(s); "
            "delete them first.",
        )
    # Bulk-delete items: ORM delete-orphan cascade loads every row into the
    # session (N+1 on large golden sets).
    db.query(models.DatasetItem).filter(
        models.DatasetItem.dataset_id == dataset_id
    ).delete(synchronize_session=False)
    db.delete(dataset)
    db.commit()
    return None


@router.post("/{dataset_id}/items", status_code=201)
def add_item(
    dataset_id: UUID,
    payload: DatasetItemCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    dataset = get_user_dataset(db, dataset_id, user_id)
    item = models.DatasetItem(
        dataset_id=dataset.id,
        input_text=payload.input_text,
        expected_output=payload.expected_output,
        tags=payload.tags,
    )
    db.add(item)
    db.commit()
    return {"id": str(item.id)}


@router.post("/{dataset_id}/import")
def import_items(
    dataset_id: UUID,
    payload: DatasetImport,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    dataset = get_user_dataset(db, dataset_id, user_id)
    for entry in payload.items:
        db.add(
            models.DatasetItem(
                dataset_id=dataset.id,
                input_text=entry.input_text,
                expected_output=entry.expected_output,
                tags=entry.tags,
            )
        )
    db.commit()
    return {"imported": len(payload.items)}


@router.post("/{dataset_id}/import-csv")
def import_csv_items(
    dataset_id: UUID,
    payload: DatasetCsvImport,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Validate the entire CSV before reusing JSON import; errors import no rows."""
    get_user_dataset(db, dataset_id, user_id)
    errors = []
    items = []
    reader = csv.reader(io.StringIO(payload.csv_text.lstrip("\ufeff")), strict=True)
    try:
        headers = next(reader, [])
        if "input" not in headers or len(headers) != len(set(headers)) or set(headers) - {"input", "expected_output", "metadata"}:
            raise HTTPException(status_code=422, detail={"errors": [{"row": 1, "message": "Headers must include input; optional columns: expected_output, metadata"}]})
        for values in reader:
            line = reader.line_num
            if len(items) + len(errors) >= 500:
                raise HTTPException(status_code=422, detail={"errors": [{"row": line, "message": "Maximum 500 rows per import"}]})
            if len(values) != len(headers):
                errors.append({"row": line, "message": "Column count does not match header"})
                continue
            row = dict(zip(headers, values))
            if not row["input"].strip():
                errors.append({"row": line, "message": "input must not be blank"})
                continue
            try:
                raw_metadata = row.get("metadata", "").strip()
                metadata = json.loads(raw_metadata) if raw_metadata else None
                if raw_metadata and not isinstance(metadata, dict):
                    raise ValueError("metadata must be a JSON object")
            except (ValueError, TypeError) as exc:
                errors.append({"row": line, "message": f"Invalid metadata: {exc}"})
                continue
            tags = {**(metadata or {}), "import_source": "csv", "import_row": line}
            items.append(DatasetItemCreate(input_text=row["input"], expected_output=row.get("expected_output") or None, tags=tags))
    except csv.Error as exc:
        errors.append({"row": reader.line_num, "message": str(exc)})
    if not items and not errors:
        errors.append({"row": 2, "message": "At least one data row is required"})
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "imported": 0})
    return import_items(dataset_id, DatasetImport(items=items), db, user_id)


@router.delete("/{dataset_id}/items/{item_id}", status_code=204)
def delete_item(
    dataset_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    get_user_dataset(db, dataset_id, user_id)
    item = (
        db.query(models.DatasetItem)
        .filter(models.DatasetItem.id == item_id, models.DatasetItem.dataset_id == dataset_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return None


@router.post("/{dataset_id}/add-run/{run_id}", status_code=201)
def add_run_input(
    dataset_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Copy the viewed run once; completed output is the default expected output."""
    dataset = get_user_dataset(db, dataset_id, user_id)
    run = get_user_run(db, run_id, user_id)
    items, skipped = copy_runs(db, dataset, [run], source="run_detail")
    item = items[0] if items else next(item for item in dataset.items if (item.tags or {}).get("source_run") == str(run.id))
    db.commit()
    return {"id": str(item.id), "added": len(items), "skipped": skipped}


@router.post("/{dataset_id}/capture")
def capture_runs(
    dataset_id: UUID,
    payload: DatasetCapture,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Capture traffic or the exact authorized members of a displayed cluster."""
    dataset = get_user_dataset(db, dataset_id, user_id)

    if payload.filter == "cluster":
        if not payload.run_ids or payload.cluster_signature is None:
            raise HTTPException(status_code=422, detail="Cluster capture requires run_ids and cluster_signature")
        candidates = [get_user_run(db, run_id, user_id) for run_id in dict.fromkeys(payload.run_ids)]
        if any(run.status != "failed" or error_signature(run.final_output) != payload.cluster_signature for run in candidates):
            raise HTTPException(status_code=400, detail="Run is not a member of this failure cluster")
        if len(candidates) > payload.limit:
            raise HTTPException(status_code=400, detail="limit must include every selected cluster member")
    else:
        query = (
            db.query(models.WorkflowRun)
            .join(models.WorkflowVersion, models.WorkflowRun.workflow_version_id == models.WorkflowVersion.id)
            .filter(models.WorkflowVersion.workflow_id == dataset.workflow_id)
            .order_by(models.WorkflowRun.created_at.desc())
        )
        if payload.filter == "failed":
            query = query.filter(models.WorkflowRun.status == "failed")
        candidates = query.limit(min(payload.limit * 5, 500)).all()
        if payload.filter == "low_eval":
            candidates = [run for run in candidates if isinstance((run.metrics_json or {}).get("eval_aggregate"), (int, float)) and run.metrics_json["eval_aggregate"] < payload.max_eval]
        candidates = [run for run in candidates if (run.input_text or "").strip()]
    items, skipped = copy_runs(db, dataset, candidates, source=payload.filter, limit=payload.limit)
    db.commit()
    return {"added": len(items), "skipped": skipped, "filter": payload.filter}
