import pytest

from app.services.compiler import compile_workflow, topological_sort


def test_topological_sort_linear():
    nodes = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    edges = [
        {"source": "a", "target": "b"},
        {"source": "b", "target": "c"},
    ]
    assert topological_sort(nodes, edges) == ["a", "b", "c"]


def test_topological_sort_rejects_cycles():
    nodes = [{"id": "a"}, {"id": "b"}]
    edges = [
        {"source": "a", "target": "b"},
        {"source": "b", "target": "a"},
    ]
    with pytest.raises(ValueError, match="acyclic"):
        topological_sort(nodes, edges)


def test_compile_workflow_metadata_adk_names():
    graph = {
        "nodes": [
            {
                "id": "n1",
                "data": {"label": "Agent", "nodeType": "agent", "instruction": "Hi"},
            },
            {
                "id": "n2",
                "data": {"label": "Guard", "nodeType": "guardrail", "rules": {}},
            },
        ],
        "edges": [{"source": "n1", "target": "n2"}],
    }
    workflow, metadata = compile_workflow(graph)
    assert workflow.name == "aegis_workflow"
    assert metadata["n1"]["node_id"] == "n1"
    assert metadata["n2"]["node_id"] == "n2"
    assert "agent" in metadata["n1"]["adk_name"]
    assert "guardrail" in metadata["n2"]["adk_name"]