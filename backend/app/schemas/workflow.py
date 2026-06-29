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


class WorkflowResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    latest_version: WorkflowVersionResponse | None = None

    model_config = {"from_attributes": True}


class WorkflowListItem(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    version_count: int = 0
    latest_version_number: int | None = None

    model_config = {"from_attributes": True}