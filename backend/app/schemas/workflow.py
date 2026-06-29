from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    graph_json: dict = Field(default_factory=lambda: {"nodes": [], "edges": []})


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    webhook_url: str | None = None


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

    model_config = {"from_attributes": True}