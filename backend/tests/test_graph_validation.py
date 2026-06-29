import pytest

from app.services.graph_validation import GraphValidationError, validate_workflow_graph


def test_valid_linear_graph():
    graph = {
        "nodes": [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "b", "data": {"nodeType": "evaluation"}},
        ],
        "edges": [{"source": "a", "target": "b"}],
    }
    summary = validate_workflow_graph(graph)
    assert summary["entry_node"] == "a"
    assert summary["node_count"] == 2


def test_rejects_cycle():
    graph = {
        "nodes": [{"id": "a", "data": {}}, {"id": "b", "data": {}}],
        "edges": [
            {"source": "a", "target": "b"},
            {"source": "b", "target": "a"},
        ],
    }
    with pytest.raises(GraphValidationError, match="acyclic"):
        validate_workflow_graph(graph)


def test_rejects_multiple_entry_nodes():
    graph = {
        "nodes": [{"id": "a", "data": {}}, {"id": "b", "data": {}}],
        "edges": [],
    }
    with pytest.raises(GraphValidationError, match="exactly one entry"):
        validate_workflow_graph(graph)