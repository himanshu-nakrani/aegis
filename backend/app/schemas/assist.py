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


# ---------------------------------------------------------------------------
# edit-graph (NL graph edit returned as a reviewable diff)
# ---------------------------------------------------------------------------


class EditGraphRequest(BaseModel):
    workflow_id: UUID | None = None
    graph: dict
    instruction: str = Field(min_length=1, max_length=4000)


class EdgeRef(BaseModel):
    source: str
    target: str
    route: str | None = None


class GraphDiff(BaseModel):
    added_node_ids: list[str] = []
    removed_node_ids: list[str] = []
    changed_node_ids: list[str] = []
    added_edges: list[EdgeRef] = []
    removed_edges: list[EdgeRef] = []


class EditGraphResponse(BaseModel):
    proposed_graph: dict
    diff: GraphDiff
    notes: list[str] = []
    summary: str = ""


class _EditGraphDraft(BaseModel):
    """Gemini structured-output shape for edit-graph (mirrors GeneratedWorkflowDraft)."""

    nodes: list[GenNode]
    edges: list[GenEdge]
    notes: list[str] = []
    summary: str = ""


# ---------------------------------------------------------------------------
# compare (run 2-3 variants of one LLM node over a single sample)
# ---------------------------------------------------------------------------


class CompareVariant(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    config_overrides: dict = {}


class CompareRequest(BaseModel):
    node_type: str = Field(min_length=1, max_length=64)
    base_config: dict = {}
    variants: list[CompareVariant] = Field(min_length=1, max_length=3)
    input_text: str = Field(max_length=20_000)


class CompareVariantResult(BaseModel):
    label: str
    output: str | None = None
    latency_ms: int | None = None
    total_tokens: int | None = None
    cost_usd: float | None = None
    error: str | None = None


class CompareResponse(BaseModel):
    results: list[CompareVariantResult]


# ---------------------------------------------------------------------------
# generate-schema (magic-wand NL -> JSON Schema / regex)
# ---------------------------------------------------------------------------


class GenerateSchemaRequest(BaseModel):
    description: str = Field(min_length=1, max_length=4000)
    kind: str = "json_schema"  # json_schema | regex


class GenerateSchemaResponse(BaseModel):
    json_schema: dict | None = None
    regex: str | None = None
    notes: list[str] = []


class _GeneratedSchemaDraft(BaseModel):
    """Gemini structured-output shape. schema_object_json is a JSON-encoded
    string because Gemini cannot emit free-form objects (mirrors
    GenNode.config_json). Named to avoid shadowing BaseModel.schema."""

    schema_object_json: str | None = None
    regex: str | None = None
    notes: list[str] = []
