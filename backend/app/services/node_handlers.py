from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable

from app.http_client import get_http_client
from app.services.url_safety import validate_http_url

MAX_DELAY_SECONDS = 30
MAX_HTTP_RESPONSE_CHARS = 50_000


def _make_transform_fn(node_id: str, template: str, adk_name: str) -> Callable[[str], str]:
    tpl = template or "{{input}}"

    def transform(node_input: str) -> str:
        return tpl.replace("{{input}}", str(node_input))

    transform.__name__ = adk_name
    return transform


def _make_json_parse_fn(node_id: str, json_path: str | None, adk_name: str) -> Callable[[str], str]:
    def json_parse(node_input: str) -> str:
        text = str(node_input).strip()
        parsed: Any = None

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
            if match:
                try:
                    parsed = json.loads(match.group())
                except json.JSONDecodeError:
                    return "JSON parse error: no valid JSON found in input"
            else:
                return "JSON parse error: no valid JSON found in input"

        if json_path:
            current = parsed
            for key in json_path.split("."):
                if isinstance(current, dict) and key in current:
                    current = current[key]
                else:
                    return f"JSON path '{json_path}' not found"
            return json.dumps(current) if not isinstance(current, str) else current

        return json.dumps(parsed, indent=2) if isinstance(parsed, (dict, list)) else str(parsed)

    json_parse.__name__ = adk_name
    return json_parse


def _make_delay_fn(node_id: str, seconds: float, adk_name: str) -> Callable[[str], Any]:
    delay_secs = max(0.0, min(float(seconds or 1), MAX_DELAY_SECONDS))

    async def delay(node_input: str) -> str:
        await asyncio.sleep(delay_secs)
        return str(node_input)

    delay.__name__ = adk_name
    return delay


def _make_http_fn(
    node_id: str,
    method: str,
    url: str,
    headers: dict[str, str],
    body_template: str | None,
    adk_name: str,
) -> Callable[[str], Any]:
    http_method = (method or "GET").upper()
    target_url = url or "https://httpbin.org/get"

    async def http_request(node_input: str) -> str:
        body = None
        if body_template:
            body = body_template.replace("{{input}}", str(node_input))
        elif http_method in {"POST", "PUT", "PATCH"}:
            body = str(node_input)

        try:
            safe_url = validate_http_url(target_url)
            client = get_http_client()
            response = await client.request(
                http_method,
                safe_url,
                headers=headers or None,
                content=body.encode() if body else None,
                follow_redirects=True,
            )
            text = response.text[:MAX_HTTP_RESPONSE_CHARS]
            return f"HTTP {response.status_code}\n{text}"
        except ValueError as exc:
            return f"HTTP error: {exc}"
        except Exception as exc:
            return f"HTTP error: {exc}"

    http_request.__name__ = adk_name
    return http_request


def is_annotation_node(node_type: str | None) -> bool:
    return node_type == "note"


def filter_executable_graph(graph_json: dict) -> dict:
    """Strip annotation nodes and dangling edges for compilation/validation."""
    nodes = graph_json.get("nodes", [])
    executable_ids = {
        n["id"] for n in nodes if not is_annotation_node(_node_data(n).get("nodeType"))
    }
    filtered_nodes = [n for n in nodes if n["id"] in executable_ids]
    filtered_edges = [
        e
        for e in graph_json.get("edges", [])
        if e.get("source") in executable_ids and e.get("target") in executable_ids
    ]
    return {"nodes": filtered_nodes, "edges": filtered_edges}


def _node_data(node: dict) -> dict:
    return node.get("data", {}) or {}