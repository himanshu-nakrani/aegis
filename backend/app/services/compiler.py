from __future__ import annotations

import ast
import operator
import re
from collections import defaultdict, deque
from typing import Any, Callable

from google.adk import Agent, Workflow
from google.adk.tools.google_search_tool import google_search
from pydantic import BaseModel, Field

from app.config import settings
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


class EvalScores(BaseModel):
    faithfulness: int = Field(ge=1, le=5)
    helpfulness: int = Field(ge=1, le=5)
    reasoning: str = ""


class GuardrailResult(BaseModel):
    passed: bool
    message: str


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
    blocked_keywords = [k.lower() for k in rules.get("blocked_keywords", []) if k]
    pattern = rules.get("pattern", "")
    regex = re.compile(pattern) if pattern else None

    def guardrail(node_input: str) -> GuardrailResult:
        text = str(node_input)
        lowered = text.lower()

        for keyword in blocked_keywords:
            if keyword in lowered:
                result = GuardrailResult(passed=False, message=f"Blocked keyword detected: {keyword}")
                if on_result:
                    on_result(node_id, result)
                return result

        if regex and not regex.search(text):
            result = GuardrailResult(passed=False, message=f"Text did not match required pattern: {pattern}")
            if on_result:
                on_result(node_id, result)
            return result

        result = GuardrailResult(passed=True, message="Guardrail passed")
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
        metadata[node_id] = {"type": node_type, "label": label}

        if node_type == "agent":
            instruction = data.get(
                "instruction",
                "You are a helpful AI assistant. Respond clearly and concisely to the user input.",
            )
            agent = Agent(
                name=f"agent_{node_id}",
                model=settings.gemini_model,
                instruction=instruction,
                output_schema=str,
            )
            adk_nodes.append(agent)

        elif node_type == "tool":
            tool_kind = data.get("toolType", "calculator")
            if tool_kind == "calculator":
                adk_nodes.append(_make_calculator_fn(node_id))
            else:
                provider = data.get("searchProvider", "google")
                metadata[node_id]["searchProvider"] = provider
                if provider == "google":
                    search_agent = Agent(
                        name=f"search_{node_id}",
                        model=settings.gemini_model,
                        instruction=(
                            "Search for information about the user's query and return a concise, "
                            "factual summary with key findings. Return only the summary."
                        ),
                        tools=[google_search],
                        output_schema=str,
                    )
                    adk_nodes.append(search_agent)
                else:
                    adk_nodes.append(_make_search_fn(node_id, provider))

        elif node_type == "evaluation":
            criteria = data.get("criteria", "faithfulness and helpfulness")
            eval_agent = Agent(
                name=f"eval_{node_id}",
                model=settings.gemini_model,
                instruction=(
                    f"Evaluate the following content on {criteria}. "
                    "Score faithfulness and helpfulness from 1-5 and explain your reasoning briefly."
                ),
                output_schema=EvalScores,
            )
            adk_nodes.append(eval_agent)
            metadata[node_id]["is_evaluation"] = True

        elif node_type == "guardrail":
            rules = data.get("rules", {})
            adk_nodes.append(_make_guardrail_fn(node_id, rules, on_guardrail_result))
            metadata[node_id]["is_guardrail"] = True

        else:
            raise ValueError(f"Unsupported node type: {node_type}")

    workflow = Workflow(
        name="aegis_workflow",
        edges=[("START", *adk_nodes)],
    )
    return workflow, metadata