"""Fix-this-run. A repair may update the draft. It never publishes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db.database import get_db
from app.services.run_repair import (
    _repair,
    add_proposal,
    adopt,
    create_candidate,
    open_repair,
    public_repair,
    record_context,
    validate_repair,
)

router = APIRouter(prefix="/api/run-repairs", tags=["run-repairs"])


class RepairCreate(BaseModel):
    source_run_id: UUID


class RepairContextBody(BaseModel):
    consent: list[str] = Field(min_length=1)


class RepairProposalBody(BaseModel):
    graph_json: dict
    origin: str = "manual"
    diagnosis: dict | None = None


class RepairValidationBody(BaseModel):
    expected_output: str | None = None


class RepairAdoptBody(BaseModel):
    expected_draft_revision: int
    adoption_mode: str


@router.post("", status_code=201)
def post_repair(
    payload: RepairCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = open_repair(db, user_id=user_id, source_run_id=payload.source_run_id)
    db.commit()
    db.refresh(repair)
    return public_repair(repair)


@router.get("/{repair_id}")
def get_repair(
    repair_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return public_repair(_repair(db, user_id, repair_id))


@router.post("/{repair_id}/context")
def post_context(
    repair_id: UUID,
    payload: RepairContextBody,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = _repair(db, user_id, repair_id)
    record_context(db, repair, consent=payload.consent)
    db.commit()
    db.refresh(repair)
    return public_repair(repair)


@router.post("/{repair_id}/proposals")
def post_proposal(
    repair_id: UUID,
    payload: RepairProposalBody,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = _repair(db, user_id, repair_id)
    add_proposal(
        db,
        repair,
        graph=payload.graph_json,
        origin=payload.origin,
        diagnosis=payload.diagnosis,
    )
    db.commit()
    db.refresh(repair)
    return public_repair(repair)


@router.post("/{repair_id}/candidate")
def post_candidate(
    repair_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = _repair(db, user_id, repair_id)
    create_candidate(db, repair)
    db.commit()
    db.refresh(repair)
    return public_repair(repair)


@router.post("/{repair_id}/validations")
def post_validation(
    repair_id: UUID,
    payload: RepairValidationBody,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = _repair(db, user_id, repair_id)
    validation = validate_repair(db, repair, expected_output=payload.expected_output)
    db.commit()
    db.refresh(repair)
    body = public_repair(repair)
    body["validation"] = {
        "id": str(validation.id),
        "status": validation.status,
        "publishable": False,
        "summary": validation.summary_json,
    }
    return body


@router.post("/{repair_id}/adopt")
def post_adopt(
    repair_id: UUID,
    payload: RepairAdoptBody,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    repair = _repair(db, user_id, repair_id)
    adopt(
        db,
        repair,
        expected_revision=payload.expected_draft_revision,
        mode=payload.adoption_mode,
    )
    db.commit()
    db.refresh(repair)
    return public_repair(repair)
