"""Agent tool references and the executable/declaration boundary of a graph."""

from __future__ import annotations

from collections import Counter
from typing import Literal, NotRequired, TypedDict
from uuid import UUID


DEFAULT_MAX_TOOL_ITERATIONS = 8
DEFAULT_TOKEN_BUDGET = 8192
SUPPORTED_AGENT_TOOL_TYPES = frozenset({"calculator", "http", "search"})
ANNOTATION_NODE_TYPES = frozenset({"note", "group"})


class NodeToolReference(TypedDict):
    kind: Literal["node"]
    nodeId: str
    requireApproval: NotRequired[bool]


class MCPToolReference(TypedDict):
    kind: Literal["mcp"]
    credentialId: str
    toolName: str
    requireApproval: NotRequired[bool]


ToolReference = NodeToolReference | MCPToolReference


class AgentToolSchemaError(ValueError):
    pass


AGENT_TOOL_CONFIG_SCHEMA = {
    "tools": {
        "type": "array",
        "default": [],
        "items": {
            "oneOf": [
                {
                    "type": "object",
                    "required": ["kind", "nodeId"],
                    "additionalProperties": False,
                    "properties": {
                        "kind": {"const": "node"},
                        "nodeId": {"type": "string", "minLength": 1},
                        "requireApproval": {"type": "boolean"},
                    },
                },
                {
                    "type": "object",
                    "required": ["kind", "credentialId", "toolName"],
                    "additionalProperties": False,
                    "properties": {
                        "kind": {"const": "mcp"},
                        "credentialId": {"type": "string", "format": "uuid"},
                        "toolName": {"type": "string", "minLength": 1},
                        "requireApproval": {"type": "boolean"},
                    },
                },
            ],
        },
    },
    "maxToolIterations": {"type": "integer", "minimum": 1, "default": DEFAULT_MAX_TOOL_ITERATIONS},
    "tokenBudget": {"type": "integer", "minimum": 1, "default": DEFAULT_TOKEN_BUDGET},
}


def attached_tool_node_ids(graph_json: dict | None) -> set[str]:
    """Declaration IDs referenced by agents; call validation before execution.

    This read-only extraction also works with partial capability-check graphs.
    It never mutates or removes the stored canvas declarations.
    """
    attached: set[str] = set()
    for node in (graph_json or {}).get("nodes", []):
        data = node.get("data") or {}
        if data.get("nodeType", "agent") != "agent":
            continue
        references = data.get("tools", [])
        if not isinstance(references, list):
            continue
        for reference in references:
            if (
                isinstance(reference, dict)
                and reference.get("kind") == "node"
                and isinstance(reference.get("nodeId"), str)
            ):
                attached.add(reference["nodeId"])
    return attached


def executable_nodes(graph_json: dict | None) -> list[dict]:
    """Workflow steps, excluding annotations and agent-attached declarations."""
    attached = attached_tool_node_ids(graph_json)
    return [
        node
        for node in (graph_json or {}).get("nodes", [])
        if (node.get("data") or {}).get("nodeType") not in ANNOTATION_NODE_TYPES
        and node.get("id") not in attached
    ]


def executable_graph(graph_json: dict | None) -> tuple[list[dict], list[dict]]:
    """Extract executable nodes/edges from an already validated graph."""
    nodes = executable_nodes(graph_json)
    node_ids = {node["id"] for node in nodes}
    edges = [
        edge
        for edge in (graph_json or {}).get("edges", [])
        if edge.get("source") in node_ids and edge.get("target") in node_ids
    ]
    return nodes, edges


def validate_agent_tool_schema(graph_json: dict) -> set[str]:
    """Validate stable references and bounds, returning attached declarations.

    MCP credential ownership, existence, and discovered tool availability require
    the workflow owner's context and are resolved by the API/runtime, not here.
    """
    nodes = graph_json.get("nodes", [])
    node_map = {node["id"]: node for node in nodes}
    id_counts = Counter(node["id"] for node in nodes)
    attached: set[str] = set()
    for node in nodes:
        data = node.get("data") or {}
        node_id = node["id"]
        if data.get("tools") and id_counts[node_id] != 1:
            raise AgentToolSchemaError(f"Agent tool references require unique node ids; '{node_id}' is ambiguous.")
        if data.get("nodeType", "agent") != "agent":
            if any(key in data for key in AGENT_TOOL_CONFIG_SCHEMA):
                raise AgentToolSchemaError(f"Node '{node_id}' configures agent-only tool fields.")
            continue
        for field in ("maxToolIterations", "tokenBudget"):
            if field in data and (type(data[field]) is not int or data[field] <= 0):
                raise AgentToolSchemaError(f"Agent '{node_id}' {field} must be a positive integer.")
        references = data.get("tools", [])
        if not isinstance(references, list):
            raise AgentToolSchemaError(f"Agent '{node_id}' tools must be a list of stable references.")
        identities: set[tuple[str, ...]] = set()
        for reference in references:
            if not isinstance(reference, dict):
                raise AgentToolSchemaError(f"Agent '{node_id}' tool references must be objects.")
            kind = reference.get("kind")
            if kind == "node":
                required = {"kind", "nodeId"}
            elif kind == "mcp":
                required = {"kind", "credentialId", "toolName"}
            else:
                raise AgentToolSchemaError(f"Agent '{node_id}' has an unknown tool reference kind.")
            if not required <= reference.keys() or reference.keys() - required - {"requireApproval"}:
                raise AgentToolSchemaError(f"Agent '{node_id}' tools accept stable references only, not inline configuration or secrets.")
            if "requireApproval" in reference and type(reference["requireApproval"]) is not bool:
                raise AgentToolSchemaError(f"Agent '{node_id}' tool requireApproval must be a boolean.")
            if kind == "node":
                target_id = reference["nodeId"]
                if not isinstance(target_id, str) or not target_id.strip():
                    raise AgentToolSchemaError(f"Agent '{node_id}' tool nodeId must be a non-empty string.")
                if target_id == node_id:
                    raise AgentToolSchemaError(f"Agent '{node_id}' cannot reference itself as a tool.")
                if id_counts[target_id] > 1:
                    raise AgentToolSchemaError(f"Agent '{node_id}' references ambiguous tool node '{target_id}'.")
                target = node_map.get(target_id)
                if target is None:
                    raise AgentToolSchemaError(f"Agent '{node_id}' references missing tool node '{target_id}'.")
                target_data = target.get("data") or {}
                if target_data.get("nodeType") != "tool":
                    raise AgentToolSchemaError(f"Agent '{node_id}' reference '{target_id}' is not a Tool node.")
                tool_type = target_data.get("toolType", "calculator")
                if not isinstance(tool_type, str) or tool_type not in SUPPORTED_AGENT_TOOL_TYPES:
                    raise AgentToolSchemaError(f"Tool node '{target_id}' has an unsupported toolType.")
                identity = ("node", target_id)
                attached.add(target_id)
            else:
                credential_id = reference["credentialId"]
                tool_name = reference["toolName"]
                if not isinstance(credential_id, str):
                    raise AgentToolSchemaError(f"Agent '{node_id}' MCP credentialId must be a UUID string.")
                try:
                    credential_uuid = UUID(credential_id)
                except (ValueError, AttributeError) as exc:
                    raise AgentToolSchemaError(f"Agent '{node_id}' MCP credentialId must be a UUID string.") from exc
                if not isinstance(tool_name, str) or not tool_name.strip():
                    raise AgentToolSchemaError(f"Agent '{node_id}' MCP toolName must be a non-empty string.")
                identity = ("mcp", str(credential_uuid), tool_name)
            if identity in identities:
                raise AgentToolSchemaError(f"Agent '{node_id}' has a duplicate tool reference.")
            identities.add(identity)
    for edge in graph_json.get("edges", []):
        if edge.get("source") in attached or edge.get("target") in attached:
            raise AgentToolSchemaError("Agent-attached Tool declarations cannot have incoming or outgoing workflow edges.")
    return attached
