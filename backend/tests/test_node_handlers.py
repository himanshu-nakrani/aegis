import pytest

from app.services.compiler import compile_workflow
from app.services.node_handlers import filter_executable_graph


def test_transform_node_compiles():
    graph = {
        "nodes": [
            {"id": "n1", "data": {"label": "T", "nodeType": "transform", "template": "Hello {{input}}!"}},
        ],
        "edges": [],
    }
    workflow, metadata = compile_workflow(graph)
    assert workflow.name == "aegis_workflow"
    assert metadata["n1"]["type"] == "transform"


def test_note_nodes_excluded_from_execution():
    graph = {
        "nodes": [
            {"id": "n1", "data": {"label": "Agent", "nodeType": "agent", "instruction": "Hi"}},
            {"id": "note1", "data": {"label": "Note", "nodeType": "note", "noteText": "docs"}},
        ],
        "edges": [],
    }
    filtered = filter_executable_graph(graph)
    assert len(filtered["nodes"]) == 1
    workflow, metadata = compile_workflow(graph)
    assert "note1" in metadata
    assert metadata["note1"].get("is_annotation")


def test_json_parse_and_delay_compile():
    graph = {
        "nodes": [
            {"id": "n1", "data": {"label": "Parse", "nodeType": "json_parse", "jsonPath": "name"}},
            {"id": "n2", "data": {"label": "Wait", "nodeType": "delay", "delaySeconds": 0.1}},
        ],
        "edges": [{"source": "n1", "target": "n2"}],
    }
    workflow, metadata = compile_workflow(graph)
    assert metadata["n1"]["type"] == "json_parse"
    assert metadata["n2"]["type"] == "delay"