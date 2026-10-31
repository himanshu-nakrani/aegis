"""Knowledge libraries: the RAG management page."""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db.database import SessionLocal, get_db
from app.services.documents import MAX_UPLOAD_BYTES
from app.services.knowledge_library import (
    add_file,
    add_text,
    create_base,
    delete_base,
    delete_source,
    fetch_public_document,
    list_bases,
    list_sources,
    query_base,
    reindex_base,
    update_base,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    settings: dict | None = None


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    settings: dict | None = None


class KnowledgeTextCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    text: str = Field(min_length=1)
    tags: list[str] | None = None


class KnowledgeUrlCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    title: str | None = Field(default=None, max_length=255)
    tags: list[str] | None = None


class KnowledgeQuery(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    settings: dict | None = None
    tags: list[str] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    method: str | None = None


def _tags_from_form(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    return [part.strip() for part in raw.split(",") if part.strip()]


@router.get("")
def get_libraries(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return list_bases(db, user_id)


@router.post("", status_code=201)
def post_library(
    payload: KnowledgeBaseCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return create_base(
        db,
        user_id,
        name=payload.name,
        description=payload.description,
        settings=payload.settings,
    )


@router.patch("/{base_id}")
def patch_library(
    base_id: UUID,
    payload: KnowledgeBaseUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return update_base(
        db,
        user_id,
        base_id,
        name=payload.name,
        description=payload.description,
        settings=payload.settings,
    )


@router.delete("/{base_id}", status_code=204)
def remove_library(
    base_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    delete_base(db, user_id, base_id)


@router.get("/{base_id}/documents")
def get_documents(
    base_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return list_sources(db, user_id, base_id)


@router.post("/{base_id}/documents", status_code=201)
def post_document(
    base_id: UUID,
    payload: KnowledgeTextCreate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return add_text(db, user_id, base_id, title=payload.title, text=payload.text, tags=payload.tags)


@router.post("/{base_id}/documents/upload", status_code=201)
async def post_upload(
    base_id: UUID,
    request: Request,
    user_id: UUID = Depends(get_current_user_id),
):
    body = await request.body()
    if len(body) > MAX_UPLOAD_BYTES + 64_000:
        raise HTTPException(status_code=413, detail="File exceeds the 8MB limit")
    from app.api.workflows import _parse_capped_multipart

    form = await _parse_capped_multipart(request, body, MAX_UPLOAD_BYTES)
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="file is required")
    content = await upload.read()
    title = form.get("title")
    tags = form.get("tags")
    title_text = title if isinstance(title, str) else None
    tag_text = tags if isinstance(tags, str) else None

    def _store():
        db = SessionLocal()
        try:
            return add_file(
                db,
                user_id,
                base_id,
                filename=getattr(upload, "filename", None) or "upload.txt",
                content=content,
                mime=getattr(upload, "content_type", None),
                title=title_text,
                tags=_tags_from_form(tag_text),
            )
        finally:
            db.close()

    return await asyncio.to_thread(_store)


@router.post("/{base_id}/documents/url", status_code=201)
async def post_url(
    base_id: UUID,
    payload: KnowledgeUrlCreate,
    user_id: UUID = Depends(get_current_user_id),
):
    try:
        content, mime, filename = await fetch_public_document(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _store():
        db = SessionLocal()
        try:
            result = add_file(
                db,
                user_id,
                base_id,
                filename=filename,
                content=content,
                mime=mime,
                title=payload.title,
                tags=payload.tags,
            )
            result["source_url"] = payload.url
            return result
        finally:
            db.close()

    result = await asyncio.to_thread(_store)
    # Stamp the URL onto the chunks the file path did not see.
    db = SessionLocal()
    try:
        from app.db import models

        db.query(models.KnowledgeDocument).filter(
            models.KnowledgeDocument.source_document_id == UUID(result["source_document_id"])
        ).update({models.KnowledgeDocument.source_url: payload.url[:2048]})
        db.commit()
    finally:
        db.close()
    result["source_url"] = payload.url
    return result


@router.delete("/{base_id}/documents/{source_id}", status_code=200)
def remove_document(
    base_id: UUID,
    source_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    deleted = delete_source(db, user_id, base_id, source_id)
    return {"deleted_chunks": deleted}


@router.post("/{base_id}/reindex")
def post_reindex(
    base_id: UUID,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    count = reindex_base(db, user_id, base_id)
    return {"reindexed": count}


@router.post("/{base_id}/query")
def post_query(
    base_id: UUID,
    payload: KnowledgeQuery,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return query_base(
        db,
        user_id,
        base_id,
        query=payload.query,
        settings_override=payload.settings,
        tags=payload.tags,
        top_k=payload.top_k,
        method=payload.method,
    )
