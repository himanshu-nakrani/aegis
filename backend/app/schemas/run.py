from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RunCreate(BaseModel):
    workflow_id: UUID
    version_id: UUID | None = None
    input_text: str


class RunApprovalPayload(BaseModel):
    approved: bool
    comment: str | None = None


class NodeResultResponse(BaseModel):
    id: UUID
    node_id: str
    node_type: str
    node_label: str
    status: str
    output: str | None
    evaluation_scores: dict | None
    guardrail_status: str | None
    latency_ms: int | None
    token_usage: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunResponse(BaseModel):
    id: UUID
    workflow_version_id: UUID
    status: str
    input_text: str
    final_output: str | None
    metrics_json: dict | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    node_results: list[NodeResultResponse] = []

    model_config = {"from_attributes": True}


class RunListItem(BaseModel):
    id: UUID
    workflow_version_id: UUID
    workflow_id: UUID | None = None
    workflow_name: str | None = None
    status: str
    input_text: str
    final_output: str | None
    created_at: datetime
    completed_at: datetime | None
    eval_aggregate: float | None = None
    eval_passed: bool | None = None
    guardrail_blocked: bool = False

    model_config = {"from_attributes": True}


class TimelineNode(BaseModel):
    """One node execution positioned on the run's timeline (waterfall span)."""

    node_id: str
    node_type: str
    label: str | None = None
    status: str
    latency_ms: int | None = None
    # Offset from run start to this node's start, and its span width (ms).
    start_offset_ms: int
    duration_ms: int


class RunTimelineResponse(BaseModel):
    run_id: UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    # Total run wall time in ms (completed_at - started_at), or None if unknown.
    total_duration_ms: int | None = None
    nodes: list[TimelineNode] = []