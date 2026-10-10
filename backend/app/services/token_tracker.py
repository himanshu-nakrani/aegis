"""Per-run token and cost accounting via ADK plugin callbacks.

ADK 2.x's workflow wrapper strips ``usage_metadata`` from the events it
propagates to runner-level consumers, so token counts never reach the
executor's event loop. Model callbacks, however, fire on the raw
``LlmResponse`` before any wrapping — we capture usage there, keyed by the
ADK agent name, and the executor maps agent names back to canvas node ids
after the run completes.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
import json
from importlib.metadata import distribution
import re
from typing import Any

from google.adk.plugins.base_plugin import BasePlugin

# USD per 1M tokens (input, output) for native model families absent from the
# bundled LiteLLM catalog. Only exact families and dated/versioned aliases match;
# hosted providers never fall back to their underlying vendor's rates.
MODEL_PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.0-flash-lite": (0.075, 0.30),
    "gemini-2.0-flash": (0.10, 0.40),
    # OpenAI
    "gpt-5-mini": (0.25, 2.00),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-5": (1.25, 10.00),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    # Anthropic native families; exact catalog variants always take precedence.
    "claude-opus-4": (15.00, 75.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-sonnet-4": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-3-7-sonnet": (3.00, 15.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-3-5-haiku": (0.80, 4.00),
}


@dataclass(frozen=True)
class ModelRates:
    input_per_token: float
    output_per_token: float
    input_above_200k: float | None = None
    output_above_200k: float | None = None


_PROVIDER_ALIASES = {
    "gemini": "google",
    "fireworks_ai": "fireworks",
    "featherless_ai": "featherless",
    "vercel_ai_gateway": "vercel",
}
_CATALOG_PREFIXES = {
    "google": "gemini",
    "openai": "openai",
    "anthropic": "anthropic",
    "fireworks": "fireworks_ai",
    "openrouter": "openrouter",
    "featherless": "featherless_ai",
    "vercel": "vercel_ai_gateway",
}
_NATIVE_PROVIDERS = {"google", "openai", "anthropic"}


@lru_cache(maxsize=1)
def _local_cost_map() -> dict[str, Any]:
    """Load LiteLLM's packaged catalog once, without importing its network loader."""
    path = distribution("litellm").locate_file(
        "litellm/model_prices_and_context_window_backup.json"
    )
    with path.open(encoding="utf-8") as catalog:
        return json.load(catalog)


@lru_cache(maxsize=2048)
def resolve_model_rates(model: str | None, provider: str | None = None) -> ModelRates | None:
    """Resolve billing rates, or explicitly return None for an unpriced target.

    Provider identity is independent of the OpenAI-compatible transport. Never
    strip a hosted routing prefix and then apply the base vendor's prices.
    """
    if not model:
        return None
    model = model.strip()
    provider = (provider or "").strip().lower()
    provider = _PROVIDER_ALIASES.get(provider, provider)
    prefix, separator, rest = model.partition("/")
    routed_provider = _PROVIDER_ALIASES.get(prefix, prefix)
    if not provider:
        if separator and routed_provider in _CATALOG_PREFIXES:
            provider, model = routed_provider, rest
        elif model.startswith("accounts/fireworks/models/"):
            provider = "fireworks"
        elif model.startswith("gemini-"):
            provider = "google"
        elif model.startswith("claude-"):
            provider = "anthropic"
        elif model.startswith(("gpt-", "o1", "o3", "o4")):
            provider = "openai"
        else:
            return None
    elif separator and routed_provider == provider:
        model = rest
    elif provider == "featherless" and prefix == "openai" and separator:
        model = rest  # Featherless uses openai/<HF model> on the wire.
    elif provider == "vercel" and model.startswith(("openai/openai/", "openai/anthropic/")):
        model = rest  # An extra OpenAI transport prefix, not the vendor namespace.

    catalog_prefix = _CATALOG_PREFIXES.get(provider)
    if not catalog_prefix:
        return None
    if provider == "fireworks" and "/" not in model:
        model = f"accounts/fireworks/models/{model}"
    catalog = _local_cost_map()
    entry = catalog.get(f"{catalog_prefix}/{model}")
    if entry is None and provider in _NATIVE_PROVIDERS:
        entry = catalog.get(model)
    if entry and entry.get("litellm_provider") == catalog_prefix:
        input_rate = entry.get("input_cost_per_token")
        output_rate = entry.get("output_cost_per_token")
        if isinstance(input_rate, (int, float)) and isinstance(output_rate, (int, float)):
            return ModelRates(
                input_rate,
                output_rate,
                entry.get("input_cost_per_token_above_200k_tokens"),
                entry.get("output_cost_per_token_above_200k_tokens"),
            )
        return None  # A catalog entry without token rates is not a free model.
    if provider in _NATIVE_PROVIDERS:
        for family, (input_price, output_price) in MODEL_PRICES_PER_MTOK.items():
            if not model.startswith(family):
                continue
            if re.fullmatch(r"(?:-\d{3}|-\d{8}|-\d{4}-\d{2}-\d{2}|-latest)?", model[len(family):]):
                family_provider = "google" if family.startswith("gemini-") else (
                    "anthropic" if family.startswith("claude-") else "openai"
                )
                if provider == family_provider:
                    # Reuse family catalog rates (including context tiers) for
                    # dated aliases missing an exact entry; do not guess variants.
                    if model != family:
                        return resolve_model_rates(family, provider)
                    return ModelRates(input_price / 1_000_000, output_price / 1_000_000)
    return None


def estimate_cost_usd(
    model: str | None, prompt_tokens: int, completion_tokens: int,
    provider: str | None = None,
) -> float | None:
    rates = resolve_model_rates(model, provider)
    if rates is None:
        return None
    input_rate, output_rate = rates.input_per_token, rates.output_per_token
    if prompt_tokens > 200_000:
        if rates.input_above_200k is not None:
            input_rate = rates.input_above_200k
        if rates.output_above_200k is not None:
            output_rate = rates.output_above_200k
    return prompt_tokens * input_rate + completion_tokens * output_rate


def _apply_call_resilience(llm_request: Any) -> None:
    """Set a bounded per-call timeout + backoff retry on the outgoing LlmRequest.

    Uses the genai SDK's native ``http_options`` (timeout in ms) and
    ``retry_options`` (attempts / exponential backoff) so we don't hand-roll a
    retry loop around the ADK invocation. Total worst-case cost is bounded: the
    per-attempt timeout is derived from the per-call budget divided across
    attempts, so retries cannot exceed ``node_llm_timeout_seconds`` and thus
    cannot blow ``run_timeout_seconds`` / budgets.
    """
    from app.config import settings

    # LiteLLM-backed requests (ADK LiteLlm for OpenAI/Anthropic) carry a
    # "provider/model" id and don't understand genai http_options; their
    # timeout/retry budget is set on the LiteLlm wrapper itself.
    model = str(getattr(llm_request, "model", "") or "")
    if "/" in model:
        return

    try:
        from google.genai import types as _genai_types
    except Exception:  # noqa: BLE001 — genai unavailable (shouldn't happen at runtime)
        return

    config = getattr(llm_request, "config", None)
    if config is None:
        return

    budget_s = max(1, int(getattr(settings, "node_llm_timeout_seconds", 60) or 60))
    max_retries = max(0, int(getattr(settings, "node_llm_max_retries", 2) or 0))
    attempts = max_retries + 1  # genai counts the first try as attempt 1
    initial_delay = float(getattr(settings, "node_llm_retry_initial_delay", 1.0) or 1.0)

    # Divide the per-call budget across attempts so the worst case (all retries)
    # still fits within budget_s. Floor at 5s so a single attempt is not starved.
    per_attempt_s = max(5, int(budget_s / attempts))

    try:
        http_options = getattr(config, "http_options", None)
        if http_options is None:
            http_options = _genai_types.HttpOptions()
        # timeout is milliseconds in the genai SDK.
        http_options.timeout = per_attempt_s * 1000
        if attempts > 1:
            http_options.retry_options = _genai_types.HttpRetryOptions(
                attempts=attempts,
                initial_delay=initial_delay,
                exp_base=2.0,
                max_delay=float(per_attempt_s),
            )
        config.http_options = http_options
    except Exception:  # noqa: BLE001 — never let resilience wiring break a run
        return


def _zero_usage() -> dict[str, int]:
    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "thinking_tokens": 0,
        "total_tokens": 0,
        "calls": 0,
    }


class TokenTrackerPlugin(BasePlugin):
    """Accumulates LLM token usage per ADK agent name for a single run."""

    def __init__(
        self, capture_calls: bool = True, max_text_chars: int = 20_000,
        model_targets: Mapping[str, tuple[str, str]] | None = None,
    ) -> None:
        super().__init__(name="aegis_token_tracker")
        self.usage_by_agent: dict[str, dict[str, int]] = defaultdict(_zero_usage)
        self.model_by_agent: dict[str, str] = {}
        self.provider_by_agent: dict[str, str | None] = {}
        self.model_targets = model_targets or {}
        self._requested_models: dict[str, str] = {}
        self._cost_by_agent: dict[str, float | None] = {}
        self.capture_calls = capture_calls
        self.max_text_chars = max_text_chars
        # Chronological LLM call records for the trace waterfall.
        self.calls: list[dict[str, Any]] = []
        self._pending_starts: dict[tuple[str, str], tuple[float, str | None]] = {}

    @staticmethod
    def _ctx_key(callback_context: Any) -> tuple[str, str]:
        # before/after callbacks receive distinct context objects; key by
        # stable identifiers instead of object identity.
        return (
            str(getattr(callback_context, "invocation_id", "") or ""),
            str(getattr(callback_context, "agent_name", "") or ""),
        )

    @staticmethod
    def _contents_to_text(contents: Any) -> str | None:
        """Flatten genai contents/parts into readable prompt text."""
        if contents is None:
            return None
        if isinstance(contents, str):
            return contents
        chunks: list[str] = []
        items = contents if isinstance(contents, (list, tuple)) else [contents]
        for item in items:
            role = getattr(item, "role", None)
            parts = getattr(item, "parts", None)
            if parts:
                for part in parts:
                    text = getattr(part, "text", None)
                    if text:
                        chunks.append(f"[{role}] {text}" if role else str(text))
            elif isinstance(item, str):
                chunks.append(item)
        return "\n".join(chunks) if chunks else None

    async def before_model_callback(self, *, callback_context: Any, llm_request: Any) -> None:
        # Inject a bounded per-call timeout + exponential-backoff retry on every
        # model invocation. The whole-run budget stays run_timeout_seconds; this
        # protects individual Gemini calls from hangs/transient 5xx without an
        # explicit retry loop (the genai SDK applies http_options natively).
        _apply_call_resilience(llm_request)
        agent = getattr(callback_context, "agent_name", None) or "unknown"
        requested_model = getattr(llm_request, "model", None)
        if requested_model:
            self._requested_models[agent] = str(requested_model)

        if not self.capture_calls:
            return None
        import time as _time

        prompt = self._contents_to_text(getattr(llm_request, "contents", None))
        system = getattr(getattr(llm_request, "config", None), "system_instruction", None)
        if system and prompt:
            prompt = f"[system] {system}\n{prompt}"
        elif system:
            prompt = f"[system] {system}"
        self._pending_starts[self._ctx_key(callback_context)] = (
            _time.time(),
            (prompt or "")[: self.max_text_chars] or None,
        )
        return None

    async def after_model_callback(
        self, *, callback_context: Any, llm_response: Any
    ) -> None:
        usage = getattr(llm_response, "usage_metadata", None)
        if not usage:
            return None
        agent = getattr(callback_context, "agent_name", None) or "unknown"
        row = self.usage_by_agent[agent]
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        thinking_tokens = int(getattr(usage, "thoughts_token_count", 0) or 0)
        row["prompt_tokens"] += prompt_tokens
        row["completion_tokens"] += completion_tokens
        row["thinking_tokens"] += thinking_tokens
        row["total_tokens"] += int(getattr(usage, "total_token_count", 0) or 0)
        row["calls"] += 1
        response_model = getattr(llm_response, "model_version", None)
        target = self.model_targets.get(agent)
        provider = target[0] if target else None
        # Configured hosted identity wins: responses often name the base vendor.
        # Native responses retain exact versions when those have different prices.
        model = (
            (str(response_model) if response_model else target[1])
            if target and provider in _NATIVE_PROVIDERS
            else target[1] if target else self._requested_models.get(agent)
            or (str(response_model) if response_model else None)
        )
        if model:
            self.model_by_agent[agent] = model
        self.provider_by_agent[agent] = provider
        cost = estimate_cost_usd(model, prompt_tokens, completion_tokens + thinking_tokens, provider)
        previous_cost = self._cost_by_agent.get(agent, 0.0)
        self._cost_by_agent[agent] = (
            previous_cost + cost if previous_cost is not None and cost is not None else None
        )

        if self.capture_calls:
            import time as _time

            started_at, prompt_text = self._pending_starts.pop(
                self._ctx_key(callback_context), (None, None)
            )
            completion = None
            content = getattr(llm_response, "content", None)
            parts = getattr(content, "parts", None)
            if parts:
                texts = [getattr(pt, "text", None) for pt in parts]
                completion = "\n".join(t for t in texts if t) or None
            pricing_status = "priced" if cost is not None else "unpriced"
            self.calls.append(
                {
                    "agent": agent,
                    "model": model,
                    "provider": provider,
                    "prompt_text": prompt_text,
                    "completion_text": (completion or "")[: self.max_text_chars] or None,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "thinking_tokens": thinking_tokens,
                    "total_tokens": int(getattr(usage, "total_token_count", 0) or 0),
                    "cost_usd": cost,
                    "pricing_status": pricing_status,
                    "latency_ms": int((_time.time() - started_at) * 1000) if started_at else None,
                    # Absolute wall-clock start so the trace tree can order llm
                    # and tool child-spans chronologically within a node.
                    "started_wall": started_at,
                }
            )
        return None

    def usage_with_cost(self, fallback_model: str | None = None) -> dict[str, dict[str, Any]]:
        """Per-agent usage rows with cost estimates attached."""
        out: dict[str, dict[str, Any]] = {}
        for agent, row in self.usage_by_agent.items():
            model = self.model_by_agent.get(agent)
            if agent not in self._cost_by_agent:
                target = self.model_targets.get(agent)
                model = model or (target[1] if target else fallback_model)
            target = self.model_targets.get(agent)
            provider = self.provider_by_agent.get(agent) or (target[0] if target else None)
            if agent in self._cost_by_agent:
                cost = self._cost_by_agent[agent]
            else:
                # Compatibility for externally supplied usage with no callbacks.
                output_tokens = row["completion_tokens"] + row.get("thinking_tokens", 0)
                cost = estimate_cost_usd(model, row["prompt_tokens"], output_tokens, provider)
            entry: dict[str, Any] = {
                **row,
                "model": model,
                "provider": provider,
                "cost_usd": round(cost, 6) if cost is not None else None,
                "pricing_status": "priced" if cost is not None else "unpriced",
            }
            out[agent] = entry
        return out
