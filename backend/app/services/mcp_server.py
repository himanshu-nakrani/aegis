"""Aegis as an MCP server: published workflows exposed as invoke tools.

One low-level ``mcp.server.Server`` serves every tool dynamically — tools are
resolved per request from ``models.Workflow.published_version_id`` so publish /
rollback take effect immediately, with no restart.

Transport: stateless Streamable HTTP mounted at ``/mcp``. ``mcp_asgi_app``
creates a fresh ``StreamableHTTPServerTransport`` per POST — mirroring the
SDK's own ``_handle_stateless_request`` — instead of sharing a
``StreamableHTTPSessionManager`` task group, which must live inside a single
running event loop and cannot be driven by FastAPI's lifespan when mounted.

Auth: MCP has no per-tool credentials, so the deployment-scoped invoke headers
(X-Aegis-Deployment-ID / X-Aegis-Version-ID / X-Aegis-Invoke-Key) travel on the
HTTP request itself. ``tools/call`` without them is rejected with a JSON-RPC
error before a transport (or run) is ever created; credential *validity* is
enforced by ``deployments.authenticate_invoke`` inside ``create_invoked_run``,
the same code path as POST /v1/workflows/{id}/invoke.
"""

from __future__ import annotations

import asyncio
import json
import logging
from http import HTTPStatus
from typing import Any
from uuid import UUID

import anyio

from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http import StreamableHTTPServerTransport
from mcp.shared.exceptions import McpError
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.db import models
from app.db.database import SessionLocal
from app.services.deploy_descriptor import _sanitize_tool_name, build_mcp_input_schema
from app.services.invoke_runner import InvokeRequestData, invoke_and_wait

logger = logging.getLogger("aegis.mcp")

MCP_PATH = "/mcp"

server: Server = Server(name="aegis")


def _deployment_auth_missing(headers: dict[str, str]) -> str | None:
    """Return which required deployment header is absent, if any."""
    if not headers.get("x-aegis-deployment-id") or not headers.get("x-aegis-version-id"):
        return "X-Aegis-Deployment-ID and X-Aegis-Version-ID are required"
    if not (headers.get("x-aegis-invoke-key") or headers.get("x-aegis-signature")):
        return "X-Aegis-Invoke-Key (or webhook signature headers) required"
    return None


def _load_published_tools() -> list[tuple[types.Tool, UUID]]:
    """One tool per published workflow, resolved fresh from the DB.

    Blocking ORM work — callers run it via ``asyncio.to_thread``. Names are
    unique-suffixed on collision so two same-named workflows can't shadow each
    other.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(
                models.Workflow.id,
                models.Workflow.name,
                models.Workflow.description,
                models.WorkflowVersion.graph_json,
            )
            .join(
                models.WorkflowVersion,
                models.WorkflowVersion.id == models.Workflow.published_version_id,
            )
            .filter(models.Workflow.published_version_id.isnot(None))
            .all()
        )
    finally:
        db.close()

    tools: list[tuple[types.Tool, UUID]] = []
    seen: set[str] = set()
    for workflow_id, name, description, graph_json in rows:
        base = f"invoke_{_sanitize_tool_name(name)}"[:128]
        tool_name = base
        while tool_name in seen:
            suffix = f"_{str(workflow_id)[:8]}"
            tool_name = f"{base[: 128 - len(suffix)]}{suffix}"
        seen.add(tool_name)
        tools.append(
            (
                types.Tool(
                    name=tool_name,
                    description=(
                        description or f"Invoke the '{name}' Aegis workflow."
                    ).strip(),
                    inputSchema=build_mcp_input_schema(graph_json),
                ),
                workflow_id,
            )
        )
    return tools


def _request_headers() -> dict[str, str]:
    """Headers of the HTTP request currently being served (empty off-HTTP)."""
    try:
        ctx = server.request_context
    except LookupError:
        return {}
    request = getattr(ctx, "request", None)
    if request is None:
        return {}
    return dict(request.headers)


def _args_to_payload(args: dict[str, Any]) -> InvokeRequestData:
    """Map tool arguments to the invoke payload.

    Reserved keys (``input``/``session_id``/``tags``) map directly; every other
    argument is serialized JSON so input_schema workflows receive the same
    ``{"field": value}`` string the /invoke surface expects.
    """
    reserved = {"input", "session_id", "tags"}
    rest = {k: v for k, v in args.items() if k not in reserved}
    if rest:
        input_text = json.dumps(rest)
    elif "input" in args:
        value = args["input"]
        input_text = value if isinstance(value, str) else json.dumps(value)
    else:
        input_text = ""
    return InvokeRequestData(
        input=input_text,
        session_id=args.get("session_id"),
        tags=args.get("tags"),
        version_id=None,
    )


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    tools = await asyncio.to_thread(_load_published_tools)
    return [tool for tool, _workflow_id in tools]


@server.call_tool()
async def call_tool(
    name: str, arguments: dict[str, Any]
) -> tuple[list[types.ContentBlock], dict[str, Any]]:
    headers = _request_headers()
    missing = _deployment_auth_missing(headers)
    if missing:
        raise McpError(types.ErrorData(code=types.INVALID_REQUEST, message=missing))

    tools = await asyncio.to_thread(_load_published_tools)
    index = {tool.name: workflow_id for tool, workflow_id in tools}
    workflow_id = index.get(name)
    if workflow_id is None:
        raise McpError(
            types.ErrorData(code=types.INVALID_PARAMS, message=f"Unknown tool: {name}")
        )

    payload = _args_to_payload(arguments or {})
    if not payload.input.strip():
        raise McpError(
            types.ErrorData(
                code=types.INVALID_PARAMS,
                message=f"Tool '{name}' requires a non-empty input",
            )
        )

    db = SessionLocal()
    try:
        try:
            result = await invoke_and_wait(
                db,
                workflow_id,
                payload,
                headers,
                b"",
                MCP_PATH,
            )
        finally:
            db.close()
    except HTTPException as exc:
        raise McpError(
            types.ErrorData(
                code=types.INTERNAL_ERROR,
                message=f"Invoke rejected ({exc.status_code}): {exc.detail}",
            )
        ) from exc

    output = result.get("output")
    text = output if isinstance(output, str) and output else f"Aegis run {result['run_id']} finished with status '{result.get('status')}'."
    structured = {
        "run_id": result["run_id"],
        "status": result.get("status"),
        "output": output,
        "eval_aggregate": result.get("eval_aggregate"),
        "total_cost_usd": result.get("total_cost_usd"),
        "latency_ms": result.get("latency_ms"),
    }
    return [types.TextContent(type="text", text=text)], structured


# --------------------------------------------------------------------------- #
# Stateless Streamable-HTTP ASGI app (mounted at /mcp by app.api.mcp)
# --------------------------------------------------------------------------- #


def _json_rpc_error(message: str, *, status: int, code: int | None = None) -> Response:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": None, "error": {"message": message}}
    if code is not None:
        body["error"]["code"] = code
    return JSONResponse(body, status_code=status)


def _replay_receive(body: bytes) -> Receive:
    """A receive channel that replays an already-read body then ends."""
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        await anyio.sleep_forever()
        return {}  # unreachable

    return receive


async def _handle_post(scope: Scope, receive: Receive, send: Send) -> None:
    """One stateless transport per POST — the SDK's ``_handle_stateless_request``.

    Deployment auth is enforced before a transport (and therefore a run) is
    created: every JSON-RPC ``tools/call`` in the body must carry the
    X-Aegis-* deployment headers. Malformed bodies defer to the transport,
    which produces its own protocol errors.
    """
    request = Request(scope, receive)
    body = await request.body()

    requires_auth = False
    try:
        parsed = json.loads(body) if body else None
        messages = parsed if isinstance(parsed, list) else [parsed]
        requires_auth = any(
            isinstance(m, dict) and m.get("method") == "tools/call" for m in messages
        )
    except json.JSONDecodeError:
        requires_auth = False

    if requires_auth:
        missing = _deployment_auth_missing(dict(request.headers))
        if missing:
            await _json_rpc_error(
                f"Unauthorized: {missing}",
                status=HTTPStatus.UNAUTHORIZED,
                code=types.INVALID_REQUEST,
            )(scope, _replay_receive(body), send)
            return

    transport = StreamableHTTPServerTransport(
        mcp_session_id=None,
        is_json_response_enabled=True,
        event_store=None,
        security_settings=None,
    )

    async def run_server(*, task_status: Any = anyio.TASK_STATUS_IGNORED) -> None:
        async with transport.connect() as (read_stream, write_stream):
            task_status.started()
            try:
                await server.run(
                    read_stream,
                    write_stream,
                    server.create_initialization_options(),
                    stateless=True,
                )
            except Exception:  # pragma: no cover — mirrors the SDK's logging
                logger.exception("Stateless MCP session crashed")

    replay = _replay_receive(body)
    async with anyio.create_task_group() as tg:
        await tg.start(run_server)
        await transport.handle_request(scope, replay, send)
        with anyio.CancelScope(shield=True):
            await transport.terminate()


async def mcp_asgi_app(scope: Scope, receive: Receive, send: Send) -> None:
    """ASGI entry mounted at /mcp: JSON-RPC POSTs only, stateless."""
    if scope["type"] != "http":
        return
    path = scope.get("path", "/mcp")
    method = scope.get("method", "")
    if path not in {"/mcp", "/mcp/"}:
        await _json_rpc_error("Not Found", status=HTTPStatus.NOT_FOUND)(scope, receive, send)
        return
    if method == "POST":
        await _handle_post(scope, receive, send)
        return
    await _json_rpc_error(
        "Method Not Allowed: the MCP endpoint accepts POST only",
        status=HTTPStatus.METHOD_NOT_ALLOWED,
    )(scope, receive, send)
