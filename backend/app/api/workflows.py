from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import models
from app.db.database import get_db
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowListItem,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionResponse,
)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


def _latest_version(db: Session, workflow_id: UUID) -> models.WorkflowVersion | None:
    return (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .first()
    )


@router.get("", response_model=list[WorkflowListItem])
def list_workflows(db: Session = Depends(get_db)):
    workflows = db.query(models.Workflow).order_by(models.Workflow.updated_at.desc()).all()
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
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)):
    workflow = models.Workflow(name=payload.name, description=payload.description)
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
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(version),
    )


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: UUID, db: Session = Depends(get_db)):
    workflow = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    latest = _latest_version(db, workflow_id)
    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(latest) if latest else None,
    )


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(workflow_id: UUID, payload: WorkflowUpdate, db: Session = Depends(get_db)):
    workflow = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.name is not None:
        workflow.name = payload.name
    if payload.description is not None:
        workflow.description = payload.description

    db.commit()
    db.refresh(workflow)
    latest = _latest_version(db, workflow_id)

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        latest_version=WorkflowVersionResponse.model_validate(latest) if latest else None,
    )


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionResponse])
def list_versions(workflow_id: UUID, db: Session = Depends(get_db)):
    versions = (
        db.query(models.WorkflowVersion)
        .filter(models.WorkflowVersion.workflow_id == workflow_id)
        .order_by(models.WorkflowVersion.version_number.desc())
        .all()
    )
    return versions


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionResponse)
def save_version(workflow_id: UUID, payload: WorkflowVersionCreate, db: Session = Depends(get_db)):
    workflow = db.query(models.Workflow).filter(models.Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

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