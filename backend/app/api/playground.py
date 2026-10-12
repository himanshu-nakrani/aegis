"""Standalone prompt playground — run a template against N model targets
without authoring a workflow. Results are ephemeral (not persisted)."""

from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user_id
from app.db.database import get_db
from app.schemas.prompt import (
    PlaygroundRunRequest,
    PlaygroundRunResponse,
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

    return PlaygroundRunResponse(
        rendered_template=rendered,
        prompt_id=str(payload.prompt_id) if payload.prompt_id else None,
        prompt_version=prompt_version,
        results=results,
    )
