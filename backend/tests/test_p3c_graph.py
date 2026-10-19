"""P3-C slice G: reliability fields on bare-Agent nodes, pinned-output
serialization, and join-under-exclusive-branch validation."""

import json

import pytest

from app.db import models  # noqa: F401 — registers tables for create_all
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.run_authoring import seed_pinned_outputs
from app.services.workflow_context import WorkflowContext
from tests.conftest import valid_graph


def _node(node_id: str, node_type: str, **data) -> dict:
    return {"id": node_id, "position": {"x": 0, "y": 0}, "data": {"nodeType": node_type, **data}}


def _edge(source: str, target: str, **kwargs) -> dict:
    return {"id": f"e-{source}-{target}", "source": source, "target": target, **kwargs}


# --- L18: pinned non-string outputs serialize as JSON ------------------------


def _pinned_graph() -> dict:
    return valid_graph([_node("a", "transform", template="{{last_output}}")])


def test_seed_pinned_outputs_writes_dict_as_json():
    context = WorkflowContext("run it")
    seed_pinned_outputs(context, _pinned_graph(), {"a": {"answer": 42, "tags": ["x", "y"]}})
    output = context.to_dict()["steps"]["a"]["output"]
    assert json.loads(output) == {"answer": 42, "tags": ["x", "y"]}
    assert output.startswith("{")
    assert "'" not in output  # not the Python repr


def test_seed_pinned_outputs_writes_list_as_json_and_keeps_strings():
    context = WorkflowContext("run it")
    seed_pinned_outputs(context, _pinned_graph(), {"a": [1, 2, 3]})
    assert json.loads(context.to_dict()["steps"]["a"]["output"]) == [1, 2, 3]
    seed_pinned_outputs(context, _pinned_graph(), {"a": "already text"})
    assert context.to_dict()["steps"]["a"]["output"] == "already text"


# --- L17: retries/timeoutSec rejected on bare-Agent node types ---------------


def test_retries_rejected_on_bare_agent():
    graph = valid_graph([_node("a", "agent", retries=2)])
    with pytest.raises(GraphValidationError, match="[Rr]etr"):
        validate_workflow_graph(graph)


def test_timeout_rejected_on_bare_agent():
    graph = valid_graph([_node("a", "agent", timeoutSec=30)])
    with pytest.raises(GraphValidationError, match="[Tt]imeout"):
        validate_workflow_graph(graph)


def test_retry_delay_rejected_on_bare_agent():
    graph = valid_graph([_node("a", "agent", retryDelaySec=2)])
    with pytest.raises(GraphValidationError, match="[Rr]etry delay"):
        validate_workflow_graph(graph)


@pytest.mark.parametrize("node_type", ["summarizer", "translator", "extractor", "join"])
def test_retries_rejected_on_other_bare_adk_types(node_type):
    graph = valid_graph([_node("a", node_type, retries=1)])
    with pytest.raises(GraphValidationError, match="[Rr]etr"):
        validate_workflow_graph(graph)


def test_retries_rejected_on_google_search_tool():
    graph = valid_graph([_node("a", "tool", toolType="search", searchProvider="google", timeoutSec=10)])
    with pytest.raises(GraphValidationError, match="[Tt]imeout"):
        validate_workflow_graph(graph)


def test_retries_rejected_on_inline_eval():
    graph = valid_graph([_node("a", "evaluation", evalType="llm", evalExecutionMode="inline", retries=1)])
    with pytest.raises(GraphValidationError, match="[Rr]etr"):
        validate_workflow_graph(graph)


def test_retries_allowed_on_tool_agent():
    graph = valid_graph(
        [
            _node("a", "agent", tools=[{"kind": "node", "nodeId": "calc"}], retries=2, timeoutSec=30),
            _node("calc", "tool", toolType="calculator"),
        ]
    )
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 3


def test_retries_allowed_on_expression_agent():
    graph = valid_graph(
        [_node("a", "agent", instruction="Tell me about {{input.text}}", retries=1, timeoutSec=10)]
    )
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 3


def test_retries_allowed_on_function_nodes():
    graph = valid_graph([_node("a", "transform", template="x", retries=2, timeoutSec=5)])
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 3


def test_zero_reliability_values_not_flagged():
    graph = valid_graph([_node("a", "agent", retries=0, timeoutSec=0)])
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 3


# --- L19: joins fed by exclusive branches deadlock ----------------------------


def test_join_rejects_exclusive_branch_predecessors():
    # router -a-> left -+-> join -> end ; router -b-> right -+
    # Only one branch runs per run, so the join can never see both
    # predecessors complete — ADK JoinNode waits for all predecessors.
    graph = valid_graph(
        [
            _node("router", "router", routes=["a", "b"]),
            _node("left", "transform", template="l"),
            _node("right", "transform", template="r"),
            _node("join", "join"),
        ],
        [
            _edge("router", "left", label="a"),
            _edge("router", "right", label="b"),
            _edge("left", "join"),
            _edge("right", "join"),
        ],
        entry_id="router",
        exit_id="join",
    )
    with pytest.raises(GraphValidationError, match="[Jj]oin"):
        validate_workflow_graph(graph)


def test_join_rejects_conditional_inbound_edge():
    # Labeled edges straight into a join: the barrier is only re-checked when
    # the matched route fires, so the sibling route can never release it.
    graph = valid_graph(
        [
            _node("src", "transform", template="s"),
            _node("router", "router", routes=["a", "b"]),
            _node("join", "join"),
        ],
        [
            _edge("src", "router"),
            _edge("router", "join", label="a"),
            _edge("router", "join", label="b"),
        ],
        entry_id="src",
        exit_id="join",
    )
    with pytest.raises(GraphValidationError, match="[Jj]oin"):
        validate_workflow_graph(graph)


def test_join_rejects_partial_branch_fan_in():
    # Branch nodes x,y only run under router route 'a'; 'other' always runs.
    # Under route 'b' the join fires from 'other' but starves on x and y.
    graph = valid_graph(
        [
            _node("src", "transform", template="s"),
            _node("router", "router", routes=["a", "b"]),
            _node("x", "transform", template="x"),
            _node("y", "transform", template="y"),
            _node("tail", "transform", template="t"),
            _node("other", "transform", template="o"),
            _node("join", "join"),
        ],
        [
            _edge("src", "router"),
            _edge("src", "other"),
            _edge("router", "x", label="a"),
            _edge("x", "y"),
            _edge("router", "tail", label="b"),
            _edge("x", "join"),
            _edge("y", "join"),
            _edge("other", "join"),
            _edge("join", "tail"),
        ],
        entry_id="src",
        exit_id="tail",
    )
    with pytest.raises(GraphValidationError, match="[Jj]oin"):
        validate_workflow_graph(graph)


def test_join_accepts_parallel_unconditional_fan_in():
    # Parallel fan-out from a non-branch node: both predecessors always run.
    graph = valid_graph(
        [
            _node("src", "transform", template="s"),
            _node("a", "transform", template="a"),
            _node("b", "transform", template="b"),
            _node("join", "join"),
        ],
        [
            _edge("src", "a"),
            _edge("src", "b"),
            _edge("a", "join"),
            _edge("b", "join"),
        ],
        entry_id="src",
        exit_id="join",
    )
    summary = validate_workflow_graph(graph)
    assert summary["join_nodes"] == ["join"]


def test_join_accepts_reconverged_branches_before_regular_merge():
    # Exclusive branches reconverge at regular merge m before the join — m
    # always completes regardless of the taken route, so the join is safe.
    graph = valid_graph(
        [
            _node("src", "transform", template="s"),
            _node("router", "router", routes=["a", "b"]),
            _node("x", "transform", template="x"),
            _node("y", "transform", template="y"),
            _node("m", "transform", template="m"),
            _node("other", "transform", template="o"),
            _node("join", "join"),
        ],
        [
            _edge("src", "router"),
            _edge("src", "other"),
            _edge("router", "x", label="a"),
            _edge("router", "y", label="b"),
            _edge("x", "m"),
            _edge("y", "m"),
            _edge("m", "join"),
            _edge("other", "join"),
        ],
        entry_id="src",
        exit_id="join",
    )
    summary = validate_workflow_graph(graph)
    assert summary["join_nodes"] == ["join"]


def test_join_accepts_nested_router_that_reconverges_before_the_join():
    """Outer router → inner router → merge → parallel → join is valid.

    Whichever inner route wins, both join inputs run. Analyzing the outer
    outcome must not treat the inner router's edges as dead.
    """
    graph = valid_graph(
        [
            _node("outer", "router", routes=["a", "b"]),
            _node("inner", "router", routes=["x", "y"]),
            _node("A", "transform", template="a"),
            _node("B", "transform", template="b"),
            _node("merge", "transform", template="m"),
            _node("P1", "transform", template="1"),
            _node("P2", "transform", template="2"),
            _node("join", "join"),
            _node("bypass", "transform", template="z"),
        ],
        [
            _edge("outer", "inner", label="a"),
            _edge("outer", "bypass", label="b"),
            _edge("inner", "A", label="x"),
            _edge("inner", "B", label="y"),
            _edge("A", "merge"),
            _edge("B", "merge"),
            _edge("merge", "P1"),
            _edge("merge", "P2"),
            _edge("P1", "join"),
            _edge("P2", "join"),
            _edge("bypass", "end"),
        ],
        entry_id="outer",
        exit_id="join",
    )
    summary = validate_workflow_graph(graph)
    assert summary["join_nodes"] == ["join"]


def test_join_still_rejects_nested_router_that_does_not_reconverge():
    """Inner route y never reaches the join — that join can stall."""
    graph = valid_graph(
        [
            _node("outer", "router", routes=["a", "b"]),
            _node("inner", "router", routes=["x", "y"]),
            _node("A", "transform", template="a"),
            _node("B", "transform", template="b"),
            _node("C", "transform", template="c"),
            _node("join", "join"),
        ],
        [
            _edge("outer", "inner", label="a"),
            _edge("outer", "C", label="b"),
            _edge("inner", "A", label="x"),
            _edge("inner", "B", label="y"),
            _edge("A", "join"),
            _edge("C", "join"),
            _edge("B", "end"),
        ],
        entry_id="outer",
        exit_id="join",
    )
    with pytest.raises(GraphValidationError, match="can stall"):
        validate_workflow_graph(graph)
