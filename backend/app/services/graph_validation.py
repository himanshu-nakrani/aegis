from __future__ import annotations

from collections import defaultdict, deque

from app.services.agent_tool_schema import (
    ANNOTATION_NODE_TYPES,
    AgentToolSchemaError,
    executable_graph,
    validate_agent_tool_schema,
)

from app.services.expressions import template_uses_expressions

def _safe_adk_name(node_id: str, prefix: str) -> str:
    # Local copy of compiler._safe_adk_name (compiler imports this module —
    # importing it here would cycle). Keep the two in sync: sanitization
    # must match exactly or the collision check is meaningless.
    import re as _re

    safe = _re.sub(r"[^a-zA-Z0-9_]", "_", node_id)
    if safe and safe[0].isdigit():
        safe = f"n_{safe}"
    return f"{prefix}_{safe}"


class GraphValidationError(ValueError):
    pass


def _node_data(node: dict) -> dict:
    return node.get("data", {}) or {}


def _is_annotation(node: dict) -> bool:
    return _node_data(node).get("nodeType") in {"note", "group"}


# Node types whose failures cannot be intercepted for error-branch routing.
# Single-shot LLM nodes compile to bare ADK Agent objects. Tool-enabled agents
# compile to wrapped nodes with an interception point and can route failures.
# Structural nodes have no failure to route.
ERROR_BRANCH_UNSUPPORTED_TYPES = frozenset(
    {
        "trigger",
        "end",
        "note",
        "group",
        "join",
        "agent",
        "summarizer",
        "translator",
        "extractor",
        "evaluation",
    }
)


def _error_branch_unsupported(data: dict) -> bool:
    """True when this node config compiles to a bare ADK Agent (no route interception)."""
    node_type = data.get("nodeType", "agent")
    if node_type == "agent" and data.get("tools"):
        return False
    if node_type in ERROR_BRANCH_UNSUPPORTED_TYPES:
        return True
    # Google-search tool nodes compile to a bare Agent with google_search tools —
    # they never set ctx.route, so stamping success edges with __ok__ dead-ends
    # the pipeline. Calculator/http tools are wrapped callables and are fine.
    if (
        node_type == "tool"
        and data.get("toolType") == "search"
        and data.get("searchProvider", "google") == "google"
    ):
        return True
    return False


def _validate_error_edges(nodes: list[dict], edges: list[dict]) -> None:
    """Enforce n8n-style error-branch rules: at most one error edge per node and
    only from node types that support error routing."""
    node_map = {n["id"]: n for n in nodes}
    error_edge_count: dict[str, int] = defaultdict(int)
    for edge in edges:
        if str((edge.get("data") or {}).get("route") or "") != "error":
            continue
        source = edge.get("source")
        error_edge_count[source] += 1
        data = _node_data(node_map.get(source, {}))
        node_type = data.get("nodeType")
        if _error_branch_unsupported(data):
            raise GraphValidationError(
                f"Node '{source}' of type '{node_type}' does not support an "
                "error branch (this configuration has no failure-route interception)."
            )
    for source, count in error_edge_count.items():
        if count > 1:
            raise GraphValidationError(
                f"Node '{source}' has {count} error edges; at most one error "
                "branch is allowed per node."
            )
    # L1: "default" is the branch-fallback sentinel — on a non-branch node an
    # edge labelled "default" would compile to unconditional (route=None) with
    # no branch semantics. Reject it. ("error"-labelled edges are the failure
    # branch on ANY node type — including branch nodes, where the wrapper
    # emits "error" only on failure so routed siblings can't misfire.)
    for edge in edges:
        data = _node_data(node_map.get(edge.get("source"), {}))
        node_type = data.get("nodeType")
        route = str((edge.get("data") or {}).get("route") or edge.get("label") or "")
        if route != "default":
            continue
        # On router/classifier "default" is the declared fallback: the
        # compiler (_branch_default_label) maps it to ADK's DEFAULT_ROUTE,
        # which fires only when no specific route matched — never
        # unconditionally. Rejecting it here would also make a router whose
        # routes list contains "default" unvalidatable (the routes check above
        # requires exactly this edge). A switch's own configured fallback is
        # likewise a declared route — legal.
        if node_type in {"router", "classifier"}:
            continue
        if node_type == "switch" and route == str(data.get("switchDefault", "default")):
            continue
        if node_type in {"if", "switch", "guardrail"}:
            raise GraphValidationError(
                f"Branch node '{edge.get('source')}' has an edge labelled "
                "'default', which is not one of its declared routes — it would "
                "fire unconditionally. Label the edge with a declared route "
                "or remove the label."
            )
        raise GraphValidationError(
            f"Node '{edge.get('source')}' is not a branch node — an edge "
            "labelled 'default' would fire unconditionally. "
            "Remove the label or route through a branch node."
        )


def _validate_field_lengths(nodes: list[dict]) -> None:
    """O4: reject authoring-time strings that overflow Postgres String(N)
    columns at runtime (mid-run DataError → failed run; SQLite silently
    truncates, hiding the drift). Runtime-derived values (provider model
    names, assignees) are clipped at write sites instead — they aren't
    authorable here.
    """
    limits = (
        ("id", 128, "node id"),
        ("label", 255, "node label"),
        ("assignee", 255, "approval assignee"),
        ("scheduleCron", 128, "schedule cron"),
        ("triggerNodeId", 128, "trigger node id"),
    )
    for node in nodes:
        data = node.get("data") or {}
        for key, limit, label in limits:
            value = node.get(key) if key == "id" else data.get(key)
            if isinstance(value, str) and len(value) > limit:
                raise GraphValidationError(
                    f"Node '{node.get('id')}' {label} exceeds {limit} characters "
                    f"({len(value)}) — shorten it to fit the database column."
                )
        crons = data.get("scheduleCrons")
        if isinstance(crons, list):
            for cron in crons:
                if isinstance(cron, str) and len(cron) > 128:
                    raise GraphValidationError(
                        f"Node '{node.get('id')}' schedule cron exceeds 128 "
                        "characters — shorten it to fit the database column."
                    )
    return None


def _is_number(value: object) -> bool:
    if value is None or value == "":
        return True  # absent/blank falls back to a default at compile time
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _validate_numeric_fields(nodes: list[dict]) -> None:
    """Reject non-numeric config for fields the compiler parses as numbers."""
    # (data key, human label, applies-to-node-type or None for all nodes)
    numeric_fields: list[tuple[str, str, str | None]] = [
        ("delaySeconds", "Delay seconds", "delay"),
        ("kbTopK", "Top-K", "kb_retrieve"),
        ("retries", "Retries", None),
        ("retryDelaySec", "Retry delay (sec)", None),
        ("timeoutSec", "Timeout (sec)", None),
    ]
    for node in nodes:
        data = _node_data(node)
        node_type = data.get("nodeType")
        if node_type == "human_approval":
            assignee = data.get("approvalAssignee")
            if assignee is not None and (not isinstance(assignee, str) or len(assignee) > 255):
                raise GraphValidationError("Approval assignee must be a string of at most 255 characters.")
            escalation = data.get("escalationTimeoutSeconds")
            if escalation is not None and (isinstance(escalation, bool) or not isinstance(escalation, int) or escalation <= 0):
                raise GraphValidationError("Approval escalation timeout must be a positive integer.")
            channels = data.get("approvalNotifications", [])
            if not isinstance(channels, list):
                raise GraphValidationError("Approval notifications must be a list of credential bindings.")
            for binding in channels:
                if not isinstance(binding, dict) or set(binding) - {"channel", "credentialId", "credentialName"}:
                    raise GraphValidationError("Approval notifications accept credential references only, not secrets.")
                if binding.get("channel") not in {"slack", "email"} or not (binding.get("credentialId") or binding.get("credentialName")):
                    raise GraphValidationError("Approval notifications require a Slack/email channel and bound credential.")
        for key, label, only_type in numeric_fields:
            if only_type is not None and node_type != only_type:
                continue
            if key not in data:
                continue
            if not _is_number(data.get(key)):
                raise GraphValidationError(
                    f"Node '{node['id']}' has a non-numeric {label}: "
                    f"{data.get(key)!r}."
                )


# Per-node reliability knobs honored by the context wrapper (function nodes)
# and by ToolAgentNode. The compiler skips the wrapper for bare ADK Agent
# nodes, and ADK runs bare Agents internally — so setting these fields on the
# node types below would be silently ignored. Reject them at save time.
_RELIABILITY_FIELDS = (
    ("retries", "Retries"),
    ("retryDelaySec", "Retry delay (sec)"),
    ("timeoutSec", "Timeout (sec)"),
)


def _reliability_policy_ignored(data: dict) -> bool:
    """True when the node compiles to a bare ADK Agent/JoinNode — no wrapper to
    enforce retries/timeoutSec (mirrors compiler._build_adk_node's Agent
    branches)."""
    node_type = data.get("nodeType", "agent")
    if node_type in {"agent", "summarizer", "translator", "extractor"}:
        if node_type == "agent" and data.get("tools"):
            return False
        if node_type == "agent" and template_uses_expressions(data.get("instruction")):
            return False
        return True
    if node_type == "join":
        return True
    if node_type == "tool":
        return (
            data.get("toolType") == "search"
            and data.get("searchProvider", "google") == "google"
        )
    if node_type == "evaluation":
        return (
            (data.get("evalType") or "llm").lower() == "llm"
            and (data.get("evalExecutionMode") or "parallel").lower() == "inline"
        )
    return False


def _validate_reliability_fields(nodes: list[dict]) -> None:
    """Reject retries/timeoutSec on node types where the compiler drops them."""
    for node in nodes:
        data = _node_data(node)
        if not _reliability_policy_ignored(data):
            continue
        for key, label in _RELIABILITY_FIELDS:
            raw = data.get(key)
            if raw in (None, ""):
                continue
            try:
                if float(raw) <= 0:
                    continue
            except (TypeError, ValueError):
                continue
            raise GraphValidationError(
                f"Node '{node['id']}' sets {label} ({raw!r}) but this node type "
                "compiles to a bare ADK node with no per-node retry/timeout "
                "wrapper — the value would be silently ignored at run time. "
                "Remove the field or use a wrapped node type."
            )


def _validate_joins(nodes: list[dict], edges: list[dict], entry_id: str) -> None:
    """Reject join nodes whose predecessors are not guaranteed to all complete.

    ADK JoinNode waits for *every* predecessor node to reach COMPLETED — it is
    not a first-arrival merge. A predecessor that sits on an exclusive branch
    (router/if/switch/classifier/guardrail-route) that is not taken never runs,
    so the join starves and the tail of the graph stalls at run time.

    Two rules:
      1. A join must not be fed by a conditional (routed) edge. The label only
         gates whether the barrier is re-checked after that source completes —
         on the sibling route the join can never fire even when every
         predecessor completes.
      2. Every predecessor of a join must be guaranteed to run under every
         decision outcome that can trigger the join.
    """
    node_by_id = {n["id"]: n for n in nodes}
    joins = [n["id"] for n in nodes if _node_data(n).get("nodeType") == "join"]
    if not joins:
        return

    outbound: dict[str, list[dict]] = defaultdict(list)
    inbound: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        outbound[edge["source"]].append(edge)
        inbound[edge["target"]].append(edge)

    def _resolved_label(edge: dict) -> str | None:
        """Mirror compiler._edge_route: the ADK route this edge fires on."""
        source = node_by_id.get(edge["source"])
        data = _node_data(source) if source else {}
        node_type = data.get("nodeType")
        if node_type == "switch":
            default_label = str(data.get("switchDefault", "default"))
        elif node_type in {"router", "classifier"}:
            default_label = "default"
        else:
            default_label = None
        route = (edge.get("data") or {}).get("route") or edge.get("label")
        if route in (None, ""):
            return None
        route = str(route)
        if default_label is not None and route == default_label:
            return "__default__"
        if default_label is None and route == "default":
            return None
        return route

    resolved_labels = {id(e): _resolved_label(e) for e in edges}

    # An edge that fires whenever its source runs. Success edges of a node
    # carrying an error edge are stamped __ok__ at compile time, so they only
    # fire on success — treat them as conditional for reachability guarantees.
    error_guarded = {
        e["source"]
        for e in edges
        if e.get("source") and str((e.get("data") or {}).get("route") or "") == "error"
    }

    def _fires_always(edge: dict) -> bool:
        return resolved_labels[id(edge)] is None and edge["source"] not in error_guarded

    # Rule 1: routed edges into a join can never reliably release it.
    for join_id in joins:
        for edge in inbound[join_id]:
            label = resolved_labels[id(edge)]
            if label is not None:
                raise GraphValidationError(
                    f"Join '{join_id}' is fed by edge '{edge.get('id') or ''}' "
                    f"routed '{label}' — a join waits for every predecessor to "
                    "complete and can never fire when an inbound edge's route "
                    "is not taken. Wire branch outputs through unconditional "
                    "edges, or replace the join with a regular merge node."
                )

    def _guaranteed_from(seeds: set[str], fires) -> set[str]:
        """Nodes guaranteed to run given ``seeds`` fired, chasing edges that
        ``fires(edge)`` deems triggered. Join nodes additionally require all
        predecessors to be guaranteed before they run."""
        guaranteed: set[str] = set()
        pending = set(seeds)
        while pending:
            guaranteed |= pending
            pending = set()
            for edge in edges:
                target = edge["target"]
                if target in guaranteed or edge["source"] not in guaranteed:
                    continue
                if not fires(edge):
                    continue
                if _node_data(node_by_id[target]).get("nodeType") == "join":
                    preds = inbound[target]
                    if not (
                        preds
                        and all(p["source"] in guaranteed for p in preds)
                        and any(p["source"] in guaranteed and fires(p) for p in preds)
                    ):
                        continue
                pending.add(target)
        return guaranteed

    # Nodes guaranteed to run regardless of any branch decision.
    always_run = _guaranteed_from({entry_id}, _fires_always)


    # Route-emitting decision nodes: group their outgoing edges by resolved
    # route. For each join and each outcome that can reach the join, every
    # predecessor must be guaranteed under that outcome.
    decisions: dict[str, dict[str, list[dict]]] = {}
    for node in nodes:
        data = _node_data(node)
        node_type = data.get("nodeType")
        emits_routes = node_type in {"router", "classifier", "if", "switch"} or (
            node_type == "guardrail"
            and (data.get("rules") or {}).get("fail_behavior") == "route"
        )
        if not (emits_routes or node["id"] in error_guarded):
            continue
        groups: dict[str, list[dict]] = {}
        for edge in outbound[node["id"]]:
            label = resolved_labels[id(edge)]
            if label is None and node["id"] not in error_guarded:
                # Unconditional edge from a route emitter — fires under every
                # outcome, so it does not carve out an exclusive outcome.
                continue
            groups.setdefault(label if label is not None else "__ok__", []).append(edge)
        if groups:
            decisions[node["id"]] = groups

    for join_id in joins:
        predecessors = {e["source"] for e in inbound[join_id]}
        for decision_id, groups in decisions.items():
            for outcome, group_edges in groups.items():
                # Nodes this outcome can reach at all (any edge counts — the
                # outcome may cascade through further decisions).
                reachable: set[str] = set()
                bfs = deque(e["target"] for e in group_edges)
                while bfs:
                    cur = bfs.popleft()
                    if cur in reachable:
                        continue
                    reachable.add(cur)
                    bfs.extend(e["target"] for e in outbound[cur])
                domain = reachable | always_run
                if not (predecessors & domain):
                    # No predecessor can complete under this outcome, so the
                    # join's barrier is never evaluated on this path.
                    continue

                def _fires_under(edge: dict) -> bool:
                    if _fires_always(edge):
                        return True
                    label = resolved_labels[id(edge)]
                    if edge["source"] == decision_id and label == outcome:
                        return True
                    # __ok__-stamped success edge: fires whenever its source
                    # succeeds — every outcome except that source's error
                    # outcome.
                    if label is None and edge["source"] in error_guarded:
                        return not (
                            edge["source"] == decision_id and outcome == "error"
                        )
                    return False

                guaranteed = _guaranteed_from(
                    {decision_id, *(e["target"] for e in group_edges)} | always_run,
                    _fires_under,
                )
                starved = predecessors - guaranteed
                if starved:
                    raise GraphValidationError(
                        f"Join '{join_id}' can stall: on outcome '{outcome}' of "
                        f"node '{decision_id}' the join may trigger while "
                        f"predecessor(s) {sorted(starved)} never run — a join "
                        "waits for every predecessor to complete. Reconverge "
                        "exclusive branches with a regular merge node (unlabeled "
                        "fan-in merges on first arrival), or give every join "
                        "predecessor an unconditional path."
                    )


def validate_workflow_graph(graph_json: dict) -> dict:
    """Validate canvas graph before save or compile. Returns summary metadata."""
    all_nodes: list[dict] = graph_json.get("nodes", [])
    try:
        attached = validate_agent_tool_schema(graph_json)
    except AgentToolSchemaError as exc:
        raise GraphValidationError(str(exc)) from exc
    all_node_ids = [n["id"] for n in all_nodes]
    seen: set[str] = set()
    dupes: set[str] = set()
    for nid in all_node_ids:
        if nid in seen:
            dupes.add(nid)
        seen.add(nid)
    if dupes:
        raise GraphValidationError(
            f"Duplicate node id(s): {sorted(dupes)}. Node ids must be unique — "
            "duplicates silently overwrite each other at compile time."
        )
    # Distinct ids can still collide after ADK sanitization ("a-b" vs "a_b"),
    # which corrupts name-based routing — reject those pairs up front.
    adk_names: dict[str, str] = {}
    for node in all_nodes:
        nid = node["id"]
        data = node.get("data") or {}
        ntype = data.get("nodeType") or ""
        if ntype in ANNOTATION_NODE_TYPES:
            # Annotations compile to unsanitized note_{id} names and never
            # enter executable routing — exclude them from collision checks.
            continue
        # Mirror compiler prefixing: tool nodes use their toolType.
        prefix = data.get("toolType", "calculator") if ntype == "tool" else (ntype or "node")
        adk_name = _safe_adk_name(nid, prefix)
        if adk_name in adk_names and adk_names[adk_name] != nid:
            raise GraphValidationError(
                f"Node ids '{adk_names[adk_name]}' and '{nid}' collide after "
                "sanitization — rename one so compiled names stay unique."
            )
        adk_names.setdefault(adk_name, nid)
    all_node_id_set = set(all_node_ids)
    for edge in graph_json.get("edges", []):
        if edge.get("source") not in all_node_id_set or edge.get("target") not in all_node_id_set:
            raise GraphValidationError(
                f"Edge references unknown node: {edge.get('source')} -> {edge.get('target')}"
            )
    nodes, edges = executable_graph(graph_json)
    node_ids = {n["id"] for n in nodes}

    if not nodes:
        raise GraphValidationError("Workflow must contain at least one executable node.")

    node_map = {n["id"]: n for n in nodes}

    indegree: dict[str, int] = {nid: 0 for nid in node_ids}
    outdegree: dict[str, int] = {nid: 0 for nid in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_ids or target not in node_ids:
            raise GraphValidationError(f"Edge references unknown node: {source} -> {target}")
        adjacency[source].append(target)
        indegree[target] += 1
        outdegree[source] += 1

    # Cycle detection (Kahn's algorithm)
    queue: deque[str] = deque([nid for nid, deg in indegree.items() if deg == 0])
    visited = 0
    while queue:
        current = queue.popleft()
        visited += 1
        for neighbor in adjacency[current]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if visited != len(node_ids):
        raise GraphValidationError("Workflow graph must be acyclic (no cycles).")

    trigger_nodes = [n for n in nodes if _node_data(n).get("nodeType") == "trigger"]
    end_nodes = [n for n in nodes if _node_data(n).get("nodeType") == "end"]

    if len(trigger_nodes) != 1:
        raise GraphValidationError(
            f"Workflow must have exactly one Trigger node (found {len(trigger_nodes)})."
        )
    if len(end_nodes) != 1:
        raise GraphValidationError(
            f"Workflow must have exactly one End node (found {len(end_nodes)})."
        )

    trigger_id = trigger_nodes[0]["id"]
    end_id = end_nodes[0]["id"]

    entry_nodes = [nid for nid in node_ids if sum(1 for e in edges if e.get("target") == nid) == 0]
    if len(entry_nodes) != 1:
        raise GraphValidationError(
            f"Workflow must have exactly one entry node (found {len(entry_nodes)})."
        )
    if entry_nodes[0] != trigger_id:
        raise GraphValidationError("Trigger must be the workflow entry node (no incoming edges).")

    # Reachability from entry
    entry = entry_nodes[0]
    reachable: set[str] = set()
    bfs: deque[str] = deque([entry])
    while bfs:
        cur = bfs.popleft()
        if cur in reachable:
            continue
        reachable.add(cur)
        for nxt in adjacency[cur]:
            bfs.append(nxt)

    unreachable = node_ids - reachable
    if unreachable:
        raise GraphValidationError(f"Nodes not reachable from entry: {', '.join(sorted(unreachable))}")

    def _branch_routes(node: dict) -> tuple[str, list[str]]:
        data = _node_data(node)
        node_type = data.get("nodeType")
        if node_type == "router":
            return "route", list(data.get("routes") or [])
        if node_type == "classifier":
            return "category", list(data.get("categories") or [])
        if node_type == "if":
            return "branch", ["true", "false"]
        if node_type == "switch":
            cases = list(data.get("switchCases") or [])
            default_route = data.get("switchDefault", "default")
            return "case", [*cases, default_route]
        if node_type == "guardrail":
            rules = data.get("rules") or {}
            if rules.get("fail_behavior") == "route":
                return "route", [
                    str(rules.get("pass_route") or "pass"),
                    str(rules.get("failure_route") or "failed"),
                ]
        return "", []

    # Branching nodes must wire all routes to outgoing edges
    for node in nodes:
        label, routes = _branch_routes(node)
        if not routes:
            node_type = _node_data(node).get("nodeType")
            if node_type in {"router", "classifier"}:
                raise GraphValidationError(
                    f"{node_type.title()} node '{node['id']}' must define at least one {label}."
                )
            continue
        outgoing = [e for e in edges if e.get("source") == node["id"]]
        edge_routes = {(e.get("data") or {}).get("route") or e.get("label") for e in outgoing}
        edge_routes.discard(None)
        for route in routes:
            if route not in edge_routes:
                node_type = _node_data(node).get("nodeType", "branch")
                raise GraphValidationError(
                    f"{node_type.title()} '{node['id']}' {label} '{route}' "
                    "has no outgoing edge with matching label."
                )
        # Every outgoing edge of a branch node must carry a route: an
        # unlabeled extra edge compiles to route=None, which ADK fires
        # unconditionally alongside the matched branch (accidental fan-out).
        for edge in outgoing:
            route = (edge.get("data") or {}).get("route") or edge.get("label")
            if not route:
                raise GraphValidationError(
                    f"{_node_data(node).get('nodeType', 'branch').title()} '{node['id']}' "
                    "has an outgoing edge with no route label — every branch "
                    "edge must match a declared route."
                )

    _validate_numeric_fields([node for node in all_nodes if not _is_annotation(node)])
    _validate_reliability_fields([node for node in all_nodes if not _is_annotation(node)])
    _validate_field_lengths([node for node in all_nodes if not _is_annotation(node)])
    _validate_error_edges(nodes, edges)
    _validate_joins(nodes, edges, entry)

    terminal_nodes = [nid for nid in node_ids if outdegree[nid] == 0]
    if len(terminal_nodes) != 1 or terminal_nodes[0] != end_id:
        raise GraphValidationError(
            "Workflow must end at exactly one End node with no outgoing connections."
        )

    if end_id not in reachable:
        raise GraphValidationError("End node must be reachable from Trigger.")

    join_nodes = [n["id"] for n in nodes if (n.get("data") or {}).get("nodeType") == "join"]

    return {
        "node_count": len(nodes),
        "annotation_count": sum(_is_annotation(node) for node in all_nodes),
        "tool_declaration_count": len(attached),
        "edge_count": len(edges),
        "entry_node": entry,
        "exit_node": end_id,
        "trigger_node": trigger_id,
        "terminal_nodes": terminal_nodes,
        "join_nodes": join_nodes,
        "has_router": any((n.get("data") or {}).get("nodeType") == "router" for n in nodes),
        "has_parallel": any(outdegree[nid] > 1 for nid in node_ids),
    }