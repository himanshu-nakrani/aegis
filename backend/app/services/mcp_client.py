"""Credential-scoped MCP v1 sessions; no live sessions or secrets are cached globally."""
from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
from re import _constants as regex_ops, _parser as regex_parser
import socket
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import anyio
import httpx
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError
from referencing import Registry
from referencing.exceptions import Unresolvable
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import PaginatedRequestParams
from pydantic import ValidationError as ConfigValidationError

from app.config import settings
from app.schemas.credential import mcp_config_adapter
from app.services.crypto import encryption_enabled, is_encrypted
from app.services.url_safety import resolve_public_ip
from app.services.regex_safety import validate_safe_regex

MAX_TOOLS = 256
MAX_SCHEMA_BYTES = 65536
MAX_MESSAGE_BYTES = 1048576
MAX_JSON_DEPTH = 32


class MCPClientError(ValueError):
    """Safe, user-visible MCP configuration, transport, or protocol error."""


class MCPDisabledError(MCPClientError):
    pass


class MCPTimeoutError(MCPClientError):
    pass


class MCPToolError(MCPClientError):
    def __init__(self, name: str, result: dict[str, Any]):
        super().__init__(f"MCP tool '{name}' reported an error")
        self.result = result


def _allowed_hosts() -> set[str]:
    return {host.strip().lower().rstrip('.') for host in settings.mcp_allowed_hosts.split(',') if host.strip()}


def _parse_endpoint(url: str):
    try:
        parsed = urlparse(url)
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError:
        raise MCPClientError('MCP endpoint has an invalid port') from None
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise MCPClientError('MCP endpoint must be an http:// or https:// URL')
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise MCPClientError('MCP endpoint cannot contain credentials, a query, or a fragment; use headers for authentication')
    return parsed, port


def _resolve_endpoint(url: str) -> str:
    parsed, port = _parse_endpoint(url)
    host = parsed.hostname.lower().rstrip('.')
    if host not in _allowed_hosts():
        try:
            return resolve_public_ip(host, port)
        except ValueError:
            raise MCPClientError('MCP endpoint is not public or cannot be resolved; trusted local servers require an exact MCP_ALLOWED_HOSTS entry') from None
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        try:
            addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise MCPClientError('Allowlisted MCP endpoint cannot be resolved') from None
        if not addresses:
            raise MCPClientError('Allowlisted MCP endpoint cannot be resolved')
        return str(ipaddress.ip_address(addresses[0][4][0]))


def validate_mcp_endpoint(url: str) -> None:
    """Synchronous write-path validation; requests independently revalidate DNS."""
    _resolve_endpoint(url)


def validate_mcp_config(config: dict[str, Any], *, writing: bool = False) -> dict[str, Any]:
    try:
        validated = mcp_config_adapter.validate_python(config).model_dump()
    except ConfigValidationError:
        # Pydantic validation errors include input values: never expose those secrets.
        raise MCPClientError('Invalid MCP config: use stdio command/args/env or streamable_http url/headers with string values') from None
    if validated['transport'] == 'stdio':
        if not settings.mcp_stdio_enabled:
            raise MCPDisabledError('MCP stdio executes host commands and is disabled; an administrator must enable MCP_STDIO_ENABLED')
        secrets = validated['env']
    else:
        _parse_endpoint(validated['url'])
        secrets = validated['headers']
    if writing and any(secrets.values()) and not encryption_enabled():
        raise MCPClientError('MCP env/header secrets require a valid APP_ENCRYPTION_KEY')
    if not writing and any(is_encrypted(value) for value in secrets.values()):
        raise MCPClientError('MCP credential secrets could not be decrypted; check APP_ENCRYPTION_KEY')
    return validated


class _BoundedResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream: httpx.AsyncByteStream):
        self.stream = stream

    async def __aiter__(self):
        size = 0
        async for chunk in self.stream:
            size += len(chunk)
            if size > MAX_MESSAGE_BYTES:
                raise MCPClientError('MCP response exceeds the 1 MiB transport limit')
            yield chunk

    async def aclose(self):
        await self.stream.aclose()


class MCPPinnedTransport(httpx.AsyncBaseTransport):
    """Resolve/revalidate and pin every request, including SDK reconnects and DELETE."""
    def __init__(self, endpoint: str):
        self.endpoint = httpx.URL(endpoint)
        self.transport = httpx.AsyncHTTPTransport(retries=0, limits=httpx.Limits(max_connections=4, max_keepalive_connections=2))

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        origin = (request.url.scheme, request.url.host, request.url.port)
        if origin != (self.endpoint.scheme, self.endpoint.host, self.endpoint.port):
            raise MCPClientError('MCP requests may not leave the configured endpoint origin')
        ip = await asyncio.to_thread(_resolve_endpoint, str(request.url))
        headers = request.headers.copy()
        headers['Host'] = request.url.netloc.decode('ascii')
        headers['Accept-Encoding'] = 'identity'
        extensions = dict(request.extensions)
        extensions['sni_hostname'] = request.url.host
        pinned = httpx.Request(request.method, request.url.copy_with(host=ip), headers=headers, stream=request.stream, extensions=extensions)
        response = await self.transport.handle_async_request(pinned)
        if 300 <= response.status_code < 400:
            await response.aclose()
            raise MCPClientError('MCP endpoint redirects are forbidden; configure the final endpoint URL')
        encoding = response.headers.get('Content-Encoding', 'identity').strip().lower()
        if encoding not in {'', 'identity'}:
            await response.aclose()
            raise MCPClientError('MCP compressed HTTP responses are not supported; use identity encoding')
        response.stream = _BoundedResponseStream(response.stream)
        return response

    async def aclose(self):
        await self.transport.aclose()


def _bounded_json(value: Any, *, limit: int = MAX_MESSAGE_BYTES) -> str:
    def depth(item: Any, level: int):
        if level > MAX_JSON_DEPTH:
            raise MCPClientError('MCP JSON exceeds the nesting limit')
        if isinstance(item, dict):
            for child in item.values():
                depth(child, level + 1)
        elif isinstance(item, list):
            for child in item:
                depth(child, level + 1)
    depth(value, 0)
    try:
        serialized = json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (ValueError, TypeError):
        raise MCPClientError('MCP returned invalid JSON data') from None
    if len(serialized.encode()) > limit:
        raise MCPClientError('MCP JSON exceeds the size limit')
    return serialized


def _validate_mcp_regex(pattern: str) -> None:
    """Admit linear regexes, not arbitrary Python backtracking expressions.

    Fixed atoms/classes/anchors are supported. A single primitive-atom repeat
    is supported only between beginning/end anchors; bounded repeats max 1024.
    No groups, alternatives, lookaround, backreferences, or inline flags.
    """
    message = ('MCP schema regex is outside the supported safe subset: at most 200 characters, '
               'fixed atoms/classes/anchors, or one anchored primitive repetition; no groups, alternation, or backreferences')
    try:
        validate_safe_regex(pattern)
        if '(?' in pattern:
            raise ValueError('inline flags and special groups are unsupported')
        parsed = regex_parser.parse(pattern, 0)
        if parsed.state.flags & ~re.UNICODE:
            raise ValueError('regex flags are unsupported')
        primitive_ops = {regex_ops.LITERAL, regex_ops.NOT_LITERAL, regex_ops.ANY, regex_ops.IN, regex_ops.CATEGORY}
        allowed_anchors = {regex_ops.AT_BEGINNING, regex_ops.AT_BEGINNING_STRING, regex_ops.AT_END, regex_ops.AT_END_STRING}
        repetitions = 0

        def primitive(op, argument):
            if op not in primitive_ops:
                return False
            if op == regex_ops.IN:
                return all(child_op in {regex_ops.NEGATE, regex_ops.LITERAL, regex_ops.RANGE, regex_ops.CATEGORY}
                           for child_op, _ in argument)
            return True

        for op, argument in parsed:
            if primitive(op, argument):
                continue
            if op == regex_ops.AT and argument in allowed_anchors:
                continue
            if op in {regex_ops.MAX_REPEAT, regex_ops.MIN_REPEAT}:
                repetitions += 1
                minimum, maximum, body = argument
                if repetitions > 1 or minimum > 1024 or (maximum != regex_ops.MAXREPEAT and maximum > 1024):
                    raise ValueError('multiple or oversized repetitions')
                if len(body) != 1 or not primitive(*body[0]):
                    raise ValueError('only primitive repetition is supported')
                continue
            raise ValueError('unsupported regex opcode')
        if repetitions and (not parsed or parsed[0][0] != regex_ops.AT
                            or parsed[0][1] not in {regex_ops.AT_BEGINNING, regex_ops.AT_BEGINNING_STRING}
                            or parsed[-1][0] != regex_ops.AT
                            or parsed[-1][1] not in {regex_ops.AT_END, regex_ops.AT_END_STRING}):
            raise ValueError('repetition requires whole-string anchors')
    except (ValueError, re.error, OverflowError):
        raise MCPClientError(message) from None


def validate_mcp_schema(schema: dict[str, Any]) -> None:
    _bounded_json(schema, limit=MAX_SCHEMA_BYTES)
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError:
        raise MCPClientError('MCP tool has an invalid JSON schema') from None
    def check_refs(item):
        if isinstance(item, dict):
            for key, value in item.items():
                if key in {'$ref', '$dynamicRef'} and isinstance(value, str) and not value.startswith('#'):
                    raise MCPClientError('MCP tool schemas may only use local JSON references')
                if key == 'pattern' and isinstance(value, str):
                    _validate_mcp_regex(value)
                if key == 'patternProperties' and isinstance(value, dict):
                    for pattern in value:
                        _validate_mcp_regex(pattern)
                check_refs(value)
        elif isinstance(item, list):
            for child in item:
                check_refs(child)
    check_refs(schema)


def _secret_values(config: dict[str, Any]) -> list[str]:
    values = list((config.get('env') or config.get('headers') or {}).values())
    for value in tuple(values):
        if value.lower().startswith(('bearer ', 'basic ')):
            values.append(value.split(' ', 1)[1])
    return sorted({value for value in values if value}, key=len, reverse=True)


def _redact_secrets(value: Any, secrets: list[str]) -> Any:
    if isinstance(value, str):
        for secret in secrets:
            value = value.replace(secret, '[redacted]')
        return value
    if isinstance(value, list):
        return [_redact_secrets(child, secrets) for child in value]
    if isinstance(value, dict):
        return {_redact_secrets(key, secrets): _redact_secrets(child, secrets) for key, child in value.items()}
    return value


def make_mcp_tool_cache(tools: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
    """Persist only bounded public descriptors, never opaque server metadata."""
    if len(tools) > MAX_TOOLS:
        raise MCPClientError('MCP discovery contains too many tools')
    secrets = _secret_values(config)
    public_tools = []
    names = set()
    for tool in tools:
        name = tool.get('name')
        if not isinstance(name, str) or not name or len(name) > 128 or name in names or any(ord(char) < 32 for char in name):
            raise MCPClientError('MCP tool has an invalid or duplicate name')
        names.add(name)
        schema = tool.get('input_schema')
        if not isinstance(schema, dict) or schema.get('type') != 'object':
            raise MCPClientError('MCP tool input schema must describe an object')
        validate_mcp_schema(schema)
        descriptor = {'name': name, 'description': str(tool.get('description') or '')[:4096], 'input_schema': schema}
        if tool.get('output_schema') is not None:
            validate_mcp_schema(tool['output_schema'])
            descriptor['output_schema'] = tool['output_schema']
        for secret in secrets:
            descriptor['description'] = descriptor['description'].replace(secret, '[redacted]')
        def contains_secret(item):
            if isinstance(item, str):
                return any(secret == item or (len(secret) > 4 and secret in item) for secret in secrets)
            if isinstance(item, dict):
                return any(contains_secret(key) or contains_secret(value) for key, value in item.items())
            if isinstance(item, list):
                return any(contains_secret(value) for value in item)
            return False
        if contains_secret({key: value for key, value in descriptor.items() if key != 'description'}):
            raise MCPClientError('MCP tool descriptor contains credential secrets and cannot be cached')
        public_tools.append(descriptor)
    _bounded_json(public_tools)
    return {'tools': public_tools, 'discovered_at': datetime.now(timezone.utc).isoformat()}


class MCPSession:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.ready = asyncio.get_running_loop().create_future()
        self.closed = asyncio.Event()
        self.session: ClientSession | None = None
        self.scope: anyio.CancelScope | None = None
        self.tools: dict[str, dict[str, Any]] | None = None
        self.secrets = _secret_values(config)
        self.operation_lock = asyncio.Lock()

    async def _serve(self):
        # One dedicated task owns SDK task groups. Closing from a cancelled caller
        # never unwinds an AnyIO cancel scope in a different task or leaks a child.
        try:
            async with AsyncExitStack() as stack:
                if self.config['transport'] == 'stdio':
                    errlog = stack.enter_context(open(os.devnull, 'w'))
                    streams = await stack.enter_async_context(stdio_client(StdioServerParameters(
                        command=self.config['command'], args=self.config['args'], env=self.config['env'],
                    ), errlog=errlog))
                else:
                    client = await stack.enter_async_context(httpx.AsyncClient(
                        transport=MCPPinnedTransport(self.config['url']), headers=self.config['headers'],
                        timeout=httpx.Timeout(settings.mcp_timeout_seconds), follow_redirects=False, trust_env=False,
                    ))
                    streams = await stack.enter_async_context(streamable_http_client(self.config['url'], http_client=client))
                self.session = await stack.enter_async_context(ClientSession(
                    streams[0], streams[1], read_timeout_seconds=timedelta(seconds=settings.mcp_timeout_seconds),
                ))
                with anyio.CancelScope() as scope:
                    self.scope = scope
                    if self.closed.is_set():
                        raise MCPClientError('MCP session initialization was cancelled')
                    with anyio.fail_after(settings.mcp_timeout_seconds):
                        await self.session.initialize()
                    if not self.ready.done():
                        self.ready.set_result(None)
                    await self.closed.wait()
        except BaseException as exc:
            if not self.ready.done():
                self.ready.set_exception(_safe_error(exc))
            elif not self.closed.is_set():
                self.failure = _safe_error(exc)
        finally:
            if not self.ready.done():
                self.ready.set_exception(MCPClientError('MCP session initialization was cancelled'))
            self.session = None

    async def _request(self, operation):
        if self.session is None:
            raise getattr(self, 'failure', MCPClientError('MCP session is closed'))
        try:
            with anyio.fail_after(settings.mcp_timeout_seconds):
                return await operation()
        except Exception as exc:
            raise _safe_error(exc) from None

    async def list_tools(self) -> list[dict[str, Any]]:
        try:
            return await self._list_tools()
        except Exception as exc:
            raise _safe_error(exc) from None

    async def _list_tools(self) -> list[dict[str, Any]]:
        async with self.operation_lock:
            # Failed refresh must not leave previously admitted names callable
            # against newly received, potentially unsafe SDK output schemas.
            self.tools = None
            descriptors: dict[str, dict[str, Any]] = {}
            cursor = None
            seen_cursors = set()
            with anyio.fail_after(settings.mcp_timeout_seconds):
                while True:
                    result = await self._request(lambda: self.session.list_tools(params=PaginatedRequestParams(cursor=cursor) if cursor else None))
                    for tool in result.tools:
                        if len(descriptors) >= MAX_TOOLS or tool.name in descriptors:
                            raise MCPClientError('MCP discovery contains too many tools or duplicate names')
                        if not tool.name or len(tool.name) > 128 or any(ord(char) < 32 for char in tool.name):
                            raise MCPClientError('MCP tool has an invalid name')
                        validate_mcp_schema(tool.inputSchema)
                        if tool.inputSchema.get('type') != 'object':
                            raise MCPClientError('MCP tool input schema must describe an object')
                        if tool.outputSchema is not None:
                            validate_mcp_schema(tool.outputSchema)
                        description = (tool.description or '')[:4096]
                        for secret in self.secrets:
                            description = description.replace(secret, '[redacted]')
                        descriptor = {'name': tool.name, 'description': description, 'input_schema': tool.inputSchema}
                        if tool.outputSchema is not None:
                            descriptor['output_schema'] = tool.outputSchema
                        descriptors[tool.name] = descriptor
                    if not result.nextCursor:
                        break
                    if result.nextCursor in seen_cursors or len(seen_cursors) >= MAX_TOOLS:
                        raise MCPClientError('MCP discovery pagination did not terminate')
                    seen_cursors.add(result.nextCursor)
                    cursor = result.nextCursor
            cache = make_mcp_tool_cache(list(descriptors.values()), self.config)
            self.tools = {tool['name']: tool for tool in cache['tools']}
            return cache['tools']

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if self.tools is None:
            await self.list_tools()
        async with self.operation_lock:
            if name not in self.tools:
                raise MCPClientError('MCP tool is not advertised by this server')
            if not isinstance(arguments, dict):
                raise MCPClientError('MCP tool arguments must be a JSON object')
            _bounded_json(arguments)
            try:
                Draft202012Validator(self.tools[name]['input_schema'], registry=Registry()).validate(arguments)
            except (ValidationError, SchemaError, Unresolvable):
                raise MCPClientError(f"Arguments do not match MCP tool '{name}' input schema") from None
            result = await self._request(lambda: self.session.call_tool(name, arguments))
            output = result.model_dump(mode='json', by_alias=True, exclude_none=True)
            _bounded_json(output)
            output = _redact_secrets(output, self.secrets)
            if result.isError:
                raise MCPToolError(name, output)
            return output


def _safe_error(exc: BaseException) -> MCPClientError:
    if isinstance(exc, MCPClientError):
        return exc
    if isinstance(exc, BaseExceptionGroup):
        for child in exc.exceptions:
            error = _safe_error(child)
            if isinstance(error, (MCPTimeoutError, MCPDisabledError)) or str(error) != 'MCP transport or protocol failed; check the server configuration':
                return error
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return MCPTimeoutError('MCP request timed out')
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code in {401, 403}:
            return MCPClientError('MCP server rejected the configured authentication')
        return MCPClientError(f'MCP server returned HTTP {exc.response.status_code}')
    return MCPClientError('MCP transport or protocol failed; check the server configuration')


@asynccontextmanager
async def open_mcp_session(resolved_config: dict[str, Any]):
    """Initialize, list/call on, and deterministically close one credential session."""
    config = validate_mcp_config(resolved_config)
    session = MCPSession(config)
    worker = asyncio.create_task(session._serve())
    try:
        await asyncio.shield(session.ready)
        yield session
    finally:
        session.closed.set()
        if not session.ready.done() and session.scope is not None:
            session.scope.cancel()
        with anyio.CancelScope(shield=True):
            while not worker.done():
                try:
                    await asyncio.shield(worker)
                except asyncio.CancelledError:
                    # A repeated cancellation must not strand the SDK's process.
                    continue
        if session.ready.done() and not session.ready.cancelled():
            session.ready.exception()  # retrieve initialization failures after caller cancellation
