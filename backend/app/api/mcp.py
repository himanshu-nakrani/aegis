"""MCP mount surface: wires the stateless MCP ASGI app into the FastAPI router.

The server itself lives in ``app.services.mcp_server``. A plain ``app.mount``
isn't used because Starlette Mounts only match *with* a trailing slash —
``/mcp`` exactly would 404. Two exact-path Routes covering ``/mcp`` and
``/mcp/`` keep both spellings working; the endpoint is a raw ASGI app
(Starlette treats non-function endpoints as ASGI), which also means the FastAPI
auth/rate-limit middleware ordering is unchanged — ``/mcp`` isn't under
``/api/`` or ``/v1/`` so account-key and viewer rules never apply, exactly
like the invoke surface.
"""

from __future__ import annotations

from starlette.routing import Route

from app.services.mcp_server import mcp_asgi_app

# Exact-match ASGI routes; appended after include_router() in app.main so real
# routes always win. The endpoint is a callable object (not a function) so
# Starlette treats it as a raw ASGI app rather than request→response.
# methods=None → all methods reach the dispatcher, which returns 405 JSON-RPC
# errors for non-POST.
class _MCPASGIEndpoint:
    async def __call__(self, scope, receive, send) -> None:
        await mcp_asgi_app(scope, receive, send)


mcp_routes: list[Route] = [
    Route("/mcp", _MCPASGIEndpoint(), name="aegis-mcp", include_in_schema=False),
    Route("/mcp/", _MCPASGIEndpoint(), name="aegis-mcp-slash", include_in_schema=False),
]
