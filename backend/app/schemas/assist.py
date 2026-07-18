"""Schemas for the AI-assist endpoints.

The public request/response models match the frontend contract in
frontend/src/lib/api.ts exactly. The ``Gen*``/``*Draft`` models are the
structured-output shapes handed to Gemini's ``response_schema`` — Gemini cannot
emit free-form dicts, so node config is carried as a JSON-encoded string that we
parse defensively after the call.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# generate-workflow
# ---------------------------------------------------------------------------


class GenerateWorkflowRequest(BaseModel):
    description: str = Field(min_length=1, max_length=4000)


class GenerateWorkflowResponse(BaseModel):
    graph: dict
    notes: list[str]


class GenNode(BaseModel):
    """A node as returned by Gemini structured output."""

    id: str
    node_type: str
    label: str
    config_json: str | None = None


class GenEdge(BaseModel):
    source: str
    target: str
    route: str | None = None


class GeneratedWorkflowDraft(BaseModel):
    nodes: list[GenNode]
    edges: list[GenEdge]
    notes: list[str]


# ---------------------------------------------------------------------------
# suggest-nodes
# ---------------------------------------------------------------------------


class SuggestNodesRequest(BaseModel):
    workflow_id: UUID | None = None
    graph: dict
    selected_node_id: str | None = None


class NodeSuggestion(BaseModel):
    node_type: str
    label: str
    reason: str
    default_data: dict | None = None


class SuggestNodesResponse(BaseModel):
    suggestions: list[NodeSuggestion]


class _SuggestionItem(BaseModel):
    node_type: str
    label: str
    reason: str


class SuggestionsDraft(BaseModel):
    suggestions: list[_SuggestionItem]


# ---------------------------------------------------------------------------
# explain-run
# ---------------------------------------------------------------------------


class ExplainRunRequest(BaseModel):
    run_id: UUID


class SuggestedFix(BaseModel):
    title: str
    detail: str


class ExplainRunResponse(BaseModel):
    explanation_md: str
    suggested_fixes: list[SuggestedFix]
