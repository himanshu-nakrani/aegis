"""Wrap compiled node callables to maintain workflow context across execution."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable
from typing import Any

from app.services.guardrail import GuardrailResult


def _normalize_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, GuardrailResult):
        return value.message or ("passed" if value.passed else "blocked")
    return str(value)


def wrap_with_context(
    node_id: str,
    fn: Callable[..., Any],
    context_ref: dict[str, Any],
    *,
    label: str | None = None,
    node_type: str | None = None,
    retries: int = 0,
    retry_delay_sec: float = 1.0,
    timeout_sec: float | None = None,
) -> Callable[..., Any]:
    """Record upstream input and node output in the shared workflow context,
    applying the node's reliability policy (retries with backoff + timeout)."""
    is_coro = inspect.iscoroutinefunction(fn)

    async def _call_with_policy(node_input: str) -> Any:
        """Run fn under timeout, retrying transient failures with backoff."""
        attempt = 0
        while True:
            try:
                if is_coro:
                    coro = fn(node_input)
                else:
                    coro = asyncio.to_thread(fn, node_input)
                if timeout_sec:
                    return await asyncio.wait_for(coro, timeout=timeout_sec)
                return await coro
            except Exception as exc:  # noqa: BLE001 — retry policy is intentionally broad
                emit = context_ref.get("_emit")
                if attempt >= retries:
                    raise
                attempt += 1
                if callable(emit):
                    try:
                        await emit(
                            {
                                "type": "node_retry",
                                "node_id": node_id,
                                "node_label": label or node_id,
                                "attempt": attempt,
                                "max_attempts": retries,
                                "error": str(exc)[:200],
                            }
                        )
                    except Exception:
                        pass
                await asyncio.sleep(retry_delay_sec * (2 ** (attempt - 1)))

    def _record(node_input: str, output: str) -> str:
        context_ref["last_output"] = str(node_input)
        context_ref.setdefault("steps", {})[node_id] = {
            "output": output,
            "label": label or node_id,
            "type": node_type,
        }
        context_ref["last_output"] = output
        return output

    if retries > 0 or timeout_sec:
        async def policy_wrapped(node_input: str) -> Any:
            context_ref["last_output"] = str(node_input)
            result = await _call_with_policy(node_input)
            return _record(node_input, _normalize_output(result))

        policy_wrapped.__name__ = getattr(fn, "__name__", node_id)
        return policy_wrapped

    if is_coro:

        async def async_wrapped(node_input: str) -> Any:
            context_ref["last_output"] = str(node_input)
            result = await fn(node_input)
            return _record(node_input, _normalize_output(result))

        async_wrapped.__name__ = getattr(fn, "__name__", node_id)
        return async_wrapped

    def wrapped(node_input: str) -> Any:
        context_ref["last_output"] = str(node_input)
        result = fn(node_input)
        if asyncio.iscoroutine(result):
            raise TypeError(f"Node {node_id} returned coroutine from sync wrapper")
        return _record(node_input, _normalize_output(result))

    wrapped.__name__ = getattr(fn, "__name__", node_id)
    return wrapped