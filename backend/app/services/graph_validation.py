from __future__ import annotations

from collections import defaultdict, deque


class GraphValidationError(ValueError):
    pass


def validate_workflow_graph(graph_json: dict) -> dict:
    """Validate canvas graph before save or compile. Returns summary metadata."""
    nodes: list[dict] = graph_json.get("nodes", [])
    edges: list[dict] = graph_json.get("edges", [])

    if not nodes:
        raise GraphValidationError("Workflow must contain at least one node.")

    node_ids = {n["id"] for n in nodes}
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

    entry_nodes = [nid for nid in node_ids if sum(1 for e in edges if e.get("target") == nid) == 0]
    if len(entry_nodes) != 1:
        raise GraphValidationError(
            f"Workflow must have exactly one entry node (found {len(entry_nodes)})."
        )

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

    # Router edge validation
    for node in nodes:
        data = node.get("data", {}) or {}
        if data.get("nodeType") != "router":
            continue
        routes = data.get("routes") or []
        if not routes:
            raise GraphValidationError(f"Router node '{node['id']}' must define at least one route.")
        outgoing = [e for e in edges if e.get("source") == node["id"]]
        edge_routes = {e.get("data", {}).get("route") or e.get("label") for e in outgoing}
        edge_routes.discard(None)
        for route in routes:
            if route not in edge_routes:
                raise GraphValidationError(
                    f"Router '{node['id']}' route '{route}' has no outgoing edge with matching label."
                )

    terminal_nodes = [nid for nid in node_ids if outdegree[nid] == 0]
    join_nodes = [n["id"] for n in nodes if (n.get("data") or {}).get("nodeType") == "join"]

    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "entry_node": entry,
        "terminal_nodes": terminal_nodes,
        "join_nodes": join_nodes,
        "has_router": any((n.get("data") or {}).get("nodeType") == "router" for n in nodes),
        "has_parallel": any(outdegree[nid] > 1 for nid in node_ids),
    }