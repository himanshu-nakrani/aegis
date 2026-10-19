"""Authoring-only run helpers: pin outputs + run-from-here.

These features let the builder UI re-run a workflow from a chosen node while
feeding pre-recorded ("pinned") outputs for the upstream nodes it skips. This is
ONLY ever reachable from the authenticated run-create path — the published
``/v1/workflows/{id}/invoke`` path must not honor it (guarded in the API layer).

The transform is pure and graph-level:
  * seed pinned outputs into the WorkflowContext (steps + last_output), and
  * prune the graph so the trigger connects directly to ``start_node_id`` and
    strictly-upstream nodes whose outputs are pinned are removed.

Nothing here touches the database or the stored workflow.
"""

from __future__ import annotations

import json
from collections import defaultdict, deque
from copy import deepcopy
from typing import Any

from app.services.agent_tool_schema import attached_tool_node_ids, executable_nodes

from app.services.workflow_context import WorkflowContext


class RunAuthoringError(ValueError):
    """Raised when pin/run-from-here parameters are invalid for the graph."""


def _node_data(node: dict) -> dict:
    return node.get("data") or {}


def _node_type(node: dict) -> str:
    return _node_data(node).get("nodeType", "")


def seed_pinned_outputs(
    context: WorkflowContext,
    graph_json: dict,
    pinned_outputs: dict[str, Any],
) -> None:
    """Record each pinned node output into the context as a completed step."""
    nodes_by_id = {n.get("id"): n for n in graph_json.get("nodes", [])}
    last_value: str | None = None
    for node_id, value in pinned_outputs.items():
        node = nodes_by_id.get(node_id)
        data = _node_data(node) if node else {}
        text = value if isinstance(value, str) else json.dumps(value, default=str)
        context.record_step(
            node_id,
            text,
            label=data.get("label") or node_id,
            node_type=data.get("nodeType"),
        )
        last_value = text
    # record_step already updated last_output for each; leave it on the final
    # pinned value so a start node reading {{last_output}} sees its predecessor.
    if last_value is not None:
        context.set_last_output(last_value)


# Node types whose primary call is an LLM call on the node's selected provider.
# Mirrors workflow_capabilities.LLM_NODE_TYPES; evaluation nodes are excluded
# deliberately — a model matrix must not move the judge while scoring
# candidates against it.
_MODEL_OVERRIDABLE_TYPES = {
    "agent",
    "router",
    "classifier",
    "summarizer",
    "translator",
    "extractor",
}


def apply_model_override(graph_json: dict, override: dict[str, Any]) -> dict:
    """Return a graph copy where every LLM-capable node targets a new model.

    Used by experiment model-matrix runs: each matrix entry reruns the dataset
    with all agent/router/classifier/summarizer/translator/extractor nodes
    pinned to one ``{provider, model}`` pair so results are comparable.
    Caller-supplied ``api_base``/``apiBase`` in the override is dropped:
    custom endpoints are rejected at resolve time (redirect-following
    provider clients bypass DNS gates), so stamping one would only fail the
    run. Stored node ``apiBase`` values are likewise stripped — resolution
    rejects them and the matrix must compare models, not endpoints.
    Credential bindings are only kept when the provider is unchanged.
    """
    provider = str(override.get("provider") or "").strip().lower()
    model = str(override.get("model") or "").strip()
    if not provider and not model:
        return graph_json

    rewritten = deepcopy(graph_json)
    for node in rewritten.get("nodes", []) or []:
        data = node.get("data") or {}
        if data.get("nodeType") not in _MODEL_OVERRIDABLE_TYPES:
            continue
        existing_provider = str(data.get("provider") or data.get("modelProvider") or "").lower()
        if provider:
            data["provider"] = provider
            data["modelProvider"] = provider
        if model:
            data["model"] = model
        # Never carry a custom endpoint into a matrix run (see docstring).
        data.pop("apiBase", None)
        data.pop("api_base", None)
        if provider and existing_provider and provider != existing_provider:
            # Provider moved: a credential bound for the old provider would
            # silently misroute the call.
            data.pop("credentialId", None)
            data.pop("credentialName", None)
    return rewritten

def _ancestors(node_id: str, edges: list[dict]) -> set[str]:
    """All nodes that can reach ``node_id`` (strict upstream set)."""
    incoming: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        incoming[edge.get("target")].append(edge.get("source"))
    seen: set[str] = set()
    queue: deque[str] = deque([node_id])
    while queue:
        cur = queue.popleft()
        for src in incoming.get(cur, []):
            if src and src not in seen:
                seen.add(src)
                queue.append(src)
    return seen


def prune_graph_for_start(
    graph_json: dict,
    start_node_id: str,
    pinned_outputs: dict[str, Any],
) -> dict:
    """Return a new graph that begins execution at ``start_node_id``.

    Strictly-upstream nodes whose outputs are pinned are removed; the trigger is
    rewired directly to the start node so validation (single trigger -> ... ->
    single end) still holds. The trigger and end nodes are always retained.
    """
    nodes: list[dict] = deepcopy(graph_json.get("nodes", []))
    edges: list[dict] = deepcopy(graph_json.get("edges", []))
    nodes_by_id = {n.get("id"): n for n in executable_nodes(graph_json)}

    if start_node_id not in nodes_by_id:
        raise RunAuthoringError(f"start_node_id '{start_node_id}' not found in graph.")

    trigger_ids = [n["id"] for n in nodes if _node_type(n) == "trigger"]
    if not trigger_ids:
        raise RunAuthoringError("Graph has no trigger node.")
    trigger_id = trigger_ids[0]

    if start_node_id == trigger_id:
        # Nothing to prune; run normally.
        return graph_json

    ancestors = _ancestors(start_node_id, edges)
    # Only remove ancestors that are pinned (so their output is available) and
    # are not the trigger itself.
    removable = {
        nid
        for nid in ancestors
        if nid in pinned_outputs and nid != trigger_id
    }

    # Any un-pinned ancestor (other than the trigger) means we would execute an
    # upstream node with no seeded input — reject to keep behavior predictable.
    unpinned_ancestors = {
        nid for nid in ancestors if nid != trigger_id and nid not in pinned_outputs
    }
    if unpinned_ancestors:
        raise RunAuthoringError(
            "Cannot run from node "
            f"'{start_node_id}': upstream node(s) {sorted(unpinned_ancestors)} "
            "are not pinned. Pin their outputs or start earlier."
        )

    kept_nodes = [n for n in nodes if n["id"] not in removable]
    # A removed agent may be the only owner of a declaration. Keep shared
    # declarations for remaining agents, but omit newly orphaned declarations
    # from this execution-only graph; the stored canvas remains unchanged.
    removed_declarations = attached_tool_node_ids(graph_json) - attached_tool_node_ids({"nodes": kept_nodes})
    kept_nodes = [n for n in kept_nodes if n["id"] not in removed_declarations]
    kept_ids = {n["id"] for n in kept_nodes}

    # Drop edges touching removed nodes.
    kept_edges = [
        e
        for e in edges
        if e.get("source") in kept_ids and e.get("target") in kept_ids
    ]

    # Rewire the trigger straight to the start node (single unconditional edge).
    kept_edges = [
        e for e in kept_edges if e.get("source") != trigger_id
    ]
    kept_edges.append(
        {
            "id": f"e-{trigger_id}-{start_node_id}",
            "source": trigger_id,
            "target": start_node_id,
        }
    )

    return {"nodes": kept_nodes, "edges": kept_edges}


def _reachable_from(source_ids: list[str], edges: list[dict]) -> set[str]:
    """All node ids reachable from ``source_ids`` following ``edges``."""
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge.get("source") and edge.get("target"):
            adjacency[edge["source"]].append(edge["target"])
    seen: set[str] = set()
    queue: deque[str] = deque(source_ids)
    while queue:
        cur = queue.popleft()
        if cur in seen:
            continue
        seen.add(cur)
        queue.extend(adjacency.get(cur, []))
    return seen


def prune_graph_for_resume(
    graph_json: dict,
    completed_ids: set[str],
    frontier_ids: set[str],
) -> dict:
    """Return a new graph that resumes a crashed run at ``frontier_ids``.

    Nodes already ``completed``/``skipped`` (their outputs are seeded via
    ``seed_pinned_outputs``) are removed, along with any tool declarations
    they orphaned. The trigger is rewired to each frontier node that lost all
    incoming edges, nodes no longer reachable from the trigger are dropped
    (e.g. conditional children of a completed router that never started), and
    if the End node would become unreachable it is re-wired from the
    remaining terminal nodes so the pruned graph still validates.

    The trigger and end nodes are always retained. Raises
    ``RunAuthoringError`` when a frontier node is absent from the graph.
    """
    nodes: list[dict] = deepcopy(graph_json.get("nodes", []))
    edges: list[dict] = deepcopy(graph_json.get("edges", []))
    exec_by_id = {n.get("id"): n for n in executable_nodes(graph_json)}

    missing = frontier_ids - set(exec_by_id)
    if missing:
        raise RunAuthoringError(
            f"frontier node(s) {sorted(missing)} not found in graph."
        )

    trigger_ids = [n["id"] for n in nodes if _node_type(n) == "trigger"]
    if not trigger_ids:
        raise RunAuthoringError("Graph has no trigger node.")
    trigger_id = trigger_ids[0]
    end_ids = {n["id"] for n in nodes if _node_type(n) == "end"}

    # Trigger/end are structural: keep them even if they checkpointed (the
    # trigger passthrough re-emitting its seeded output is how frontier nodes
    # receive their input; re-running end is a harmless passthrough).
    structural = {trigger_id} | end_ids
    removable = {nid for nid in completed_ids if nid not in structural}

    kept_nodes = [n for n in nodes if n["id"] not in removable]
    # A removed agent may be the only owner of a tool declaration; drop the
    # now-orphaned declarations from this execution-only graph.
    removed_declarations = attached_tool_node_ids(graph_json) - attached_tool_node_ids(
        {"nodes": kept_nodes}
    )
    kept_nodes = [n for n in kept_nodes if n["id"] not in removed_declarations]
    kept_ids = {n["id"] for n in kept_nodes}

    kept_edges = [
        e
        for e in edges
        if e.get("source") in kept_ids and e.get("target") in kept_ids
    ]

    # Rewire the trigger into each frontier node that cannot be reached any
    # other way: its parents were all completed/skipped (removed) or survive
    # only behind dropped branches. Frontier nodes retaining a REACHABLE kept
    # parent stay downstream of it — an extra trigger edge could fire them
    # early or twice (parallel parents merge on first arrival in ADK).
    exec_kept_ids = {n["id"] for n in kept_nodes if n["id"] in exec_by_id}
    exec_edges = [
        e
        for e in kept_edges
        if e.get("source") in exec_kept_ids and e.get("target") in exec_kept_ids
    ]
    reachable = _reachable_from([trigger_id], exec_edges)
    frontier_kept = {fid for fid in frontier_ids if fid in kept_ids}
    incoming_sources: dict[str, set[str]] = defaultdict(set)
    for e in exec_edges:
        incoming_sources[e.get("target")].add(e.get("source"))

    existing_trigger_targets = {
        e.get("target") for e in exec_edges if e.get("source") == trigger_id
    }
    for fid in sorted(frontier_kept - {trigger_id}):
        if fid in existing_trigger_targets:
            continue
        if incoming_sources.get(fid, set()) & reachable:
            continue
        kept_edges.append(
            {
                "id": f"e-{trigger_id}-{fid}",
                "source": trigger_id,
                "target": fid,
            }
        )
        exec_edges.append(kept_edges[-1])

    # Reachability now includes the rewired frontier.
    reachable = _reachable_from([trigger_id], exec_edges)

    # If pruning severed every path to End, re-wire the remaining terminal
    # executable nodes to End so the resume graph still validates. End is a
    # passthrough node, so firing it after the last real node preserves the
    # final output.
    for end_id in end_ids & exec_kept_ids:
        if end_id in reachable:
            continue
        outdegree: dict[str, int] = defaultdict(int)
        for e in exec_edges:
            outdegree[e["source"]] += 1
        sinks = sorted(
            nid for nid in reachable if outdegree.get(nid, 0) == 0
        ) or [trigger_id]
        for sink in sinks:
            if sink == end_id:
                continue
            kept_edges.append(
                {
                    "id": f"e-{sink}-{end_id}",
                    "source": sink,
                    "target": end_id,
                }
            )
            exec_edges.append(kept_edges[-1])
        reachable = _reachable_from([trigger_id], exec_edges)

    # Drop executable nodes still unreachable from the trigger — conditional
    # children of removed routers that never started, and anything downstream
    # of them. They were never executed, so dropping is safe.
    unreachable = exec_kept_ids - reachable
    if unreachable:
        kept_nodes = [n for n in kept_nodes if n["id"] not in unreachable]
        kept_ids = {n["id"] for n in kept_nodes}
        kept_edges = [
            e
            for e in kept_edges
            if e.get("source") in kept_ids and e.get("target") in kept_ids
        ]

    return {"nodes": kept_nodes, "edges": kept_edges}
