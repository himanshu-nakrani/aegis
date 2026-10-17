from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None
_owners: int = 0


async def startup_http_client() -> None:
    """Idempotent acquire of the process-shared HTTP client.

    Lifespans (API, worker) each acquire on boot; the client is created once
    and closed when the last owner shuts down, so nested lifespans in one
    process (tests running worker + API lifespans) cannot strand each other.
    """
    global _client, _owners
    _owners += 1
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )


async def shutdown_http_client() -> None:
    global _client, _owners
    _owners = max(0, _owners - 1)
    if _owners == 0 and _client is not None:
        await _client.aclose()
        _client = None


def get_http_client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client is not initialized")
    return _client