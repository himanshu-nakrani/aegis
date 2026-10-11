"""Per-run tool-call capture + action-layer guardrails (Trust-layer trace tree).

Mirrors ``TokenTrackerPlugin`` (which captures model calls) but for **tool
calls**: it hooks ``before/after/on_error_tool_callback`` to record each tool
invocation an agent makes — name, args, result/error, timing — keyed by the ADK
agent name. The executor maps agent names back to canvas node ids after the run
and writes these as ``tool_call`` child spans of their node span, so the
waterfall drills from a node into the agent's actual tool usage (previously a
black box).

``tool_guard`` (a ``GuardrailPolicyPlugin``'s ``ToolCallGuard``) adds
action-layer guardrails: when a call is rejected, returning a synthetic tool
response short-circuits execution — the tool never runs, ADK still routes the
synthetic result through ``after_tool_callback``, and the call lands in the
trace as a ``blocked`` span plus a policy guardrail event.
"""

from __future__ import annotations

import time
from typing import Any

from google.adk.plugins.base_plugin import BasePlugin


def _summarize(value: Any, limit: int = 2000) -> str | None:
    if value is None:
        return None
    try:
        import json

        text = value if isinstance(value, str) else json.dumps(value, default=str, ensure_ascii=False)
    except Exception:  # noqa: BLE001 — never let summarization break a run
        text = str(value)
    text = text.strip()
    if not text:
        return None
    return text[:limit]


class TracePlugin(BasePlugin):
    """Accumulates tool-call spans (name/args/result/timing) per ADK agent."""

    def __init__(self, max_chars: int = 2000, tool_guard: Any = None) -> None:
        super().__init__(name="aegis_trace")
        self.max_chars = max_chars
        # Optional action-layer guard (GuardrailPolicyPlugin.tool_guard).
        self.tool_guard = tool_guard
        # Chronological tool-call records for the nested trace tree.
        self.tool_calls: list[dict[str, Any]] = []
        # ADK call IDs distinguish concurrent calls to the same named tool.
        self._pending: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    @staticmethod
    def _agent_name(tool_context: Any) -> str:
        return str(getattr(tool_context, "agent_name", "") or "") or "unknown"

    @staticmethod
    def _key(tool_context: Any, tool: Any) -> tuple[str, str, str, str]:
        return (
            str(getattr(tool_context, "invocation_id", "") or ""),
            str(getattr(tool_context, "agent_name", "") or ""),
            str(getattr(tool, "name", "") or ""),
            str(getattr(tool_context, "function_call_id", "") or id(tool_context)),
        )

    async def before_tool_callback(
        self, *, tool: Any, tool_args: dict[str, Any], tool_context: Any
    ) -> dict | None:
        start = {
            "agent": self._agent_name(tool_context),
            "name": str(getattr(tool, "name", "") or "tool"),
            "call_id": str(getattr(tool_context, "function_call_id", "") or ""),
            "args": _summarize(tool_args, self.max_chars),
            "started_wall": time.time(),
        }
        self._pending[self._key(tool_context, tool)] = start
        if self.tool_guard is None:
            return None
        block_message = self.tool_guard.check(
            start["name"], start["agent"], tool_args
        )
        if not block_message:
            return None
        # Rejected: returning a dict short-circuits execution and ADK feeds it
        # to after_tool_callback — mark the pending start so _finish records
        # this as a guardrail block, not a completed call.
        start["blocked"] = True
        start["block_error"] = block_message
        return {
            "error": block_message,
            "guardrail_blocked": True,
        }

    async def after_tool_callback(
        self, *, tool: Any, tool_args: dict[str, Any], tool_context: Any, result: dict
    ) -> None:
        self._finish(tool_context, tool, status="completed", result=result)
        return None

    async def on_tool_error_callback(
        self, *, tool: Any, tool_args: dict[str, Any], tool_context: Any, error: Exception
    ) -> None:
        self._finish(tool_context, tool, status="failed", result=None, error=str(error))
        return None

    def _finish(
        self,
        tool_context: Any,
        tool: Any,
        *,
        status: str,
        result: Any,
        error: str | None = None,
    ) -> None:
        key = self._key(tool_context, tool)
        start = self._pending.pop(key, None)
        if start is None:
            # after without a matching before — synthesize a zero-duration span.
            start = {
                "agent": self._agent_name(tool_context),
                "name": str(getattr(tool, "name", "") or "tool"),
                "args": None,
                "started_wall": time.time(),
            }
        blocked = start.pop("blocked", False)
        block_error = start.pop("block_error", None)
        if blocked and status == "completed":
            status = "blocked"
            if error is None:
                error = block_error
        ended = time.time()
        self.tool_calls.append(
            {
                **start,
                "status": status,
                "result": _summarize(result, self.max_chars),
                "error": error,
                "ended_wall": ended,
                "latency_ms": int((ended - start["started_wall"]) * 1000),
            }
        )

    def finish_pending(self) -> None:
        """Close cancellation/interruption starts without claiming completion."""
        ended = time.time()
        for start in self._pending.values():
            blocked = start.pop("blocked", False)
            block_error = start.pop("block_error", None)
            self.tool_calls.append({**start,
                "status": "blocked" if blocked else "cancelled", "result": None,
                "error": block_error if blocked else None, "ended_wall": ended,
                "latency_ms": int((ended - start["started_wall"]) * 1000)})
        self._pending.clear()
