import pytest

from app.services.compiler import compile_workflow
from app.services.node_handlers import filter_executable_graph
from tests.conftest import valid_graph


def test_transform_node_compiles():
    graph = valid_graph(
        [
            {"id": "n1", "data": {"label": "T", "nodeType": "transform", "template": "Hello {{input}}!"}},
        ],
    )
    workflow, metadata, _author_lookup = compile_workflow(graph)
    assert workflow.name == "aegis_workflow"
    assert metadata["n1"]["type"] == "transform"


def test_note_nodes_excluded_from_execution():
    graph = valid_graph(
        [
            {"id": "n1", "data": {"label": "Agent", "nodeType": "agent", "instruction": "Hi"}},
            {"id": "note1", "data": {"label": "Note", "nodeType": "note", "noteText": "docs"}},
        ],
    )
    filtered = filter_executable_graph(graph)
    assert len(filtered["nodes"]) == 3  # trigger, n1, end (note excluded)
    workflow, metadata, _author_lookup = compile_workflow(graph)
    assert "note1" in metadata
    assert metadata["note1"].get("is_annotation")


def test_input_schema_structures_context():
    from app.services.node_handlers import _make_input_schema_fn

    context: dict = {"input": {}, "steps": {}, "last_output": ""}
    fn = _make_input_schema_fn(
        "schema",
        [{"key": "message", "required": True}, {"key": "priority", "default": "normal"}],
        "input_schema",
        context,
    )
    out = fn('{"message": "hello"}')
    assert "hello" in out
    assert context["input"]["message"] == "hello"
    assert context["input"]["priority"] == "normal"


def test_if_returns_router_decision():
    from app.services.node_handlers import _make_if_fn

    context = {"input": {"priority": "high"}, "steps": {}, "last_output": "x"}
    fn = _make_if_fn("if1", "{{input.priority}}", "eq", "high", "if_if1", context)
    decision = fn("x")
    assert decision.route == "true"


def test_transform_renders_step_expressions():
    from app.services.node_handlers import _make_transform_fn

    context = {
        "input": {"text": "start"},
        "steps": {"agent_1": {"output": "hello world", "label": "Agent"}},
        "last_output": "hello world",
    }
    fn = _make_transform_fn("t1", "Reply: {{steps.agent_1.output}}", "transform_t1", context)
    assert fn("ignored") == "Reply: hello world"


def test_json_parse_and_delay_compile():
    graph = valid_graph(
        [
            {"id": "n1", "data": {"label": "Parse", "nodeType": "json_parse", "jsonPath": "name"}},
            {"id": "n2", "data": {"label": "Wait", "nodeType": "delay", "delaySeconds": 0.1}},
        ],
        [{"source": "n1", "target": "n2"}],
    )
    workflow, metadata, _author_lookup = compile_workflow(graph)
    assert metadata["n1"]["type"] == "json_parse"
    assert metadata["n2"]["type"] == "delay"