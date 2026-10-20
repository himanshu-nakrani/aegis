"""Mutable workflow context passed through node execution."""

from __future__ import annotations

import json
import threading
from copy import deepcopy
from typing import Any


def context_lock(context_ref: dict[str, Any]) -> threading.RLock:
    """Lock shared by parallel node handlers mutating one context dict.

    The lock lives on the dict under ``_lock`` (snapshot already drops
    underscore keys, so it is not persisted). ``setdefault`` keeps a single
    lock if two threads create one at the same time.
    """
    lock = context_ref.get("_lock")
    if lock is None:
        lock = threading.RLock()
        lock = context_ref.setdefault("_lock", lock)
    return lock


class WorkflowContext:
    """Accumulates run input and per-step outputs for expression mapping."""

    def __init__(self, input_text: str, *, parsed_input: dict[str, Any] | None = None) -> None:
        self._data: dict[str, Any] = {
            "input": parsed_input if parsed_input is not None else {"text": input_text},
            "steps": {},
            "last_output": input_text,
            "memory": {},
            # Prior turns from earlier runs sharing this run's session_id.
            # List of {run_id, input, output, created_at}, oldest-first.
            "session_history": [],
        }

    @classmethod
    def from_input(cls, input_text: str) -> WorkflowContext:
        stripped = (input_text or "").strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, dict):
                    return cls(input_text, parsed_input={**parsed, "text": input_text})
            except json.JSONDecodeError:
                pass
        return cls(input_text)

    def to_dict(self) -> dict[str, Any]:
        return self._data

    def snapshot(self, *, max_output_chars: int = 500) -> dict[str, Any]:
        # Exclude underscore-prefixed runtime plumbing (hooks, ids, kb docs)
        # injected into the live dict by the executor — they are not user data
        # and are not JSON-serializable.
        data = deepcopy({k: v for k, v in self._data.items() if not k.startswith("_")})
        steps = data.get("steps")
        if isinstance(steps, dict):
            for step in steps.values():
                if not isinstance(step, dict) or "output" not in step:
                    continue
                output = str(step.get("output") or "")
                if len(output) > max_output_chars:
                    step["output"] = f"{output[:max_output_chars]}…"
        return data

    def snapshot_for_metrics(self, *, max_output_chars: int = 500) -> dict[str, Any]:
        """Snapshot safe for metrics/SSE — excludes workflow memory.

        ``session_history`` stays in the snapshot: entries are already capped
        (per-turn chars × ≤50 turns) by the invoke path, and persisting them
        lets run detail show which prior turns seeded the context.
        """
        data = self.snapshot(max_output_chars=max_output_chars)
        data.pop("memory", None)
        return data

    def set_last_output(self, value: str) -> None:
        self._data["last_output"] = value

    def record_step(
        self,
        node_id: str,
        output: str,
        *,
        label: str | None = None,
        node_type: str | None = None,
    ) -> None:
        self._data["steps"][node_id] = {
            "output": output,
            "label": label or node_id,
            "type": node_type,
        }
        self._data["last_output"] = output

    def set_session_history(self, turns: list[dict[str, Any]] | None) -> None:
        """Seed prior-turn history for a session-scoped run (invoke path)."""
        self._data["session_history"] = [t for t in (turns or []) if isinstance(t, dict)]

    def get_session_history(self) -> list[dict[str, Any]]:
        """Prior turns seeding this run — [] when the run has no session_id."""
        history = self._data.get("session_history")
        return list(history) if isinstance(history, list) else []