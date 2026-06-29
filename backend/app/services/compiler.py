from __future__ import annotations

import ast
import operator
from collections import defaultdict, deque
from typing import Any, Callable

from google.adk import Agent, Workflow
from google.adk.tools.google_search_tool import google_search

from app.config import settings
from app.services.eval import EvalScores, build_eval_instruction
from app.services.guardrail import GuardrailResult, apply_fail_behavior, validate_content
from app.services.search import run_search

SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(expression: str) -> str:
    expression = expression.strip()
    if not expression:
        return "0"
    try:
        node = ast.parse(expression, mode="eval")
        return str(_eval_node(node.body))
    except Exception as exc:
        return f"Calculator error: {exc}"


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPERATORS:
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        return float(SAFE_OPERATORS[type(node.op)](left, right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in SAFE_OPERATORS:
        return float(SAFE_OPERATORS[type(node.op)](_eval_node(node.operand)))
    raise ValueError("Unsupported expression")


def topological_sort(nodes: list[dict], edges: list[dict]) -> list[str]:
    node_ids = {n["id"] for n in nodes}
    indegree: dict[str, int] = {nid: 0 for nid in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source in node_ids and target in node_ids:
            adjacency[source].append(target)
            indegree[target] += 1

    queue: deque[str] = deque([nid for nid, deg in indegree.items() if deg == 0])
    order: list[str] = []

    while queue:
        current = queue.popleft()
        order.append(current)
        for neighbor in adjacency[current]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(node_ids):
        raise ValueError("Workflow graph must be a directed acyclic graph (no cycles).")

    return order


def _node_data(node: dict) -> dict:
    return node.get("data", {}) or {}


def _make_calculator_fn(node_id: str) -> Callable[[str], str]:
    def calculator(node_input: str) -> str:
        return _safe_eval(str(node_input))

    calculator.__name__ = f"calculator_{node_id}"
    return calculator


def _make_search_fn(node_id: str, provider: str) -> Callable[[str], str]:
    def search_tool(node_input: str) -> str:
        if provider == "google":
            return str(node_input)
        return run_search(provider, str(node_input))

    search_tool.__name__ = f"search_{node_id}"
    return search_tool


def _make_guardrail_fn(
    node_id: str,
    rules: dict[str, Any],
    on_result: Callable[[str, GuardrailResult], None] | None = None,
) -> Callable[[str], GuardrailResult]:
    fail_behavior = rules.get("fail_behavior", "block")

    def guardrail(node_input: str) -> GuardrailResult:
        result = validate_content(str(node_input), rules)
        try:
            result = apply_fail_behavior(result, fail_behavior, node_id)
        except Exception:
            if on_result:
                on_result(node_id, result)
            raise
        if on_result:
            on_result(node_id, result)
        return result

    guardrail.__name__ = f"guardrail_{node_id}"
    return guardrail


def compile_workflow(
    graph_json: dict,
    on_guardrail_result: Callable[[str, GuardrailResult], None] | None = None,
    on_eval_result: Callable[[str, EvalScores], None] | None = None,
) -> tuple[Workflow, dict[str, dict]]:
    nodes: list[dict] = graph_json.get("nodes", [])
    edges: list[dict] = graph_json.get("edges", [])

    if not nodes:
        raise ValueError("Workflow must contain at least one node.")

    node_map = {n["id"]: n for n in nodes}
    order = topological_sort(nodes, edges)

    adk_nodes: list[Any] = []
    metadata: dict[str, dict] = {}

    for node_id in order:
        node = node_map[node_id]
        data = _node_data(node)
        node_type = data.get("nodeType", "agent")
        label = data.get("label", node_type)
        adk_name = f"{node_type}_{node_id}"
        metadata[node_id] = {"type": node_type, "label": label, "adk_name": adk_name}

        if node_type == "agent":
            instruction = data.get(
                "instruction",
                "You are a helpful AI assistant. Respond clearly and concisely to the user input.",
            )
            adk_name = f"agent_{node_id}"
            metadata[node_id]["adk_name"] = adk_name
            adk_nodes.append(
                Agent(
                    name=adk_name,
                    model=settings.gemini_model,
                    instruction=instruction,
                    output_schema=str,
                )
            )

        elif node_type == "tool":
            tool_kind = data.get("toolType", "calculator")
            if tool_kind == "calculator":
                adk_name = f"calculator_{node_id}"
                metadata[node_id]["adk_name"] = adk_name
                adk_nodes.append(_make_calculator_fn(node_id))
            else:
                provider = data.get("searchProvider", "google")
                metadata[node_id]["searchProvider"] = provider
                adk_name = f"search_{node_id}"
                metadata[node_id]["adk_name"] = adk_name
                if provider == "google":
                    adk_nodes.append(
                        Agent(
                            name=adk_name,
                            model=settings.gemini_model,
                            instruction=(
                                "Search for information about the user's query and return a concise, "
                                "factual summary with key findings. Return only the summary."
                            ),
                            tools=[google_search],
                            output_schema=str,
                        )
                    )
                else:
                    adk_nodes.append(_make_search_fn(node_id, provider))

        elif node_type == "evaluation":
            preset = data.get("evalPreset")
            criteria = data.get("criteria")
            adk_name = f"eval_{node_id}"
            metadata[node_id]["adk_name"] = adk_name
            metadata[node_id]["eval_preset"] = preset
            adk_nodes.append(
                Agent(
                    name=adk_name,
                    model=settings.gemini_model,
                    instruction=build_eval_instruction(preset, criteria),
                    output_schema=EvalScores,
                )
            )
            metadata[node_id]["is_evaluation"] = True

        elif node_type == "guardrail":
            rules = data.get("rules", {})
            adk_name = f"guardrail_{node_id}"
            metadata[node_id]["adk_name"] = adk_name
            metadata[node_id]["guardrail_mode"] = rules.get("mode", "output")
            metadata[node_id]["fail_behavior"] = rules.get("fail_behavior", "block")
            adk_nodes.append(_make_guardrail_fn(node_id, rules, on_guardrail_result))
            metadata[node_id]["is_guardrail"] = True

        else:
            raise ValueError(f"Unsupported node type: {node_type}")

    workflow = Workflow(
        name="aegis_workflow",
        edges=[("START", *adk_nodes)],
    )
    return workflow, metadata