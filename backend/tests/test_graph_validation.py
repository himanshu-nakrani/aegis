import pytest

from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from tests.conftest import valid_graph


def test_valid_linear_graph():
    graph = valid_graph(
        [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "b", "data": {"nodeType": "evaluation"}},
        ],
        [{"source": "a", "target": "b"}],
    )
    summary = validate_workflow_graph(graph)
    assert summary["entry_node"] == "trigger"
    assert summary["exit_node"] == "end"
    assert summary["node_count"] == 4


def test_group_nodes_treated_as_annotation():
    graph = valid_graph(
        [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "grp", "data": {"nodeType": "group"}},
        ],
        [],
    )
    summary = validate_workflow_graph(graph)
    # group node is excluded from executable nodes, like a sticky note
    assert summary["annotation_count"] == 1
    assert summary["node_count"] == 3  # trigger, a, end


def test_rejects_cycle():
    graph = valid_graph(
        [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "b", "data": {"nodeType": "agent"}},
        ],
        [
            {"source": "a", "target": "b"},
            {"source": "b", "target": "a"},
        ],
    )
    with pytest.raises(GraphValidationError, match="acyclic"):
        validate_workflow_graph(graph)


def test_rejects_missing_trigger():
    graph = {
        "nodes": [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "end", "data": {"nodeType": "end"}},
        ],
        "edges": [{"source": "a", "target": "end"}],
    }
    with pytest.raises(GraphValidationError, match="exactly one Trigger"):
        validate_workflow_graph(graph)


def test_rejects_missing_end():
    graph = {
        "nodes": [
            {"id": "trigger", "data": {"nodeType": "trigger"}},
            {"id": "a", "data": {"nodeType": "agent"}},
        ],
        "edges": [{"source": "trigger", "target": "a"}],
    }
    with pytest.raises(GraphValidationError, match="exactly one End"):
        validate_workflow_graph(graph)


def test_rejects_end_not_terminal():
    graph = {
        "nodes": [
            {"id": "trigger", "data": {"nodeType": "trigger"}},
            {"id": "end", "data": {"nodeType": "end"}},
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "b", "data": {"nodeType": "agent"}},
        ],
        "edges": [
            {"source": "trigger", "target": "a"},
            {"source": "a", "target": "end"},
            {"source": "end", "target": "b"},
        ],
    }
    with pytest.raises(GraphValidationError, match="End node"):
        validate_workflow_graph(graph)


def test_router_validation_handles_null_edge_data():
    graph = valid_graph(
        [
            {
                "id": "router",
                "data": {"nodeType": "router", "routes": ["a", "b"]},
            },
            {"id": "left", "data": {"nodeType": "agent"}},
            {"id": "right", "data": {"nodeType": "agent"}},
            {"id": "join", "data": {"nodeType": "join"}},
        ],
        [
            {"source": "router", "target": "left", "data": None, "label": "a"},
            {"source": "router", "target": "right", "data": None, "label": "b"},
            {"source": "left", "target": "join"},
            {"source": "right", "target": "join"},
        ],
        exit_id="join",
    )
    summary = validate_workflow_graph(graph)
    assert summary["has_router"] is True


def _tool_graph(agent_data=None):
    return valid_graph([
        {"id": "agent", "data": {"nodeType": "agent", "tools": [{"kind": "node", "nodeId": "calc"}], **(agent_data or {})}},
        {"id": "calc", "data": {"nodeType": "tool", "toolType": "calculator"}},
    ])


def test_attached_tool_is_retained_but_not_a_workflow_step():
    from app.services.agent_tool_schema import executable_graph

    graph = _tool_graph()
    graph["nodes"].append({"id": "note", "data": {"nodeType": "note"}})
    summary = validate_workflow_graph(graph)
    nodes, edges = executable_graph(graph)

    assert {node["id"] for node in nodes} == {"trigger", "agent", "end"}
    assert {(edge["source"], edge["target"]) for edge in edges} == {("trigger", "agent"), ("agent", "end")}
    assert summary["node_count"] == 3
    assert summary["tool_declaration_count"] == 1
    assert summary["annotation_count"] == 1
    assert graph["nodes"][2]["id"] == "calc"


def test_attached_tool_can_be_shared_by_multiple_agents():
    graph = valid_graph([
        {"id": "a", "data": {"nodeType": "agent", "tools": [{"kind": "node", "nodeId": "calc"}]}},
        {"id": "b", "data": {"nodeType": "agent", "tools": [{"kind": "node", "nodeId": "calc"}]}},
        {"id": "calc", "data": {"nodeType": "tool", "toolType": "calculator"}},
    ], [{"source": "a", "target": "b"}])

    assert validate_workflow_graph(graph)["node_count"] == 4


@pytest.mark.parametrize("reference", [
    {"kind": "node", "nodeId": "missing"},
    {"kind": "node", "nodeId": "agent"},
    {"kind": "node", "nodeId": "end"},
    {"kind": "node", "nodeId": "calc", "config": {"api_key": "secret"}},
    {"kind": "node", "nodeId": "calc", "requireApproval": "true"},
    {"kind": "node", "nodeId": None},
    {"kind": "mcp", "credentialId": "bad-id", "toolName": "lookup"},
    {"kind": "mcp", "credentialId": "00000000-0000-0000-0000-000000000001", "toolName": " "},
    {"kind": "mcp", "credentialId": "00000000-0000-0000-0000-000000000001", "toolName": "lookup", "headers": {"Authorization": "secret"}},
    {"kind": "unknown"},
    "calc",
])
def test_rejects_broken_or_inline_tool_references(reference):
    graph = _tool_graph({"tools": [reference]})
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


@pytest.mark.parametrize("field", ["maxToolIterations", "tokenBudget"])
@pytest.mark.parametrize("value", [0, -1, True, False, "8", 1.5, float("nan"), float("inf"), None])
def test_agent_tool_bounds_require_positive_integers(field, value):
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(_tool_graph({field: value}))


@pytest.mark.parametrize("field", ["maxToolIterations", "tokenBudget"])
def test_agent_tool_bounds_allow_positive_integer_boundary(field):
    assert validate_workflow_graph(_tool_graph({field: 1}))["node_count"] == 3


@pytest.mark.parametrize("tools", [None, {}, "calc", [{"kind": "node", "nodeId": "calc"}, {"kind": "node", "nodeId": "calc", "requireApproval": True}]])
def test_rejects_malformed_or_duplicate_tool_lists(tools):
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(_tool_graph({"tools": tools}))


@pytest.mark.parametrize("edge", [{"source": "calc", "target": "end"}, {"source": "agent", "target": "calc"}])
def test_rejects_connected_tool_declarations(edge):
    graph = _tool_graph()
    graph["edges"].append(edge)
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


def test_unreferenced_disconnected_tool_is_still_an_orphan():
    graph = _tool_graph()
    graph["nodes"][1]["data"]["tools"] = []
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


def test_legacy_typeless_agent_can_attach_tools_without_graph_mutation():
    graph = _tool_graph()
    del graph["nodes"][1]["data"]["nodeType"]
    assert validate_workflow_graph(graph)["node_count"] == 3
    assert "nodeType" not in graph["nodes"][1]["data"]


def test_mcp_ref_is_shape_validated_without_global_credential_lookup():
    graph = valid_graph([{"id": "agent", "data": {"nodeType": "agent", "tools": [{"kind": "mcp", "credentialId": "00000000-0000-0000-0000-000000000001", "toolName": "lookup", "requireApproval": True}]}}])
    assert validate_workflow_graph(graph)["node_count"] == 3


def test_duplicate_mcp_identity_rejects_alternate_uuid_spelling():
    credential_id = "12345678-1234-1234-1234-123456789abc"
    graph = valid_graph([{"id": "agent", "data": {"nodeType": "agent", "tools": [
        {"kind": "mcp", "credentialId": credential_id, "toolName": "lookup"},
        {"kind": "mcp", "credentialId": credential_id.upper(), "toolName": "lookup"},
    ]}}])
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


@pytest.mark.parametrize("tools_enabled", [False, True])
def test_only_tool_enabled_agents_can_route_failures(tools_enabled):
    graph = _tool_graph() if tools_enabled else valid_graph([{"id": "agent", "data": {"nodeType": "agent"}}])
    graph["edges"][1]["data"] = {"route": "error"}
    if tools_enabled:
        assert validate_workflow_graph(graph)["node_count"] == 3
    else:
        with pytest.raises(GraphValidationError):
            validate_workflow_graph(graph)


def test_rejects_unknown_edge_in_save_validation_not_only_import():
    graph = _tool_graph()
    graph["edges"].append({"source": "agent", "target": "missing"})
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


def test_rejects_ambiguous_tool_declaration_ids():
    graph = _tool_graph()
    graph["nodes"].append({"id": "calc", "data": {"nodeType": "tool", "toolType": "http"}})
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


@pytest.mark.parametrize("data", [{"tools": []}, {"maxToolIterations": 1}, {"tokenBudget": 1}])
def test_agent_tool_config_is_not_allowed_on_other_node_types(data):
    graph = valid_graph([{"id": "transform", "data": {"nodeType": "transform", **data}}])
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)


def test_rejects_unsupported_attached_tool_type():
    graph = _tool_graph()
    graph["nodes"][2]["data"]["toolType"] = "mcp"
    with pytest.raises(GraphValidationError):
        validate_workflow_graph(graph)

def test_rejects_duplicate_node_ids():
    graph = valid_graph(
        [
            {"id": "dup", "data": {"nodeType": "agent"}},
            {"id": "dup", "data": {"nodeType": "agent"}},
        ]
    )
    with pytest.raises(GraphValidationError, match="Duplicate node id"):
        validate_workflow_graph(graph)


def test_rejects_adk_name_collisions():
    graph = valid_graph(
        [
            {"id": "a-b", "data": {"nodeType": "agent"}},
            {"id": "a_b", "data": {"nodeType": "agent"}},
        ]
    )
    with pytest.raises(GraphValidationError, match="collide after sanitization"):
        validate_workflow_graph(graph)


def test_rejects_unlabeled_extra_branch_edge():
    # routes ['a'] + labeled a + unlabeled extra: the extra compiles to
    # route=None, which ADK fires unconditionally (accidental fan-out).
    graph = valid_graph(
        [
            {"id": "router", "data": {"nodeType": "router", "routes": ["a"]}},
            {"id": "left", "data": {"nodeType": "agent"}},
            {"id": "extra", "data": {"nodeType": "agent"}},
            {"id": "join", "data": {"nodeType": "join"}},
        ],
        [
            {"source": "router", "target": "left", "label": "a"},
            {"source": "router", "target": "extra"},
            {"source": "left", "target": "join"},
            {"source": "extra", "target": "join"},
        ],
        exit_id="join",
    )
    with pytest.raises(GraphValidationError, match="no route label"):
        validate_workflow_graph(graph)


def test_tool_type_prefix_collision_rejected():
    # tool nodes compile with toolType prefixes: http_x vs http-x collide.
    graph = valid_graph(
        [
            {"id": "http-x", "data": {"nodeType": "tool", "toolType": "http"}},
            {"id": "http_x", "data": {"nodeType": "tool", "toolType": "http"}},
        ]
    )
    with pytest.raises(GraphValidationError, match="collide after sanitization"):
        validate_workflow_graph(graph)


def test_annotations_excluded_from_collision_check():
    # note_ ids are unsanitized and never routed: a-b/a_b notes must pass.
    graph = valid_graph(
        [
            {"id": "a", "data": {"nodeType": "agent"}},
            {"id": "n1", "data": {"nodeType": "note"}},
            {"id": "n2", "data": {"nodeType": "note"}},
        ]
    )
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 3


def test_default_label_on_if_node_rejected():
    # L1: "default" is not a declared route of an if node — it would compile
    # unconditional (route=None) and fire alongside the matched branch.
    # A downstream agent gives the wrapper a non-branch exit so its
    # auto-wired exit edge doesn't trip the branch-edge checks.
    graph = valid_graph(
        [
            {"id": "cond", "data": {"nodeType": "if"}},
            {"id": "tail", "data": {"nodeType": "agent"}},
        ],
        [
            {"source": "cond", "target": "tail", "data": {"route": "true"}},
            {"source": "cond", "target": "tail", "data": {"route": "false"}},
            {"source": "cond", "target": "tail", "data": {"route": "default"}},
        ],
    )
    with pytest.raises(GraphValidationError, match="default"):
        validate_workflow_graph(graph)


def test_switch_configured_default_label_allowed():
    # A switch whose own switchDefault is "other" may carry that label.
    graph = valid_graph(
        [
            {
                "id": "sw",
                "data": {"nodeType": "switch", "switchCases": ["a"], "switchDefault": "other"},
            },
            {"id": "tail", "data": {"nodeType": "agent"}},
        ],
        [
            {"source": "sw", "target": "tail", "data": {"route": "a"}},
            {"source": "sw", "target": "tail", "data": {"route": "other"}},
        ],
    )
    summary = validate_workflow_graph(graph)
    assert summary["node_count"] >= 4


def test_overlong_node_id_rejected():
    # O4: node ids overflow String(128) at runtime on Postgres.
    graph = valid_graph([{"id": "n" * 129, "data": {"nodeType": "agent"}}])
    with pytest.raises(GraphValidationError, match="128"):
        validate_workflow_graph(graph)
