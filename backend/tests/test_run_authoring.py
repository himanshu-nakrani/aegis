"""Tests for prune_graph_for_resume (Phase 2 durable-resume graph transform).

The pruner drops completed/skipped nodes, rewires the trigger into frontier
nodes that lost their parents, drops nodes that can no longer be reached
(conditional children of removed routers that never ran), and keeps the End
node reachable so the pruned graph still validates.
"""

import pytest

from app.services.graph_defaults import wrap_graph_with_trigger_end
from app.services.graph_validation import validate_workflow_graph
from app.services.run_authoring import RunAuthoringError, prune_graph_for_resume


def _transform(node_id: str) -> dict:
    return {
        "id": node_id,
        "position": {"x": 0, "y": 0},
        "data": {"label": node_id.upper(), "nodeType": "transform", "template": "{{last_output}}"},
    }


def _linear_graph() -> dict:
    """trigger -> a -> b -> c -> end."""
    return wrap_graph_with_trigger_end(
        [_transform("a"), _transform("b"), _transform("c")],
        [
            {"id": "e-ab", "source": "a", "target": "b"},
            {"id": "e-bc", "source": "b", "target": "c"},
        ],
        entry_id="a",
        exit_id="c",
    )


def _router_graph() -> dict:
    """trigger -> router -[true]-> a -+-> m -> end
                              -[false]-> b -+"""
    return wrap_graph_with_trigger_end(
        [
            {
                "id": "router",
                "position": {"x": 0, "y": 0},
                "data": {"label": "R", "nodeType": "router", "routes": ["true", "false"]},
            },
            _transform("a"),
            _transform("b"),
            _transform("m"),
        ],
        [
            {"id": "e-ra", "source": "router", "target": "a", "label": "true"},
            {"id": "e-rb", "source": "router", "target": "b", "label": "false"},
            {"id": "e-am", "source": "a", "target": "m"},
            {"id": "e-bm", "source": "b", "target": "m"},
        ],
        entry_id="router",
        exit_id="m",
    )


def _declaration_graph() -> dict:
    """trigger -> agent_done -> agent_live -> end, each agent owning a tool
    declaration."""
    return wrap_graph_with_trigger_end(
        [
            {
                "id": "agent_done",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "Done",
                    "nodeType": "agent",
                    "tools": [{"kind": "node", "nodeId": "calc1"}],
                },
            },
            {
                "id": "calc1",
                "position": {"x": 0, "y": 0},
                "data": {"label": "C1", "nodeType": "tool", "toolType": "calculator"},
            },
            {
                "id": "agent_live",
                "position": {"x": 0, "y": 0},
                "data": {
                    "label": "Live",
                    "nodeType": "agent",
                    "tools": [{"kind": "node", "nodeId": "calc2"}],
                },
            },
            {
                "id": "calc2",
                "position": {"x": 0, "y": 0},
                "data": {"label": "C2", "nodeType": "tool", "toolType": "calculator"},
            },
        ],
        [{"id": "e1", "source": "agent_done", "target": "agent_live"}],
        entry_id="agent_done",
        exit_id="agent_live",
    )


def _ids(graph: dict) -> set[str]:
    return {n["id"] for n in graph["nodes"]}


def _pairs(graph: dict) -> set[tuple]:
    return {(e["source"], e["target"]) for e in graph["edges"]}


def test_prune_resume_drops_completed_and_rewires_frontier():
    graph = _linear_graph()
    pruned = prune_graph_for_resume(graph, {"a"}, {"b"})

    assert _ids(pruned) == {"trigger", "b", "c", "end"}
    # b lost its only parent → trigger feeds it directly.
    assert ("trigger", "b") in _pairs(pruned)
    # c keeps its real parent; end keeps its parent.
    assert ("b", "c") in _pairs(pruned)
    assert ("c", "end") in _pairs(pruned)
    validate_workflow_graph(pruned)


def test_prune_resume_conditional_child_dropped_when_unreached():
    """Unstarted conditional children of a completed router are pruned away."""
    graph = _router_graph()
    # router + a completed (a ran down route 'true'); b never started.
    pruned = prune_graph_for_resume(graph, {"router", "a"}, {"m"})

    assert "router" not in _ids(pruned)
    assert "a" not in _ids(pruned)
    # b's only incoming edge was the router's (removed); unreachable → dropped.
    assert "b" not in _ids(pruned)
    assert _ids(pruned) == {"trigger", "m", "end"}
    validate_workflow_graph(pruned)


def test_prune_resume_started_conditional_child_survives():
    """A conditional child that already started is a frontier member: keep it
    and rewire the trigger into it."""
    graph = _router_graph()
    pruned = prune_graph_for_resume(graph, {"router"}, {"a"})

    # a stays (frontier), wired from trigger; b and everything below it drop.
    assert "a" in _ids(pruned)
    assert ("trigger", "a") in _pairs(pruned)
    assert "b" not in _ids(pruned)
    validate_workflow_graph(pruned)


def test_prune_resume_keeps_end_reachable_via_bridge():
    """When the only path to End ran through completed nodes, the pruned
    graph re-wires remaining terminal nodes to End so it still validates."""
    graph = _linear_graph()
    # Everything non-structural completed; frontier points at the trigger
    # (a degenerate "resume only the tail" case).
    pruned = prune_graph_for_resume(graph, {"a", "b", "c"}, {"trigger"})

    assert _ids(pruned) == {"trigger", "end"}
    assert ("trigger", "end") in _pairs(pruned)
    validate_workflow_graph(pruned)


def test_prune_resume_raises_on_missing_frontier_node():
    graph = _linear_graph()
    with pytest.raises(RunAuthoringError):
        prune_graph_for_resume(graph, {"a"}, {"does-not-exist"})


def test_prune_resume_raises_without_trigger():
    graph = {
        "nodes": [_transform("a"), {"id": "end", "data": {"nodeType": "end"}}],
        "edges": [{"id": "e1", "source": "a", "target": "end"}],
    }
    with pytest.raises(RunAuthoringError):
        prune_graph_for_resume(graph, set(), {"a"})


def test_prune_resume_drops_orphaned_tool_declarations():
    """Tool declarations owned solely by a removed (completed) agent go away;
    declarations still referenced by surviving agents stay."""
    graph = _declaration_graph()
    pruned = prune_graph_for_resume(graph, {"agent_done"}, {"agent_live"})
    ids = _ids(pruned)
    assert "agent_done" not in ids and "calc1" not in ids
    assert "agent_live" in ids and "calc2" in ids
    validate_workflow_graph(pruned)
