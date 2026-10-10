"""Workflow-level guardrail policy enforced through ADK plugin callbacks.
A per-node guardrail only guards where it sits in the graph. A workflow-level
policy applies one rail to *every* agent's model call — its input (via
``before_model_callback``) and/or its output (via ``after_model_callback``) —
without adding nodes. ADK's callback contract makes this clean:

- ``before_model_callback`` returning a non-``None`` ``LlmResponse`` short-
  circuits the model call (used to block unsafe input).
- ``after_model_callback`` returning a non-``None`` ``LlmResponse`` replaces the
  model's response (used to mask or block unsafe output).

Ordinary policy violations use a *soft* block: replace the offending call with
a safe message and complete the run. An unavailable required production judge
instead raises a hard block so no downstream actions run. Every decision is
recorded as a guardrail event for the executor's Trust metrics.
"""

from __future__ import annotations

import json
from typing import Any

from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from app.services.guardrail import (
    GuardrailBlockedError,
    GuardrailJudgeUnavailableError,
    GuardrailResult,
    apply_fail_behavior,
    validate_guardrail_content,
)

_OVERRIDE_BEHAVIORS = frozenset({"mask", "rewrite", "fallback"})


def _contents_to_text(contents: Any) -> str | None:
    """Flatten genai contents/parts into readable text (mirrors token_tracker)."""
    if contents is None:
        return None
    if isinstance(contents, str):
        return contents
    chunks: list[str] = []
    items = contents if isinstance(contents, (list, tuple)) else [contents]
    for item in items:
        parts = getattr(item, "parts", None)
        if parts:
            for part in parts:
                text = getattr(part, "text", None)
                if text:
                    chunks.append(str(text))
        elif isinstance(item, str):
            chunks.append(item)
    return "\n".join(chunks) if chunks else None


def _response_text(llm_response: Any) -> str | None:
    content = getattr(llm_response, "content", None)
    parts = getattr(content, "parts", None)
    if not parts:
        return None
    texts = [getattr(pt, "text", None) for pt in parts]
    return "\n".join(t for t in texts if t) or None


def _expects_json(llm_request: Any) -> bool:
    """True when the agent asked the model for JSON (structured output_schema).

    Aegis compiles most agents with ``output_schema=str``, so ADK sets a JSON
    response format and json-loads the model output. A replacement must match
    that serialization or downstream schema validation fails.
    """
    cfg = getattr(llm_request, "config", None)
    if cfg is None:
        return False
    mime = getattr(cfg, "response_mime_type", None)
    if mime and "json" in str(mime).lower():
        return True
    return getattr(cfg, "response_schema", None) is not None


def _decode_str_response(text: str) -> tuple[str, bool]:
    """Return ``(content_to_validate, was_json_string)``.

    A ``str`` output_schema arrives JSON-encoded (``"hello"``). Validate the
    decoded content, and remember it was JSON so the replacement re-encodes.
    Non-string JSON (objects/lists) is left untouched — we don't rewrite
    structured payloads.
    """
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        return (text, False)
    if isinstance(value, str):
        return (value, True)
    return (text, False)


def _text_response(text: str, *, as_json: bool = False) -> LlmResponse:
    payload = json.dumps(text) if as_json else text
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=payload)]))

def _serialize_tool_args(tool_args: Any) -> str | None:
    """Serialize tool arguments into text for the content validators."""
    if tool_args is None:
        return None
    try:
        text = tool_args if isinstance(tool_args, str) else json.dumps(
            tool_args, default=str, ensure_ascii=False
        )
    except Exception:  # noqa: BLE001 — fall back to repr rather than skip the rail
        text = str(tool_args)
    return text or None


class ToolCallGuard:
    """Action-layer guardrail for a policy — enforced inside TracePlugin's
    ``before_tool_callback``.

    Config lives on the policy's ``rules_json`` (no new table):

    - ``scope``: ``"model_io"`` (default, text only), ``"tool_call"`` (tool
      layer only), or ``"both"``. Serialized tool arguments run through the
      existing data-class validators whenever the scope covers tool calls, or
      whenever ``tool_rule`` carries its own validator keys.
    - ``tool_rule`` (optional object): ``max_calls`` caps the total number of
      tool invocations per run; ``max_calls_per_tool`` (``{"tool_name": N}``)
      caps calls of a specific tool. Any other key (``detect_pii``,
      ``blocked_keywords``, ``guardrail_type`` …) merges over the policy's
      top-level rules for the args check — cap keys are ignored by the
      validators. Every attempted call counts against the caps.

    ``fail_behavior == "warn"`` records and allows the call; every other
    behavior blocks it — mask/rewrite/fallback cannot rewrite tool arguments,
    so they degrade to a block. A blocked call returns a synthetic tool
    response (the tool never executes) and is recorded on the plugin's
    ``events`` plus a ``blocked`` trace span. An unavailable required judge
    hard-fails like text rails do.
    """

    _CAP_KEYS = frozenset({"max_calls", "max_calls_per_tool"})

    def __init__(self, plugin: "GuardrailPolicyPlugin") -> None:
        self._plugin = plugin
        scope = str(plugin.rules.get("scope") or "model_io").lower()
        self.scope = scope if scope in ("model_io", "tool_call", "both") else "model_io"
        tool_rule = plugin.rules.get("tool_rule")
        self._tool_rule = dict(tool_rule) if isinstance(tool_rule, dict) else {}
        self._counts: dict[str, int] = {}
        self._total = 0

    def covers_tools(self) -> bool:
        """Whether this guard runs inside the tool hook at all."""
        return self.scope in ("tool_call", "both") or bool(self._tool_rule)

    def check(self, tool_name: str, agent_name: str, tool_args: Any) -> str | None:
        """Return a block message when the tool call must be rejected."""
        if not self.covers_tools():
            return None
        self._total += 1
        self._counts[tool_name] = self._counts.get(tool_name, 0) + 1
        freq_block = self._frequency_block(tool_name)
        if freq_block:
            return self._block(tool_name, agent_name, freq_block)
        verdict = self._args_verdict(tool_args)
        if verdict is None or verdict.passed:
            return None
        if verdict.requires_block:
            self._record(tool_name, agent_name, "failed", verdict.message)
            raise GuardrailJudgeUnavailableError(verdict.message, "workflow-policy")
        if (self._plugin.rules.get("fail_behavior") or "block") == "warn":
            self._record(tool_name, agent_name, "warned", f"[WARN] {verdict.message}")
            return None
        return self._block(tool_name, agent_name, verdict.message)

    @staticmethod
    def _cap(raw: Any) -> int | None:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None

    def _frequency_block(self, tool_name: str) -> str | None:
        per_tool = self._tool_rule.get("max_calls_per_tool")
        if isinstance(per_tool, dict):
            cap = self._cap(per_tool.get(tool_name))
            if cap is not None and self._counts.get(tool_name, 0) > cap:
                return f"Tool '{tool_name}' exceeded its per-run call cap ({cap})"
        total = self._cap(self._tool_rule.get("max_calls"))
        if total is not None and self._total > total:
            return f"Tool calls exceeded the per-run cap ({total})"
        return None

    def _args_verdict(self, tool_args: Any) -> GuardrailResult | None:
        """Validate serialized args when the scope/tool_rule asks for it."""
        args_rules = {key: value for key, value in self._tool_rule.items()
            if key not in self._CAP_KEYS}
        if self.scope not in ("tool_call", "both") and not args_rules:
            return None  # frequency caps only — args left alone
        payload = _serialize_tool_args(tool_args)
        if not payload or not payload.strip():
            return None
        return validate_guardrail_content(payload, {**self._plugin.rules, **args_rules})

    def _block(self, tool_name: str, agent_name: str, message: str) -> str:
        self._record(tool_name, agent_name, "failed", message)
        return f"Blocked by workflow guardrail policy: {message}"

    def _record(self, tool_name: str, agent_name: str, status: str, message: str) -> None:
        self._plugin._record(
            "tool_call", status, message,
            extra={"tool": tool_name, "agent": agent_name},
        )


class GuardrailPolicyPlugin(BasePlugin):
    """Applies a single guardrail policy to every agent's model input/output.

    ``mode`` selects which side(s) to guard: ``input`` (before the model),
    ``output`` (after), or ``both``. ``rules_json.scope`` selects the layer:
    ``model_io`` (default), ``tool_call``, or ``both`` — the tool layer runs
    through :class:`ToolCallGuard`, which the executor hands to ``TracePlugin``.
    """

    def __init__(
        self,
        rules: dict[str, Any],
        *,
        mode: str = "both",
        policy_name: str = "Workflow policy",
    ) -> None:
        super().__init__(name="aegis_guardrail_policy")
        self.rules = dict(rules or {})
        self.mode = mode if mode in ("input", "output", "both") else "both"
        self.policy_name = policy_name
        self.events: list[dict[str, Any]] = []
        self.blocked = False
        self.tool_guard = ToolCallGuard(self)

    def _guards_text(self, direction: str) -> bool:
        """Whether the policy applies to model text in this direction."""
        if self.tool_guard.scope == "tool_call":
            return False
        return self.mode in (direction, "both")


    # ---- pure decision logic (unit-testable without ADK objects) ----------

    def _decide(self, text: str, direction: str) -> tuple[str, str | None, str]:
        """Return ``(status, override_text, message)`` for a piece of text.

        ``status`` is ``passed`` / ``warned`` / ``failed``. ``override_text`` is
        the sanitized replacement when a fail-behavior masks/rewrites/falls back;
        ``None`` otherwise.
        """
        rules = {**self.rules, "mode": direction}
        result = validate_guardrail_content(text, rules)
        if result.requires_block:
            self._record(direction, "failed", result.message)
            raise GuardrailJudgeUnavailableError(result.message, "workflow-policy")
        if result.passed:
            return ("warned" if result.severity == "warn" else "passed", None, result.message)

        fail_behavior = rules.get("fail_behavior", "block")
        if fail_behavior in _OVERRIDE_BEHAVIORS:
            adjusted = apply_fail_behavior(
                result, fail_behavior, "workflow-policy", content=text, rules=rules
            )
            return ("warned", adjusted.output_override, adjusted.message)
        if fail_behavior == "warn":
            return ("warned", None, f"[WARN] {result.message}")
        # block (default) — recorded as a hard violation, enforced as a soft block.
        return ("failed", None, result.message)

    def _record(
        self,
        direction: str,
        status: str,
        message: str,
        *,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.events.append(
            {
                "node_id": "workflow-policy",
                "node_label": self.policy_name,
                "status": status,
                "message": (message or "")[:300],
                "mode": direction,
                "guardrail_type": self.rules.get("guardrail_type"),
                "fail_behavior": self.rules.get("fail_behavior", "block"),
                "scope": "workflow",
                **(extra or {}),
            }
        )
        if status == "failed":
            self.blocked = True

    def enforce_direct(self, text: str, direction: str) -> str:
        """Apply the same policy to provider callables outside ADK model hooks."""
        if not self._guards_text(direction):
            return text
        status, override, message = self._decide(text, direction)
        if status != "passed":
            self._record(direction, status, message)
        if status == "failed":
            # Callable decisions cannot emit a synthetic model response safely.
            raise GuardrailBlockedError(message, "workflow-policy")
        return override if override is not None else text

    # ---- ADK callbacks ----------------------------------------------------

    async def before_model_callback(
        self, *, callback_context: Any, llm_request: Any
    ) -> LlmResponse | None:
        if not self._guards_text("input"):
            return None
        text = _contents_to_text(getattr(llm_request, "contents", None))
        if (not text or not text.strip()) and (self.rules.get("guardrail_type") or "rules").lower() not in {
            "llm", "prompt_injection", "moderation"
        }:
            return None
        status, _override, message = self._decide(text or "", "input")
        if status == "passed":
            return None
        self._record("input", status, message)
        if status == "failed":
            # Short-circuit: the agent "responds" with the block, model never runs.
            # Match the agent's expected serialization so schema validation passes.
            return _text_response(
                f"Blocked by workflow guardrail policy: {message}",
                as_json=_expects_json(llm_request),
            )
        # Input masking can't rewrite the request cleanly — warn and continue.
        return None

    async def after_model_callback(
        self, *, callback_context: Any, llm_response: Any
    ) -> LlmResponse | None:
        if not self._guards_text("output"):
            return None
        raw = _response_text(llm_response)
        if (not raw or not raw.strip()) and (self.rules.get("guardrail_type") or "rules").lower() not in {
            "llm", "prompt_injection", "moderation"
        }:
            return None
        # Validate the decoded content; re-encode any replacement to match.
        content, was_json = _decode_str_response(raw or "")
        status, override, message = self._decide(content, "output")
        if status == "passed":
            return None
        self._record("output", status, message)
        if override is not None:
            return _text_response(override, as_json=was_json)
        if status == "failed":
            return _text_response(
                f"Blocked by workflow guardrail policy: {message}", as_json=was_json
            )
        return None  # warn — keep the original output
