"""Standalone prompt playground — run a template against N model targets
without authoring a workflow. Results are ephemeral (not persisted)."""

from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db import models
from app.db.database import get_db
from app.schemas.prompt import (
    PlaygroundRunRequest,
    PlaygroundRunResponse,
    PlaygroundRunSummary,
    PlaygroundVariantResult,
)
from app.services.llm_providers import generate_text, resolve_provider_model
from app.services.prompt_service import get_prompt, get_version, render_prompt

router = APIRouter(prefix="/api/playground", tags=["playground"])


@router.post("/run", response_model=PlaygroundRunResponse)
def run_playground(
    payload: PlaygroundRunRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    template: str | None = None
    prompt_version: int | None = None

    if payload.prompt_id is not None:
        prompt = get_prompt(db, payload.prompt_id, user_id)
        if not prompt:
            raise HTTPException(status_code=404, detail="Prompt not found")
        row = get_version(db, prompt, payload.version)
        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"Version {payload.version} not found for prompt '{prompt.name}'",
            )
        template = row.template
        prompt_version = row.version
    elif payload.template and payload.template.strip():
        template = payload.template

    if template is None:
        raise HTTPException(status_code=400, detail="Provide prompt_id or a template")

    rendered = render_prompt(template, payload.variables)
    # resolve_provider_model reads the owning user from context_ref for
    # credential lookup — same seam the executor uses.
    context_ref = {"_user_id": str(user_id)}

    from app.services.tracing import operation_span

    results: list[PlaygroundVariantResult] = []
    for target in payload.models:
        start = time.monotonic()
        try:
            # resolve_provider_model rejects caller-supplied apiBase/
            # credential base_url outright; generate_text enforces DNS
            # policy on the resolved endpoint. Failures land per-variant.
            pm = resolve_provider_model(
                {
                    "provider": target.provider,
                    "model": target.model,
                    "api_base": target.api_base,
                    "credentialId": target.credential_id,
                    "credentialName": target.credential_name,
                },
                context_ref,
            )
            with operation_span(
                "playground.variant",
                {
                    "aegis.operation": "playground",
                    "aegis.provider": pm.provider,
                    "langsmith.metadata.aegis_operation": "playground",
                },
            ):
                output = generate_text(pm, system_instruction="", contents=rendered)
            results.append(
                PlaygroundVariantResult(
                    provider=pm.provider,
                    model=pm.model,
                    output=output,
                    latency_ms=int((time.monotonic() - start) * 1000),
                )
            )
        except Exception as exc:  # noqa: BLE001 — per-variant isolation
            results.append(
                PlaygroundVariantResult(
                    provider=target.provider,
                    model=target.model,
                    error=str(exc)[:500],
                    latency_ms=int((time.monotonic() - start) * 1000),
                )
            )

    stored = _persist_playground_run(
        db,
        user_id,
        prompt_id=payload.prompt_id,
        prompt_version=prompt_version,
        template=template,
        rendered=rendered,
        variables=payload.variables,
        results=results,
    )
    return PlaygroundRunResponse(
        id=stored.id,
        rendered_template=rendered,
        prompt_id=str(payload.prompt_id) if payload.prompt_id else None,
        prompt_version=prompt_version,
        results=results,
        created_at=stored.created_at,
    )


def _clip(value: str | None, limit: int = 8000) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[:limit] + "…"


def _persist_playground_run(
    db: Session,
    user_id: UUID,
    *,
    prompt_id: UUID | None,
    prompt_version: int | None,
    template: str,
    rendered: str,
    variables: dict | None,
    results: list[PlaygroundVariantResult],
) -> models.PlaygroundRun:
    row = models.PlaygroundRun(
        user_id=user_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        template=_clip(template, 20000) or "",
        rendered=_clip(rendered, 20000) or "",
        variables_json=variables or {},
        results_json=[
            {
                "provider": item.provider,
                "model": item.model,
                "output": _clip(item.output),
                "error": _clip(item.error, 500),
                "latency_ms": item.latency_ms,
            }
            for item in results
        ],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/runs", response_model=list[PlaygroundRunSummary])
def list_playground_runs(
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    limit: int = 20,
):
    rows = (
        db.query(models.PlaygroundRun)
        .filter(models.PlaygroundRun.user_id == user_id)
        .order_by(models.PlaygroundRun.created_at.desc())
        .limit(max(1, min(limit, 50)))
        .all()
    )
    return [
        PlaygroundRunSummary(
            id=row.id,
            prompt_id=str(row.prompt_id) if row.prompt_id else None,
            prompt_version=row.prompt_version,
            rendered_template=row.rendered,
            created_at=row.created_at,
            results=[PlaygroundVariantResult(**item) for item in (row.results_json or [])],
        )
        for row in rows
    ]
