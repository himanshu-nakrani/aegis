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
import contextvars
import hashlib
import hmac
import json
import logging
import re
import time
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

# Exact JSON-RPC body bytes of the POST currently being served, captured in
# ``_handle_post`` before the transport consumes them. A ``ContextVar`` (not a
# module global) so concurrent stateless POSTs can't cross-contaminate —
# ``transport.handle_request`` runs its task group inside this task's context.
_request_body: contextvars.ContextVar[bytes] = contextvars.ContextVar("aegis_mcp_body", default=b"")


WEBHOOK_WINDOW_SECONDS = 300


def _verify_signature_body_binding(
    headers: dict[str, str], raw_body: bytes
) -> tuple[UUID, UUID]:
    """Verify the webhook HMAC leg over the exact JSON-RPC body bytes.

    Mirrors ``deployments.authenticate_invoke``'s signature branch (same
    ``POST\\n{path}\\n{deployment}\\n{version}\\n{ts}\\n{nonce}\\n`` + ``raw_body``
    construction, timestamp window, nonce shape) but resolves the deployment
    from the ``X-Aegis-Deployment-ID`` header instead of the workflow id —
    the MCP server authenticates deployment-first. Read-only: unlike the run
    path it consumes no nonce receipt, so the same request can be verified
    at the gate, in ``list_tools`` and in ``call_tool`` without false
    replay rejections. Returns ``(deployment_id, version_id)``; raises
    ``HTTPException`` (401) on any failure.
    """
    try:
        deployment_id = UUID(headers.get("x-aegis-deployment-id", ""))
        version_id = UUID(headers.get("x-aegis-version-id", ""))
    except ValueError:
        raise HTTPException(status_code=401, detail="Deployment and version headers are required") from None
    timestamp = headers.get("x-aegis-timestamp", "")
    nonce = headers.get("x-aegis-nonce", "")
    signature = headers.get("x-aegis-signature", "")
    if not timestamp.isascii() or not timestamp.isdecimal() or len(timestamp) > 12:
        raise HTTPException(status_code=401, detail="Invalid webhook timestamp")
    if abs(time.time() - int(timestamp)) > WEBHOOK_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Expired webhook timestamp")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", nonce):
        raise HTTPException(status_code=401, detail="Invalid webhook nonce")
    db = SessionLocal()
    try:
        deployment = (
            db.query(models.WorkflowDeployment)
            .filter(models.WorkflowDeployment.id == deployment_id)
            .first()
        )
        if deployment is None or deployment.version_id != version_id:
            raise HTTPException(status_code=401, detail="Invalid deployment target")
        from app.services.crypto import DecryptionError, decrypt_value, is_encrypted

        encrypted = deployment.webhook_secret_encrypted
        if not encrypted or not is_encrypted(encrypted):
            raise HTTPException(status_code=401, detail="Invalid deployment credentials")
        try:
            secret = decrypt_value(encrypted)
        except DecryptionError:
            raise HTTPException(status_code=401, detail="Webhook secret unavailable") from None
        signed = (
            f"POST\n{MCP_PATH}\n{deployment.id}\n{deployment.version_id}\n{timestamp}\n{nonce}\n".encode()
            + raw_body
        )
        expected = "sha256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        if not re.fullmatch(r"sha256=[a-f0-9]{64}", signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        return deployment.id, deployment.version_id
    finally:
        db.close()


def _verify_invoke_key(headers: dict[str, str]) -> tuple[UUID, UUID]:
    """Verify the invoke-key leg against the header-pinned deployment."""
    try:
        deployment_id = UUID(headers.get("x-aegis-deployment-id", ""))
        version_id = UUID(headers.get("x-aegis-version-id", ""))
    except ValueError:
        raise HTTPException(status_code=401, detail="Deployment and version headers are required") from None
    key = headers.get("x-aegis-invoke-key", "")
    digest = hashlib.sha256(key.encode()).hexdigest()
    db = SessionLocal()
    try:
        deployment = (
            db.query(models.WorkflowDeployment)
            .filter(models.WorkflowDeployment.id == deployment_id)
            .first()
        )
        if (
            deployment is None
            or deployment.version_id != version_id
            or not deployment.invoke_key_hash
            or not hmac.compare_digest(digest, deployment.invoke_key_hash)
        ):
            raise HTTPException(status_code=401, detail="Invalid deployment credentials")
        return deployment.id, deployment.version_id
    finally:
        db.close()


def _authenticate_deployment_headers(
    headers: dict[str, str], raw_body: bytes
) -> tuple[UUID, UUID]:
    """Authenticate the caller's deployment headers; return (deployment, version).

    Invoke-key leg is a pure digest check. Signature leg is verified over the
    exact ``raw_body`` bytes each call — verification is read-only here (no
    nonce receipt consumed), so ``_handle_post``, ``list_tools`` and
    ``call_tool`` can each verify the same request independently; the run
    path's own ``authenticate_invoke`` still consumes the nonce exactly once.
    """
    if headers.get("x-aegis-invoke-key"):
        return _verify_invoke_key(headers)
    return _verify_signature_body_binding(headers, raw_body)


def _load_published_tools(
    deployment_id: UUID | None = None,
) -> list[tuple[types.Tool, UUID]]:
    """One tool per published workflow, resolved fresh from the DB.

    Blocking ORM work — callers run it via ``asyncio.to_thread``. Names are
    unique-suffixed on collision so two same-named workflows can't shadow each
    other.

    When ``deployment_id`` is given, discovery is scoped to that deployment's
    workflow only — a deployment key must never enumerate the account-wide
    catalog. ``None`` preserves the legacy unscoped listing for non-HTTP
    (stdio/off-transport) callers that have no deployment headers.
    """
    db = SessionLocal()
    try:
        query = (
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
        )
        if deployment_id is not None:
            query = query.join(
                models.WorkflowDeployment,
                models.WorkflowDeployment.workflow_id == models.Workflow.id,
            ).filter(models.WorkflowDeployment.id == deployment_id)
        rows = query.all()
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


_MCP_MAX_INPUT_CHARS = 20_000
_MCP_MAX_TAGS = 32
_MCP_MAX_TAG_CHARS = 64


def _args_to_payload(args: dict[str, Any]) -> InvokeRequestData:
    """Map tool arguments to the invoke payload.

    Reserved keys (``input``/``session_id``/``tags``) map directly; every other
    argument is serialized JSON so input_schema workflows receive the same
    ``{"field": value}`` string the /invoke surface expects. Bounds mirror
    ``platform.InvokePayload`` (input 20k, session_id 128) — without them an
    MCP caller bypasses the HTTP limits (unbounded session_id persisted to the
    row, arbitrary tags shapes, multi-MB input bloating context).
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
    if len(input_text) > _MCP_MAX_INPUT_CHARS:
        raise McpError(
            types.ErrorData(
                code=types.INVALID_PARAMS,
                message=f"input exceeds {_MCP_MAX_INPUT_CHARS} characters",
            )
        )
    raw_session = args.get("session_id")
    session_id: str | None = None
    if raw_session is not None:
        if not isinstance(raw_session, str):
            raise McpError(
                types.ErrorData(code=types.INVALID_PARAMS, message="session_id must be a string")
            )
        session_id = raw_session.strip() or None
        if session_id is not None and len(session_id) > 128:
            raise McpError(
                types.ErrorData(code=types.INVALID_PARAMS, message="session_id exceeds 128 characters")
            )
    raw_tags = args.get("tags")
    tags: list[str] | None = None
    if raw_tags is not None:
        if not isinstance(raw_tags, list) or not all(isinstance(t, str) for t in raw_tags):
            raise McpError(
                types.ErrorData(code=types.INVALID_PARAMS, message="tags must be a list of strings")
            )
        tags = [t.strip() for t in raw_tags if t.strip()][: _MCP_MAX_TAGS]
        tags = [t[:_MCP_MAX_TAG_CHARS] for t in tags] or None
    return InvokeRequestData(
        input=input_text,
        session_id=session_id,
        tags=tags,
        version_id=None,
    )


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    # Deployment-scoped discovery: only the workflow covered by the caller's
    # deployment credential is listed — never the account-wide catalog.
    # Missing/invalid credentials fail closed; off-HTTP callers with no
    # headers keep the legacy full listing.
    headers = _request_headers()
    raw_body = _request_body.get()
    if not headers:
        tools = await asyncio.to_thread(_load_published_tools, None)
        return [tool for tool, _workflow_id in tools]
    missing = _deployment_auth_missing(headers)
    if missing:
        raise McpError(types.ErrorData(code=-32000, message=f"Unauthorized: {missing}"))
    try:
        deployment_id, _version_id = await asyncio.to_thread(
            _authenticate_deployment_headers, headers, raw_body
        )
    except HTTPException as exc:
        raise McpError(
            types.ErrorData(code=-32000, message=f"Unauthorized: {exc.detail}")
        ) from exc
    tools = await asyncio.to_thread(_load_published_tools, deployment_id)
    return [tool for tool, _workflow_id in tools]


@server.call_tool()
async def call_tool(
    name: str, arguments: dict[str, Any]
) -> tuple[list[types.ContentBlock], dict[str, Any]]:
    headers = _request_headers()
    missing = _deployment_auth_missing(headers)
    if missing:
        raise McpError(types.ErrorData(code=types.INVALID_REQUEST, message=missing))
    raw_body = _request_body.get()

    # Bind the call to the caller's deployment: authenticate the headers now
    # against the exact received JSON-RPC body bytes (signature leg), and
    # restrict the tool lookup to the deployment's own workflow. The
    # signature is verified here — not deferred to invoke — so a signature
    # over an empty body can never authorize a call carrying arguments.
    try:
        deployment_id, _version_id = await asyncio.to_thread(
            _authenticate_deployment_headers, headers, raw_body
        )
    except HTTPException as exc:
        raise McpError(
            types.ErrorData(
                code=types.INTERNAL_ERROR,
                message=f"Invoke rejected ({exc.status_code}): {exc.detail}",
            )
        ) from exc

    tools = await asyncio.to_thread(_load_published_tools, deployment_id)
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
                raw_body,
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
    created: every JSON-RPC ``tools/list`` or ``tools/call`` in the body must
    carry valid X-Aegis-* deployment headers. For the signature leg the HMAC
    is verified here over the exact received body bytes, so an empty-body
    signature can never authorize a call carrying arguments. Malformed bodies
    defer to the transport, which produces its own protocol errors. The exact
    body bytes are stashed in ``_request_body`` so ``call_tool`` reuses the
    identical bytes for the invoke-path check.
    """
    request = Request(scope, receive)
    body = await request.body()

    requires_auth = False
    try:
        parsed = json.loads(body) if body else None
        messages = parsed if isinstance(parsed, list) else [parsed]
        requires_auth = any(
            isinstance(m, dict) and m.get("method") in {"tools/call", "tools/list"}
            for m in messages
        )
    except json.JSONDecodeError:
        requires_auth = False

    if requires_auth:
        headers = dict(request.headers)
        missing = _deployment_auth_missing(headers)
        if missing:
            await _json_rpc_error(
                f"Unauthorized: {missing}",
                status=HTTPStatus.UNAUTHORIZED,
                code=types.INVALID_REQUEST,
            )(scope, _replay_receive(body), send)
            return
        try:
            await asyncio.to_thread(_authenticate_deployment_headers, headers, body)
        except HTTPException as exc:
            await _json_rpc_error(
                f"Unauthorized: {exc.detail}",
                status=HTTPStatus(exc.status_code),
                code=types.INVALID_REQUEST,
            )(scope, _replay_receive(body), send)
            return

    token_body = _request_body.set(body)
    try:
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
    finally:
        _request_body.reset(token_body)


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
