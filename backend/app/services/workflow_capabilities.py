"""Shared workflow graph capability checks."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.services.agent_tool_schema import attached_tool_node_ids, executable_nodes
from app.services.credentials import get_user_credential
from app.services.graph_validation import GraphValidationError
from app.services.llm_providers import (
    ProviderModel,
    api_key_available,
    provider_env_var,
    resolve_provider_model,
)

# Node types whose single LLM call runs on the node's selected provider
# (data.provider/model, defaulting to Google Gemini). Evaluation nodes are
# handled separately below — their provider depends on eval type/mode.
LLM_NODE_TYPES = {
    "agent",
    "router",
    "classifier",
    "summarizer",
    "translator",
    "extractor",
}


def _gemini_ref() -> ProviderModel:
    return ProviderModel(provider="google", model=settings.gemini_model)


def _node_provider_models(
    data: dict, node_type: str, context_ref: dict | None
) -> list[ProviderModel]:
    """Concrete provider targets a node needs (empty when it makes no LLM call).

    ``context_ref`` carrying ``_user_id`` lets the resolver pull a node's bound
    credential, so a provider selected with a credential resolves to a usable
    key even when no process-wide env key is set.
    """
    if node_type == "evaluation":
        eval_type = (data.get("evalType") or "llm").lower()
        if eval_type == "llm":
            eval_mode = (data.get("evalExecutionMode") or "parallel").lower()
            if eval_mode == "inline":
                # Inline judging compiles to an Agent on the node's model.
                return [resolve_provider_model(data, context_ref)]
            # Deferred judging executes in eval_runner on genai (Gemini-only)
            # regardless of the node's model selection.
            return [_gemini_ref()]
        if eval_type == "embedding":
            # Embedding similarity scores via genai embeddings; gate on Google
            # so graded runs keep real embeddings (pre-existing behavior).
            return [_gemini_ref()]
        # Other deterministic evals (exact/substring/regex/numeric/…) call no LLM.
        return []

    targets: list[ProviderModel] = []
    if node_type in LLM_NODE_TYPES:
        targets.append(resolve_provider_model(data, context_ref))
    # Google Search grounding runs on a Gemini agent regardless of the node's
    # model selection (the grounding tool is Gemini-only).
    if (
        node_type == "tool"
        and data.get("toolType") == "search"
        and data.get("searchProvider", "google") == "google"
    ):
        targets.append(_gemini_ref())
    return targets


def _workflow_provider_models(graph_json: dict | None, context_ref: dict | None) -> list[ProviderModel]:
    targets: list[ProviderModel] = []
    for node in executable_nodes(graph_json):
        data = node.get("data") or {}
        targets.extend(_node_provider_models(data, data.get("nodeType", "agent"), context_ref))
    # Attached tools are declarations, not independent workflow steps. Google
    # search still makes a nested native Gemini call and needs its ambient key.
    attached = attached_tool_node_ids(graph_json)
    for node in (graph_json or {}).get("nodes", []):
        if node.get("id") in attached:
            data = node.get("data") or {}
            targets.extend(_node_provider_models(data, "tool", context_ref))
    return targets


def validate_mcp_tool_bindings(graph_json: dict, db: Session, user_id: UUID) -> None:
    """Check MCP references using only credentials owned by this workflow user.

    Save/admission never contacts an MCP server. Discover tools in credential
    settings first; runtime rechecks the actual server before binding the tool.
    Call after graph schema validation so every reference has its stable shape.
    """
    for node in executable_nodes(graph_json):
        data = node.get("data") or {}
        if data.get("nodeType", "agent") != "agent":
            continue
        for reference in data.get("tools", []):
            if reference["kind"] != "mcp":
                continue
            credential = get_user_credential(db, user_id, credential_id=UUID(reference["credentialId"]))
            if credential is None or credential.type != "mcp":
                raise GraphValidationError(f"Agent '{node['id']}' MCP credential is unavailable for this workflow owner.")
            cache = credential.mcp_tool_cache
            if not cache:
                raise GraphValidationError(f"Discover tools for agent '{node['id']}' MCP credential before saving or running this workflow.")
            if not any(tool.get("name") == reference["toolName"] for tool in cache.get("tools", [])):
                raise GraphValidationError(f"Agent '{node['id']}' references an unavailable MCP tool '{reference['toolName']}'.")


def workflow_required_providers(graph_json: dict | None) -> set[str]:
    """LLM providers a graph needs at run time (from per-node model selection)."""
    return {pm.provider for pm in _workflow_provider_models(graph_json, None)}


def missing_provider_keys(graph_json: dict | None, user_id=None) -> list[str]:
    """Env vars for providers a graph needs but has no usable key for.

    A provider counts as available when its process-wide env key is set OR a
    node binds a credential that resolves to a key. Credential resolution is
    per-user, so pass ``user_id`` (the workflow owner) to honor bound keys;
    without it, only the env-level keys are considered.
    """
    context_ref = {"_user_id": str(user_id)} if user_id else None
    missing: set[str] = set()
    for pm in _workflow_provider_models(graph_json, context_ref):
        if not api_key_available(pm):
            missing.add(provider_env_var(pm.provider))
    return sorted(missing)


def workflow_needs_gemini(graph_json: dict | None) -> bool:
    return "google" in workflow_required_providers(graph_json)
