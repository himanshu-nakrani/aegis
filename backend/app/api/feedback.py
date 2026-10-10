"""Human feedback on runs: thumbs + comment, feeding golden datasets."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.services.annotation import enqueue_run
from app.services.dataset_service import copy_runs, feedback_dataset, get_user_dataset, get_user_run

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    run_id: UUID
    node_id: str | None = None
    rating: int = Field(ge=-1, le=1)
    comment: str | None = Field(default=None, max_length=2000)
    dataset_id: UUID | None = None


@router.post("", status_code=201)
def create_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    if payload.rating == 0:
        raise HTTPException(status_code=400, detail="rating must be +1 or -1")
    run = get_user_run(db, payload.run_id, user_id)
    copied = None
    annotation = None
    if payload.rating == -1:
        dataset = get_user_dataset(db, payload.dataset_id, user_id) if payload.dataset_id else feedback_dataset(db, run, user_id)
        items, skipped = copy_runs(db, dataset, [run], source="negative_feedback", use_output=False)
        item = items[0] if items else next(item for item in dataset.items if (item.tags or {}).get("source_run") == str(run.id))
        copied = {"dataset_id": str(dataset.id), "dataset_name": dataset.name, "item_id": str(item.id), "added": len(items), "skipped": skipped}
        # Thumbs-down means a human wants this run reviewed — stage it in the
        # annotation queue (deduped on run_id) even though an unlabelled row
        # already landed in the feedback dataset.
        task, _ = enqueue_run(db, run, user_id, source="negative_feedback")
        # Point the task at the feedback row so labeling fills it in place
        # instead of duplicating the run in a second dataset.
        if task.dataset_item_id is None:
            task.dataset_item_id = item.id
        annotation = {"task_id": str(task.id), "status": task.status}
    fb = models.Feedback(
        user_id=user_id,
        run_id=payload.run_id,
        node_id=payload.node_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(fb)
    db.commit()
    return {"id": str(fb.id), "dataset": copied, "annotation": annotation}


@router.get("/run/{run_id}")
def list_run_feedback(
    run_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    rows = (
        db.query(models.Feedback)
        .filter(models.Feedback.run_id == run_id, models.Feedback.user_id == user_id)
        .order_by(models.Feedback.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(f.id),
            "node_id": f.node_id,
            "rating": f.rating,
            "comment": f.comment,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in rows
    ]
