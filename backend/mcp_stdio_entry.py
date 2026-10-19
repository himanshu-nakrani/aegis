"""Stdio MCP bridge: expose a deployed Aegis workflow as an MCP tool.

For MCP clients that only speak stdio (e.g. Claude Desktop), this script wraps
one Aegis deployment — discovered over HTTP — in a minimal low-level MCP
server. The hosted Streamable-HTTP transport lives at ``{API}/mcp``; this is
the same surface over stdio.

Environment:
    AEGIS_API_URL        e.g. http://127.0.0.1:8000
    AEGIS_DEPLOYMENT_ID  deployment id from the Deploy sheet
    AEGIS_VERSION_ID     pinned version id (optional — taken from the
                         deployment descriptor when unset)
    AEGIS_INVOKE_KEY     scoped invoke key

Run:  python mcp_stdio_entry.py            (serve over stdio)
      python mcp_stdio_entry.py --check    (print the resolved tool and exit)
      python mcp_stdio_entry.py --help
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from typing import Any

import httpx
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server
from mcp.shared.exceptions import McpError

logger = logging.getLogger("aegis.mcp.stdio")

# Server-side invoke waits at most 90s before returning a "running" status
# (see app/api/platform.py invoke_workflow and invoke_runner.invoke_and_wait).
# Keep the read window a bit beyond that so a legitimately waited run reaches
# us; the response is always a JSON object, never a stream.
INVOKE_WAIT_TIMEOUT = httpx.Timeout(100.0, connect=10.0)
DESCRIPTOR_TIMEOUT = httpx.Timeout(15.0)


def _env(name: str, *, required: bool = True) -> str | None:
    value = os.environ.get(name, "").strip()
    if required and not value:
        raise SystemExit(f"{name} is required (see this file's docstring)")
    return value or None


def _deployment_headers(deployment_id: str, version_id: str, invoke_key: str) -> dict[str, str]:
    return {
        "X-Aegis-Deployment-ID": deployment_id,
        "X-Aegis-Version-ID": version_id,
        "X-Aegis-Invoke-Key": invoke_key,
    }


async def fetch_tool_descriptor(
    api_url: str, deployment_id: str, invoke_key: str, *, http_client: httpx.AsyncClient | None = None
) -> dict[str, Any]:
    """Resolve this deployment's pinned tool descriptor over HTTP.

    Uses ``GET /v1/deployments/{id}/descriptor`` — invoke-key-only auth, no
    account key — so the stdio bridge needs nothing more than the deployment
    credentials it already has.
    """
    url = f"{api_url.rstrip('/')}/v1/deployments/{deployment_id}/descriptor"
    headers = {"X-Aegis-Invoke-Key": invoke_key}

    async def _get(client: httpx.AsyncClient) -> dict[str, Any]:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()

    if http_client is not None:
        return await _get(http_client)
    async with httpx.AsyncClient(timeout=DESCRIPTOR_TIMEOUT) as client:
        return await _get(client)


def _args_to_invoke_body(arguments: dict[str, Any]) -> dict[str, Any]:
    """Tool arguments → invoke payload, mirroring mcp_server._args_to_payload."""
    reserved = {"input", "session_id", "tags"}
    rest = {k: v for k, v in arguments.items() if k not in reserved}
    if rest:
        input_text = json.dumps(rest)
    else:
        value = arguments.get("input")
        input_text = value if isinstance(value, str) else json.dumps(value or "")
    body: dict[str, Any] = {"input": input_text}
    if arguments.get("session_id"):
        body["session_id"] = arguments["session_id"]
    if arguments.get("tags"):
        body["tags"] = arguments["tags"]
    return body


def build_stdio_server(
    *,
    api_url: str,
    deployment_id: str,
    version_id: str | None,
    invoke_key: str,
    descriptor: dict[str, Any],
    http_client: httpx.AsyncClient | None = None,
) -> Server:
    """Build a stdio Server exposing the deployment's pinned workflow tool.

    The tool's name/description/input schema come from the deployment
    descriptor; ``tools/call`` POSTs to ``/v1/workflows/{id}/invoke?wait=true``
    and returns the run's final output as text content.
    """
    tool_name = descriptor["tool_name"]
    invoke_url = f"{api_url.rstrip('/')}/v1/workflows/{descriptor['workflow_id']}/invoke?wait=true"
    headers = _deployment_headers(deployment_id, version_id or descriptor["version_id"], invoke_key)

    server = Server(name="aegis")

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name=tool_name,
                description=descriptor.get("description")
                or f"Invoke the '{descriptor.get('workflow_name', 'workflow')}' Aegis workflow.",
                inputSchema=descriptor["input_schema"],
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]):
        if name != tool_name:
            raise McpError(
                types.ErrorData(code=types.INVALID_PARAMS, message=f"Unknown tool: {name}")
            )
        body = _args_to_invoke_body(arguments or {})
        if not body["input"].strip():
            raise McpError(
                types.ErrorData(
                    code=types.INVALID_PARAMS,
                    message=f"Tool '{name}' requires a non-empty input",
                )
            )
        try:
            if http_client is not None:
                response = await http_client.post(invoke_url, json=body, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=INVOKE_WAIT_TIMEOUT) as client:
                    response = await client.post(invoke_url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise McpError(
                types.ErrorData(
                    code=types.INTERNAL_ERROR, message=f"Invoke request failed: {exc}"
                )
            ) from exc
        if response.status_code != 200:
            raise McpError(
                types.ErrorData(
                    code=types.INTERNAL_ERROR,
                    message=f"Invoke rejected ({response.status_code}): {response.text[:500]}",
                )
            )
        result = response.json()
        output = result.get("output")
        text = (
            output
            if isinstance(output, str) and output
            else f"Aegis run {result.get('run_id')} finished with status '{result.get('status')}'."
        )
        structured = {
            "run_id": result.get("run_id"),
            "status": result.get("status"),
            "output": output,
            "eval_aggregate": result.get("eval_aggregate"),
            "total_cost_usd": result.get("total_cost_usd"),
            "latency_ms": result.get("latency_ms"),
        }
        return [types.TextContent(type="text", text=text)], structured

    return server


async def run_stdio(check_only: bool = False) -> None:
    api_url = _env("AEGIS_API_URL")
    deployment_id = _env("AEGIS_DEPLOYMENT_ID")
    invoke_key = _env("AEGIS_INVOKE_KEY")
    version_id = _env("AEGIS_VERSION_ID", required=False)

    descriptor = await fetch_tool_descriptor(api_url, deployment_id, invoke_key)
    if check_only:
        print(json.dumps(descriptor, indent=2))
        return

    server = build_stdio_server(
        api_url=api_url,
        deployment_id=deployment_id,
        version_id=version_id,
        invoke_key=invoke_key,
        descriptor=descriptor,
    )
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mcp_stdio_entry",
        description="Expose a deployed Aegis workflow as an MCP tool over stdio.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Print the resolved tool descriptor and exit (no stdio serve).",
    )
    args = parser.parse_args()
    try:
        asyncio.run(run_stdio(check_only=args.check))
    except httpx.HTTPError as exc:
        raise SystemExit(f"Failed to reach Aegis API: {exc}") from exc


if __name__ == "__main__":
    main()
