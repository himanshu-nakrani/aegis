"""User-scoped SSE fan-out for live observability updates."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

_subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)
_MAX_QUEUE = 64


def subscribe_observability(user_id: str) -> asyncio.Queue[dict[str, Any]]:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=_MAX_QUEUE)
    _subscribers[user_id].append(queue)
    return queue


def unsubscribe_observability(user_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
    rows = _subscribers.get(user_id, [])
    if queue in rows:
        rows.remove(queue)
    if not rows:
        _subscribers.pop(user_id, None)


async def broadcast_observability_event(user_id: str, event: dict[str, Any]) -> None:
    dead: list[asyncio.Queue[dict[str, Any]]] = []
    for queue in list(_subscribers.get(user_id, [])):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(queue)
    for queue in dead:
        unsubscribe_observability(user_id, queue)


async def stream_observability_events(user_id: str):
    queue = subscribe_observability(user_id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                yield {"type": "heartbeat"}
                continue
            yield event
            if event.get("type") == "stream_end":
                break
    finally:
        unsubscribe_observability(user_id, queue)