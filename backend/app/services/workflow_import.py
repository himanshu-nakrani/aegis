"""Validate Aegis JSON imports; not an OpenAI Agent Builder code converter."""

from __future__ import annotations

from app.services.agent_tool_schema import SUPPORTED_AGENT_TOOL_TYPES
from app.services.graph_validation import GraphValidationError, validate_workflow_graph
from app.services.node_registry import get_node_meta

SUPPORTED_FORMAT = "aegis-workflow-v1"


class WorkflowImportError(ValueError):
    pass


def _validate_import_shape(graph: dict) -> None:
    """Reject malformed or unsupported nodes before DAG validation can omit them."""
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise WorkflowImportError("graph_json must include nodes and edges arrays")

    node_ids: set[str] = set()
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise WorkflowImportError(f"Node at index {index} must be a JSON object")
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip():
            raise WorkflowImportError(f"Node at index {index} must have a non-empty string id")
        if node_id in node_ids:
            raise WorkflowImportError(f"Duplicate node id: {node_id!r}")
        node_ids.add(node_id)

        data = node.get("data")
        if not isinstance(data, dict):
            raise WorkflowImportError(f"Node {node_id!r} must have a data object")
        node_type = data.get("nodeType", "agent")
        if not isinstance(node_type, str) or get_node_meta(node_type) is None:
            raise WorkflowImportError(
                f"Unsupported node type {node_type!r} on node {node_id!r}. "
                "Manually convert its behavior to a supported Aegis node; "
                "Agent Builder code and native graph exports are not supported."
            )
        tool_type = data.get("toolType", "calculator")
        if node_type == "tool" and (
            not isinstance(tool_type, str) or tool_type not in SUPPORTED_AGENT_TOOL_TYPES
        ):
            raise WorkflowImportError(
                f"Unsupported toolType {data.get('toolType')!r} on node {node_id!r}. "
                "MCP tools must be bound to an agent through credential references."
            )

    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise WorkflowImportError(f"Edge at index {index} must be a JSON object")
        for endpoint in ("source", "target"):
            node_id = edge.get(endpoint)
            if not isinstance(node_id, str) or node_id not in node_ids:
                raise WorkflowImportError(
                    f"Edge at index {index} references unknown {endpoint} node: {node_id!r}"
                )
        if edge.get("data") is not None and not isinstance(edge["data"], dict):
            raise WorkflowImportError(f"Edge at index {index} must have a data object")


def normalize_workflow_import(raw: dict) -> tuple[str, str | None, dict]:
    """Import Aegis exports or manually converted graph_json, without dropping nodes."""
    if not isinstance(raw, dict):
        raise WorkflowImportError("Import payload must be a JSON object")

    fmt = raw.get("format")
    if fmt is not None and fmt != SUPPORTED_FORMAT:
        raise WorkflowImportError(f"Unsupported format: {fmt!r} (expected {SUPPORTED_FORMAT!r})")

    graph = raw.get("graph_json")
    if not graph or not isinstance(graph, dict):
        raise WorkflowImportError("Missing or invalid graph_json")

    _validate_import_shape(graph)

    name = (raw.get("name") or "Imported Workflow").strip() or "Imported Workflow"
    description = raw.get("description")
    if description is not None:
        description = str(description).strip() or None

    try:
        validate_workflow_graph(graph)
    except GraphValidationError as exc:
        raise WorkflowImportError(str(exc)) from exc

    return name, description, graph