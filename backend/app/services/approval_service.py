"""Human-in-the-loop approval for paused workflow runs (Lyzr SuperFlow)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.config import settings

_approval_events: dict[str, asyncio.Event] = {}
_approval_results: dict[str, dict[str, Any]] = {}


class HumanApprovalDenied(Exception):
    def __init__(self, node_id: str, comment: str = "") -> None:
        self.node_id = node_id
        self.comment = comment
        super().__init__(comment or f"Approval denied at node {node_id}")


class HumanApprovalTimeout(Exception):
    pass


def clear_approval_state(run_id: str) -> None:
    _approval_events.pop(run_id, None)
    _approval_results.pop(run_id, None)


def submit_approval(run_id: str, *, approved: bool, comment: str = "") -> None:
    _approval_results[run_id] = {"approved": approved, "comment": comment}
    event = _approval_events.get(run_id)
    if event:
        event.set()


async def wait_for_approval(run_id: str, *, timeout: float | None = None) -> dict[str, Any]:
    existing = _approval_results.get(run_id)
    if existing is not None:
        _approval_results.pop(run_id, None)
        _approval_events.pop(run_id, None)
        return existing

    limit = timeout if timeout is not None else float(settings.approval_timeout_seconds)
    event = _approval_events.setdefault(run_id, asyncio.Event())
    try:
        await asyncio.wait_for(event.wait(), timeout=limit)
    except asyncio.TimeoutError as exc:
        clear_approval_state(run_id)
        raise HumanApprovalTimeout(f"Approval timed out after {limit}s") from exc
    finally:
        _approval_events.pop(run_id, None)
    return _approval_results.pop(run_id, {"approved": False, "comment": "no decision"})