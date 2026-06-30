"""Helpers for fire-and-forget asyncio tasks with exception logging."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger("aegis.async_tasks")


def _log_task_failure(task: asyncio.Task[Any]) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.exception("Background task failed", exc_info=exc)


def schedule_task(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    task = asyncio.create_task(coro)
    task.add_done_callback(_log_task_failure)
    return task