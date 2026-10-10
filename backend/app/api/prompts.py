"""Prompt registry CRUD + version endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.schemas.prompt import (
    PromptCreate,
    PromptDetail,
    PromptSummary,
    PromptUpdate,
    PromptVersionCreate,
    PromptVersionOut,
)
from app.services.prompt_service import extract_variables, get_prompt, get_version

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


def _version_out(row: models.PromptVersion) -> PromptVersionOut:
    return PromptVersionOut(
        version=row.version,
        template=row.template,
        variables=list(row.variables or []),
        notes=row.notes,
        created_by=str(row.created_by) if row.created_by else None,
        created_at=row.created_at,
    )


def _summary(row: models.Prompt) -> PromptSummary:
    return PromptSummary(
        id=row.id,
        name=row.name,
        description=row.description,
        current_version=row.current_version,
        version_count=len(row.versions),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _detail(row: models.Prompt) -> PromptDetail:
    return PromptDetail(
        **_summary(row).model_dump(),
        versions=[_version_out(v) for v in row.versions],
    )


def _owned(db: Session, prompt_id: UUID, user_id: UUID) -> models.Prompt:
    prompt = get_prompt(db, prompt_id, user_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


@router.get("", response_model=list[PromptSummary])
def list_prompts(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    rows = (
        db.query(models.Prompt)
        .filter(models.Prompt.user_id == user_id)
        .order_by(models.Prompt.updated_at.desc())
        .all()
    )
    return [_summary(r) for r in rows]


@router.post("", response_model=PromptDetail, status_code=201)
def create_prompt(
    payload: PromptCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    if not payload.name.strip() or not payload.template.strip():
        raise HTTPException(status_code=400, detail="name and template are required")
    existing = (
        db.query(models.Prompt)
        .filter(models.Prompt.user_id == user_id, models.Prompt.name == payload.name.strip())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Prompt '{payload.name.strip()}' already exists")
    prompt = models.Prompt(
        user_id=user_id,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        current_version=1,
    )
    prompt.versions.append(
        models.PromptVersion(
            version=1,
            template=payload.template,
            variables=extract_variables(payload.template),
            notes=(payload.notes or "").strip() or None,
            created_by=user_id,
        )
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return _detail(prompt)


@router.get("/{prompt_id}", response_model=PromptDetail)
def get_prompt_detail(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return _detail(_owned(db, prompt_id, user_id))


@router.patch("/{prompt_id}", response_model=PromptDetail)
def update_prompt(
    prompt_id: UUID,
    payload: PromptUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    prompt = _owned(db, prompt_id, user_id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        prompt.name = name
    if payload.description is not None:
        prompt.description = payload.description.strip() or None
    db.commit()
    db.refresh(prompt)
    return _detail(prompt)


@router.delete("/{prompt_id}", status_code=204)
def delete_prompt(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    db.delete(_owned(db, prompt_id, user_id))
    db.commit()


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionOut])
def list_versions(
    prompt_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    prompt = _owned(db, prompt_id, user_id)
    return [_version_out(v) for v in prompt.versions]


@router.post("/{prompt_id}/versions", response_model=PromptVersionOut, status_code=201)
def create_version(
    prompt_id: UUID,
    payload: PromptVersionCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Add a new version and advance ``current_version`` to it."""
    prompt = _owned(db, prompt_id, user_id)
    if not payload.template.strip():
        raise HTTPException(status_code=400, detail="template is required")
    next_number = max((v.version for v in prompt.versions), default=0) + 1
    row = models.PromptVersion(
        prompt_id=prompt.id,
        version=next_number,
        template=payload.template,
        variables=extract_variables(payload.template),
        notes=(payload.notes or "").strip() or None,
        created_by=user_id,
    )
    prompt.current_version = next_number
    db.add(row)
    db.commit()
    db.refresh(row)
    return _version_out(row)


@router.get("/{prompt_id}/versions/{version}", response_model=PromptVersionOut)
def get_version_detail(
    prompt_id: UUID,
    version: int,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    prompt = _owned(db, prompt_id, user_id)
    row = get_version(db, prompt, version)
    if not row:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    return _version_out(row)


@router.post("/{prompt_id}/versions/{version}/rollback", response_model=PromptDetail)
def rollback_version(
    prompt_id: UUID,
    version: int,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Point ``current_version`` back at an existing version (no history loss)."""
    prompt = _owned(db, prompt_id, user_id)
    if not get_version(db, prompt, version):
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    prompt.current_version = version
    db.commit()
    db.refresh(prompt)
    return _detail(prompt)
