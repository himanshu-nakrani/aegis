"""Simple in-memory rate limiting per API key / client IP."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

from app.config import settings

_lock = Lock()
_buckets: dict[str, list[float]] = defaultdict(list)
_last_prune = 0.0


def _client_key(request: Request) -> str:
    api_key = request.headers.get("X-Aegis-API-Key") or request.query_params.get("api_key")
    if api_key:
        return f"key:{api_key}"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    if request.client:
        return f"ip:{request.client.host}"
    return "ip:unknown"


def _prune_stale_buckets(now: float, window_seconds: float) -> None:
    global _last_prune
    if now - _last_prune < window_seconds:
        return
    _last_prune = now
    stale_keys = [
        key
        for key, timestamps in _buckets.items()
        if not any(now - ts < window_seconds for ts in timestamps)
    ]
    for key in stale_keys:
        _buckets.pop(key, None)


def check_rate_limit(request: Request) -> None:
    if not settings.auth_enabled:
        return
    limit = max(10, int(getattr(settings, "rate_limit_per_minute", 120) or 120))
    window_seconds = 60.0
    now = time.monotonic()
    key = _client_key(request)

    with _lock:
        _prune_stale_buckets(now, window_seconds)
        timestamps = _buckets[key]
        _buckets[key] = [ts for ts in timestamps if now - ts < window_seconds]
        if len(_buckets[key]) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({limit} requests per minute)",
            )
        _buckets[key].append(now)