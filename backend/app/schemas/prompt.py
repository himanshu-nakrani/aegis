"""Pydantic contracts for the prompt registry and playground."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PromptVersionOut(BaseModel):
    version: int
    template: str
    variables: list[str] = []
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None


class PromptSummary(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    current_version: int
    version_count: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PromptDetail(PromptSummary):
    versions: list[PromptVersionOut] = []


class PromptCreate(BaseModel):
    name: str
    description: str | None = None
    template: str
    notes: str | None = None


class PromptUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class PromptVersionCreate(BaseModel):
    template: str
    notes: str | None = None


class PromptRefOut(BaseModel):
    prompt_id: str
    version: int


class PlaygroundModelTarget(BaseModel):
    """One {provider, model} variant — same shape experiments matrix uses."""

    provider: str
    model: str
    api_base: str | None = None
    credential_id: str | None = None
    credential_name: str | None = None


class PlaygroundRunRequest(BaseModel):
    prompt_id: UUID | None = None
    version: int | None = None
    template: str | None = None
    variables: dict[str, str] = {}
    models: list[PlaygroundModelTarget] = Field(min_length=1, max_length=10)


class PlaygroundVariantResult(BaseModel):
    provider: str
    model: str
    output: str | None = None
    error: str | None = None
    latency_ms: int | None = None


class PlaygroundRunResponse(BaseModel):
    id: UUID | None = None
    rendered_template: str
    prompt_id: str | None = None
    prompt_version: int | None = None
    results: list[PlaygroundVariantResult]
    created_at: datetime | None = None


class PlaygroundRunSummary(BaseModel):
    id: UUID
    prompt_id: str | None = None
    prompt_version: int | None = None
    rendered_template: str
    created_at: datetime | None = None
    results: list[PlaygroundVariantResult]
