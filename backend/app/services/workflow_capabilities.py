"""Shared workflow graph capability checks."""

from __future__ import annotations

from app.services.llm_providers import (
    provider_configured,
    provider_env_var,
    resolve_provider_model,
)

# Node types whose single LLM call runs on the node's selected provider
# (data.modelProvider/model, defaulting to Google Gemini). Evaluation nodes
# are handled separately below — their provider depends on eval type/mode.
LLM_NODE_TYPES = {
    "agent",
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
        # Mirror the compiler's defaulting: a node without an explicit
        # nodeType is built as an agent, so it must gate like one.
        node_type = data.get("nodeType", "agent")
        if node_type == "evaluation":
            eval_type = (data.get("evalType") or "llm").lower()
            if eval_type == "llm":
                eval_mode = (data.get("evalExecutionMode") or "parallel").lower()
                if eval_mode == "inline":
                    # Inline judging compiles to an Agent on the node's model.
                    providers.add(resolve_provider_model(data, None).provider)
                else:
                    # Deferred judging executes in eval_runner on genai
                    # (Gemini-only) regardless of the node's model selection.
                    providers.add("google")
            elif eval_type == "embedding":
                # Embedding similarity scores via genai embeddings; without the
                # key it silently degrades to hashing vectors — gate on Google
                # so graded runs keep real embeddings (pre-existing behavior).
                providers.add("google")
            # Other deterministic evals (exact/substring/regex/numeric/…) call no LLM.
            continue
        if node_type in LLM_NODE_TYPES:
            # node_ref mirrors the compiler: an openai/anthropic selection
            # without a concrete model falls back to the default Gemini ref.
            providers.add(resolve_provider_model(data, None).provider)
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
        if not provider_configured(provider)
    )


def workflow_needs_gemini(graph_json: dict | None) -> bool:
    return "google" in workflow_required_providers(graph_json)
