"""Shared workflow graph capability checks."""

from __future__ import annotations

from app.services.model_ref import node_ref, provider_available, provider_env_var

# Node types that make at least one LLM call (their provider comes from the
# node's modelProvider/model data keys, defaulting to Google Gemini).
LLM_NODE_TYPES = {
    "agent",
    "evaluation",
    "router",
    "classifier",
    "summarizer",
    "translator",
    "extractor",
}


def workflow_required_providers(graph_json: dict | None) -> set[str]:
    """LLM providers a graph needs at run time (from per-node model selection)."""
    providers: set[str] = set()
    for node in (graph_json or {}).get("nodes", []):
        data = node.get("data", {}) or {}
        node_type = data.get("nodeType")
        if node_type in LLM_NODE_TYPES:
            # node_ref mirrors the compiler: an openai/anthropic selection
            # without a concrete model falls back to the default Gemini ref.
            providers.add(node_ref(data).provider)
        # Google Search grounding runs on a Gemini agent regardless of the
        # node's model selection (the grounding tool is Gemini-only).
        if (
            node_type == "tool"
            and data.get("toolType") == "search"
            and data.get("searchProvider", "google") == "google"
        ):
            providers.add("google")
    return providers


def missing_provider_keys(graph_json: dict | None) -> list[str]:
    """Env vars for providers the graph needs but no API key is configured for."""
    return sorted(
        provider_env_var(provider)
        for provider in workflow_required_providers(graph_json)
        if not provider_available(provider)
    )


def workflow_needs_gemini(graph_json: dict | None) -> bool:
    return "google" in workflow_required_providers(graph_json)
