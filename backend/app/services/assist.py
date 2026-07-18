"""AI-assist services: workflow generation, node suggestions, run explanation.

All three features wrap Gemini (google.genai) with structured output, following
the pattern in app/services/guardrail.py. Node config is round-tripped as a
JSON string because Gemini's response_schema cannot express free-form dicts.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Any

from fastapi import HTTPException, status

from app.config import settings
from app.schemas.assist import (
    ExplainRunResponse,
    GeneratedWorkflowDraft,
    NodeSuggestion,
    SuggestedFix,
    SuggestionsDraft,
)
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.node_registry import NODE_REGISTRY, NODE_TYPES_BY_ID


class AssistError(Exception):
    """Raised when the assistant cannot produce a usable result (mapped to 422)."""


# ---------------------------------------------------------------------------
# Node catalog prompt (built once at import)
# ---------------------------------------------------------------------------

# Required / important data keys per node type, derived from compiler.py and
# node_handlers.py — NOT guessed. Config is nested under node ``data``.
_REQUIRED_DATA_KEYS: dict[str, str] = {
    "trigger": "triggerType (manual|webhook|schedule)",
    "end": "(no config)",
    "input_schema": "inputFields: [{key, type, required}]",
    "if": "ifCondition: {left, operator, right}; branches route 'true'/'false'",
    "switch": "switchValue, switchCases: [str], switchDefault; one edge per case + default",
    "filter": "filterCondition: {left, operator, right}",
    "agent": "instruction (system prompt)",
    "summarizer": "summaryStyle",
    "translator": "targetLanguage",
    "extractor": "extractFields: [str]",
    "tool": "toolType (calculator|http|search); http needs httpUrl/httpMethod; search needs searchProvider",
    "transform": "template (with {{expressions}})",
    "set_fields": "setFields: {key: value}",
    "code": "code (sandboxed Python; set `result`)",
    "memory_store": "memoryNamespace, memoryKey, memoryValue",
    "memory_retrieve": "memoryNamespace, memoryKey",
    "kb_retrieve": "kbQuery, kbDocuments: [str], kbTopK (needs KB docs configured)",
    "human_approval": "approvalReview",
    "sub_workflow": "subWorkflowId, subWorkflowInput",
    "integration": "integrationType (slack|discord|email|postgres); needs credentialId/credentialName + a message/body/query",
    "json_parse": "jsonPath",
    "delay": "delaySeconds",
    "evaluation": "evalPreset or criteria, evalType",
    "guardrail": "rules: {guardrail_type, blocked_keywords, fail_behavior}; fail_behavior='route' branches pass/failed",
    "router": "routes: [str]; one outgoing edge per route (edge route set)",
    "classifier": "categories: [str]; one outgoing edge per category (edge route set)",
    "join": "(no config; fan-in for parallel branches)",
}


def _node_catalog_prompt() -> str:
    lines: list[str] = ["AVAILABLE NODE TYPES (node_type — label [category]: description | data keys):"]
    for meta in NODE_REGISTRY:
        node_type = meta["type"]
        if not meta.get("executable", True):
            continue  # skip annotation-only nodes (note)
        label = meta.get("label", node_type)
        category = meta.get("category", "")
        description = meta.get("description", "")
        branching = " [BRANCHING]" if meta.get("branches") else ""
        keys = _REQUIRED_DATA_KEYS.get(node_type, "")
        desc = f": {description}" if description else ""
        lines.append(
            f"- {node_type} — {label} [{category}]{branching}{desc} | data: {keys}"
        )
    return "\n".join(lines)


_NODE_CATALOG = _node_catalog_prompt()


_GRAPH_RULES = (
    "GRAPH RULES (validation is strict — a workflow that breaks any rule is rejected):\n"
    "- Exactly ONE 'trigger' node; it is the entry (no incoming edges).\n"
    "- Exactly ONE 'end' node; it is the sole terminal (no outgoing edges) and must be reachable.\n"
    "- The graph must be acyclic (no cycles).\n"
    "- Every node must be reachable from the trigger.\n"
    "- Branching nodes (router/classifier/if/switch, and guardrail with fail_behavior='route') "
    "must have one outgoing edge per route, and each such edge MUST set its 'route' to the "
    "matching route/category/branch/case value.\n"
    "- Non-branch nodes have a single unlabelled outgoing edge (route null).\n"
    "- Put node configuration in config_json as a JSON object string (e.g. "
    '"{\\"instruction\\": \\"...\\"}"). Use null when a node needs no config.\n'
)


_FEW_SHOT = """EXAMPLE 1 — simple agent flow
{
  "nodes": [
    {"id": "trigger", "node_type": "trigger", "label": "Trigger", "config_json": "{\\"triggerType\\": \\"manual\\"}"},
    {"id": "agent", "node_type": "agent", "label": "LLM Agent", "config_json": "{\\"instruction\\": \\"You are a helpful assistant. Answer the user clearly.\\"}"},
    {"id": "end", "node_type": "end", "label": "End", "config_json": null}
  ],
  "edges": [
    {"source": "trigger", "target": "agent", "route": null},
    {"source": "agent", "target": "end", "route": null}
  ],
  "notes": ["Refine the agent instruction for your use case."]
}

EXAMPLE 2 — classifier with two branches
{
  "nodes": [
    {"id": "trigger", "node_type": "trigger", "label": "Intake", "config_json": "{\\"triggerType\\": \\"manual\\"}"},
    {"id": "classify", "node_type": "classifier", "label": "Classify request", "config_json": "{\\"categories\\": [\\"billing\\", \\"support\\"]}"},
    {"id": "billing", "node_type": "agent", "label": "Billing reply", "config_json": "{\\"instruction\\": \\"Answer the billing question.\\"}"},
    {"id": "support", "node_type": "agent", "label": "Support reply", "config_json": "{\\"instruction\\": \\"Answer the support question.\\"}"},
    {"id": "end", "node_type": "end", "label": "End", "config_json": null}
  ],
  "edges": [
    {"source": "trigger", "target": "classify", "route": null},
    {"source": "classify", "target": "billing", "route": "billing"},
    {"source": "classify", "target": "support", "route": "support"},
    {"source": "billing", "target": "end", "route": null},
    {"source": "support", "target": "end", "route": null}
  ],
  "notes": ["Both branch agents share one End node."]
}
"""


# ---------------------------------------------------------------------------
# Gemini client helper
# ---------------------------------------------------------------------------


def _gemini_config(response_schema: type, timeout_seconds: int) -> dict[str, Any]:
    return {
        "response_mime_type": "application/json",
        "response_schema": response_schema,
        "http_options": {"timeout": timeout_seconds * 1000},
    }


def _generate_content(prompt: str, response_schema: type, timeout_seconds: int) -> str:
    from google import genai

    client = genai.Client(api_key=settings.google_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=_gemini_config(response_schema, timeout_seconds),
    )
    return response.text or "{}"


# ---------------------------------------------------------------------------
# Layout port (from frontend WorkflowCanvas.tsx handleTidyLayout)
# ---------------------------------------------------------------------------


def _assign_positions(graph: dict) -> dict:
    """Layer nodes left-to-right by BFS depth from entry nodes.

    Faithful port of the frontend tidy layout: x = 60 + depth*280,
    y = 60 + offset + i*140, with shorter columns vertically centered.
    Mutates node ``position`` in place and returns the graph.
    """
    nodes: list[dict] = graph.get("nodes", [])
    edges: list[dict] = graph.get("edges", [])
    if not nodes:
        return graph

    adj: dict[str, list[str]] = defaultdict(list)
    incoming: dict[str, int] = {n["id"]: 0 for n in nodes}
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source in incoming and target in incoming:
            adj[source].append(target)
            incoming[target] += 1

    depth: dict[str, int] = {}
    queue: deque[str] = deque(n["id"] for n in nodes if incoming.get(n["id"], 0) == 0)
    for nid in queue:
        depth[nid] = 0
    while queue:
        nid = queue.popleft()
        d = depth.get(nid, 0) + 1
        if d > len(nodes):  # cycle guard
            continue
        for nxt in adj.get(nid, []):
            if depth.get(nxt, -1) < d:
                depth[nxt] = d
                queue.append(nxt)

    layers: dict[int, list[str]] = defaultdict(list)
    for node in nodes:
        layers[depth.get(node["id"], 0)].append(node["id"])

    max_rows = max((len(ids) for ids in layers.values()), default=1)
    positions: dict[str, dict[str, float]] = {}
    for d, ids in layers.items():
        offset = ((max_rows - len(ids)) * 140) / 2
        for i, nid in enumerate(ids):
            positions[nid] = {"x": 60 + d * 280, "y": 60 + offset + i * 140}

    for node in nodes:
        pos = positions.get(node["id"])
        if pos:
            node["position"] = pos
    return graph


# ---------------------------------------------------------------------------
# generate-workflow
# ---------------------------------------------------------------------------


def _draft_to_graph(draft: GeneratedWorkflowDraft) -> dict:
    """Convert a Gemini draft into canvas-shaped nodes/edges.

    Drops nodes with unknown node_type (and their edges), parses config_json
    defensively, and lays out positions.
    """
    valid_ids: set[str] = set()
    nodes: list[dict] = []
    for gen in draft.nodes:
        if gen.node_type not in NODE_TYPES_BY_ID:
            continue
        try:
            config = json.loads(gen.config_json) if gen.config_json else {}
            if not isinstance(config, dict):
                config = {}
        except (json.JSONDecodeError, TypeError):
            config = {}
        valid_ids.add(gen.id)
        nodes.append(
            {
                "id": gen.id,
                "type": "baseNode",
                "position": {"x": 0, "y": 0},
                "data": {"label": gen.label, "nodeType": gen.node_type, **config},
            }
        )

    edges: list[dict] = []
    seen_edges: set[str] = set()
    for gen in draft.edges:
        if gen.source not in valid_ids or gen.target not in valid_ids:
            continue
        edge_id = f"e-{gen.source}-{gen.target}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edge: dict[str, Any] = {"id": edge_id, "source": gen.source, "target": gen.target}
        if gen.route:
            edge["data"] = {"route": gen.route}
        edges.append(edge)

    graph = {"nodes": nodes, "edges": edges}
    _assign_positions(graph)
    return graph


def generate_workflow(description: str) -> tuple[dict, list[str]]:
    base_prompt = (
        "You are an expert workflow architect for the Aegis agentic workflow builder. "
        "Design a workflow graph that fulfils the user's request using ONLY the node "
        "types below.\n\n"
        f"{_NODE_CATALOG}\n\n"
        f"{_GRAPH_RULES}\n\n"
        f"{_FEW_SHOT}\n\n"
        f"USER REQUEST:\n{description.strip()}\n\n"
        "Return a workflow draft. 'notes' must list everything the user still needs to "
        "configure before running (credentials, prompts, KB documents, integration "
        "targets, etc.)."
    )

    def _attempt(prompt: str) -> GeneratedWorkflowDraft:
        text = _generate_content(prompt, GeneratedWorkflowDraft, settings.assist_llm_timeout_seconds)
        return GeneratedWorkflowDraft.model_validate_json(text)

    draft = _attempt(base_prompt)
    graph = _draft_to_graph(draft)
    try:
        validate_workflow_graph(graph)
    except GraphValidationError as exc:
        retry_prompt = (
            f"{base_prompt}\n\n"
            f"Previous attempt failed validation: {exc}. Return a corrected workflow."
        )
        draft = _attempt(retry_prompt)
        graph = _draft_to_graph(draft)
        try:
            validate_workflow_graph(graph)
        except GraphValidationError as exc2:
            raise AssistError(
                f"The generated workflow failed validation twice: {exc2}"
            ) from exc2

    return graph, list(draft.notes)


# ---------------------------------------------------------------------------
# suggest-nodes
# ---------------------------------------------------------------------------

_SUGGEST_CACHE: dict[str, tuple[float, list[NodeSuggestion]]] = {}
_SUGGEST_CACHE_TTL = 300.0
_SUGGEST_CACHE_MAX = 256
_suggest_lock = Lock()


def _node_type_of(node: dict) -> str:
    return (node.get("data") or {}).get("nodeType", "")


def _graph_digest(graph: dict) -> str:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    node_sig = [(n.get("id"), _node_type_of(n)) for n in nodes]
    edge_sig = [
        (e.get("source"), e.get("target"), (e.get("data") or {}).get("route"))
        for e in edges
    ]
    payload = json.dumps([node_sig, edge_sig], sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def _serialize_graph_compact(graph: dict, selected_node_id: str | None) -> str:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    node_parts: list[str] = []
    selected_node: dict | None = None
    for node in nodes:
        node_id = node.get("id")
        data = node.get("data") or {}
        node_type = data.get("nodeType", "")
        label = data.get("label")
        if label:
            node_parts.append(f"{node_id}:{node_type}(label='{label}')")
        else:
            node_parts.append(f"{node_id}:{node_type}")
        if selected_node_id is not None and node_id == selected_node_id:
            selected_node = node

    edge_lines: list[str] = []
    for edge in edges:
        route = (edge.get("data") or {}).get("route")
        suffix = f"[{route}]" if route else ""
        edge_lines.append(f"{edge.get('source')}->{edge.get('target')}{suffix}")

    parts = ["NODES: " + ", ".join(node_parts), "EDGES:\n" + "\n".join(edge_lines)]

    if selected_node is not None:
        data = selected_node.get("data") or {}
        detail_bits: list[str] = []
        for key, value in data.items():
            if key in ("label", "nodeType"):
                continue
            sval = str(value)
            if len(sval) > 120:
                sval = sval[:120] + "…"
            detail_bits.append(f"{key}={sval}")
        parts.append(
            f"SELECTED NODE {selected_node_id}: " + ("; ".join(detail_bits) or "(no config)")
        )
    return "\n".join(parts)


def suggest_nodes(
    graph: dict,
    selected_node_id: str | None,
    user_id: str,
) -> list[NodeSuggestion]:
    digest = _graph_digest(graph)
    cache_key = hashlib.sha256(
        f"{user_id}|{selected_node_id}|{digest}".encode()
    ).hexdigest()

    now = time.monotonic()
    with _suggest_lock:
        cached = _SUGGEST_CACHE.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    compact = _serialize_graph_compact(graph, selected_node_id)
    prompt = (
        "You are a workflow copilot for the Aegis builder. Suggest up to 3 nodes to add "
        "next to improve or extend the workflow. Use ONLY these node types:\n\n"
        f"{_NODE_CATALOG}\n\n"
        "CURRENT WORKFLOW:\n"
        f"{compact}\n\n"
        + (
            f"The user selected node '{selected_node_id}'; suggest nodes that would come after it.\n\n"
            if selected_node_id
            else ""
        )
        + "For each suggestion give node_type, a short label, and a one-sentence reason."
    )

    text = _generate_content(prompt, SuggestionsDraft, 12)
    draft = SuggestionsDraft.model_validate_json(text)

    suggestions: list[NodeSuggestion] = []
    for item in draft.suggestions:
        if item.node_type not in NODE_TYPES_BY_ID:
            continue
        suggestions.append(
            NodeSuggestion(
                node_type=item.node_type,
                label=item.label,
                reason=item.reason,
                default_data=None,
            )
        )
        if len(suggestions) >= 3:
            break

    with _suggest_lock:
        if len(_SUGGEST_CACHE) >= _SUGGEST_CACHE_MAX:
            # Evict the oldest (earliest-expiring) entry.
            oldest = min(_SUGGEST_CACHE, key=lambda k: _SUGGEST_CACHE[k][0])
            _SUGGEST_CACHE.pop(oldest, None)
        _SUGGEST_CACHE[cache_key] = (now + _SUGGEST_CACHE_TTL, suggestions)

    return suggestions


# ---------------------------------------------------------------------------
# explain-run
# ---------------------------------------------------------------------------

_EXPLAIN_CACHE: dict[str, ExplainRunResponse] = {}
_EXPLAIN_CACHE_MAX = 128
_explain_lock = Lock()


def _truncate(value: Any, limit: int) -> str:
    text = "" if value is None else str(value)
    if len(text) > limit:
        return text[:limit] + "…"
    return text


def explain_run(run: Any, graph: dict) -> ExplainRunResponse:
    run_key = str(run.id)
    with _explain_lock:
        cached = _EXPLAIN_CACHE.get(run_key)
    if cached is not None:
        return cached

    node_results = list(run.node_results or [])

    result_lines: list[str] = []
    for nr in node_results:
        is_failed = nr.status == "failed"
        limit = 4000 if is_failed else 300
        result_lines.append(
            f"- {nr.node_id} ({nr.node_type}, '{nr.node_label}'): status={nr.status}, "
            f"latency={nr.latency_ms}ms, output={_truncate(nr.output, limit)}"
        )

    node_sig = [
        (n.get("id"), _node_type_of(n)) for n in graph.get("nodes", [])
    ]
    edge_sig = [
        (e.get("source"), e.get("target"), (e.get("data") or {}).get("route"))
        for e in graph.get("edges", [])
    ]
    compact_graph = json.dumps({"nodes": node_sig, "edges": edge_sig}, default=str)

    prompt = (
        "You are debugging a failed workflow run in the Aegis builder. Explain what "
        "happened and why it failed, then suggest concrete fixes.\n\n"
        f"INPUT: {_truncate(run.input_text, 1000)}\n"
        f"FINAL OUTPUT: {_truncate(run.final_output, 1000)}\n\n"
        "NODE RESULTS (in order):\n" + "\n".join(result_lines) + "\n\n"
        f"GRAPH: {compact_graph}\n\n"
        "Write the explanation in short plain paragraphs and hyphen bullets. "
        "Do NOT use markdown headings and do NOT use code fences. "
        "Then provide suggested_fixes, each with a short title and a detail."
    )

    text = _generate_content(prompt, ExplainRunResponse, 30)
    result = ExplainRunResponse.model_validate_json(text)

    with _explain_lock:
        if len(_EXPLAIN_CACHE) >= _EXPLAIN_CACHE_MAX:
            _EXPLAIN_CACHE.pop(next(iter(_EXPLAIN_CACHE)), None)
        _EXPLAIN_CACHE[run_key] = result

    return result


# ---------------------------------------------------------------------------
# Rate limiting (per-user, in-memory, always on)
# ---------------------------------------------------------------------------

_rate_lock = Lock()
_rate_buckets: dict[str, list[float]] = defaultdict(list)

_ENDPOINT_LIMITS = {
    "generate": "assist_generate_per_minute",
    "suggest": "assist_suggest_per_minute",
    "explain": "assist_explain_per_minute",
}


def check_assist_rate_limit(user_id: str, endpoint: str) -> None:
    limit = int(getattr(settings, _ENDPOINT_LIMITS[endpoint]))
    window_seconds = 60.0
    now = time.monotonic()
    key = f"{user_id}:{endpoint}"
    with _rate_lock:
        recent = [ts for ts in _rate_buckets[key] if now - ts < window_seconds]
        if len(recent) >= limit:
            _rate_buckets[key] = recent
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({limit} requests per minute)",
            )
        recent.append(now)
        _rate_buckets[key] = recent
