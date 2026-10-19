from datetime import datetime
from uuid import UUID

import math

from pydantic import BaseModel, Field, field_validator


class WorkflowCreate(BaseModel):
    # Name/description land in workflows.name String(255) / Text — bound at
    # the schema so every endpoint using the model rejects oversized input.
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    graph_json: dict = Field(default_factory=lambda: {"nodes": [], "edges": []})


class WorkflowImportPayload(BaseModel):
    """Accepts full aegis-workflow-v1 export JSON or a partial payload with graph_json."""

    format: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    graph_json: dict | None = None
    workflow_id: str | None = Field(default=None, max_length=64)
    version_number: int | None = Field(default=None, ge=-2_147_483_648, le=2_147_483_647)
    version_id: str | None = Field(default=None, max_length=64)
    exported_at: str | None = Field(default=None, max_length=64)

    model_config = {"extra": "ignore"}


class WorkflowImportIntoExisting(BaseModel):
    format: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    graph_json: dict | None = None
    workflow_id: str | None = Field(default=None, max_length=64)
    version_number: int | None = Field(default=None, ge=-2_147_483_648, le=2_147_483_647)
    version_id: str | None = Field(default=None, max_length=64)
    exported_at: str | None = Field(default=None, max_length=64)
    save_as_new_version: bool = True

    model_config = {"extra": "ignore"}


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    webhook_url: str | None = Field(default=None, max_length=512)
    budget_json: dict | None = None

    @field_validator("budget_json")
    @classmethod
    def _validate_budget(cls, value: dict | None) -> dict | None:
        if value is None:
            return None
        if not isinstance(value, dict):
            raise ValueError("budget_json must be an object")
        allowed = {"cost_usd_per_day", "runs_per_hour", "tokens_per_run"}
        unknown = set(value) - allowed
        if unknown:
            raise ValueError(f"Unknown budget keys: {sorted(unknown)}")
        cleaned: dict = {}
        for key, raw in value.items():
            try:
                number = float(raw)
            except (TypeError, ValueError):
                raise ValueError(f"Budget {key!r} must be a number") from None
            if not math.isfinite(number) or number <= 0:
                raise ValueError(f"Budget {key!r} must be a positive finite number")
            cleaned[key] = number
        return cleaned or None




class WorkflowVersionCreate(BaseModel):
    graph_json: dict
    save_as_new_version: bool = False


class WorkflowVersionResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    version_number: int
    graph_json: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowVersionListItem(BaseModel):
    id: UUID
    workflow_id: UUID
    version_number: int
    created_at: datetime
    node_count: int = 0

    model_config = {"from_attributes": True}


class WorkflowResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    webhook_url: str | None = None
    created_at: datetime
    updated_at: datetime
    latest_version: WorkflowVersionResponse | None = None

    model_config = {"from_attributes": True}


class RunCompareResponse(BaseModel):
    run_a_id: UUID
    run_b_id: UUID
    run_a_scores: dict | None = None
    run_b_scores: dict | None = None
    delta: dict[str, float | None] = {}
    run_a_output: str | None = None
    run_b_output: str | None = None
    run_a_version: int | None = None
    run_b_version: int | None = None


class WorkflowListItem(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    version_count: int = 0
    latest_version_number: int | None = None
    published: bool = False
    is_external: bool = False

    model_config = {"from_attributes": True}


class ScheduledWorkflowInfo(BaseModel):
    schedule_id: str | None = None
    workflow_id: str
    workflow_name: str
    cron: str
    cron_valid: bool = True
    next_run_at: str | None = None
    next_runs: list[str] = []
    last_fired_at: str | None = None


class GuardrailPreviewRequest(BaseModel):
    text: str
    rules: dict = Field(default_factory=dict)


class GuardrailPreviewResponse(BaseModel):
    passed: bool
    message: str
    severity: str = "ok"
    would_block: bool = False


class UploadKnowledgeResponse(BaseModel):
    """Result of POST /api/workflows/{id}/knowledge/upload."""

    document_id: UUID  # shared source_document_id of the created chunks
    chunks_created: int
    chunk_size: int
    overlap: int
    filename: str
    mime: str
    truncated: bool = False
