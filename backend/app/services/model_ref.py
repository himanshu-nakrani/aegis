"""Pluggable model-selection seam: per-node provider/model resolution.

Two tiers of model selection live here:

1. **Node-level (multi-provider)** — canvas LLM nodes may carry
   ``modelProvider``/``model`` in their graph data. :func:`node_ref` resolves
   those to a :class:`ModelRef`; :func:`adk_model` turns a ref into something
   ``google.adk.Agent`` accepts (a Gemini model string, or an ADK ``LiteLlm``
   wrapper for OpenAI/Anthropic via litellm); :func:`complete_text` runs one
   direct completion on any supported provider (genai for Gemini, litellm
   otherwise). Provider API keys come from env-level settings
   (``OPENAI_API_KEY`` / ``ANTHROPIC_API_KEY``), mirroring ``GOOGLE_API_KEY``.

2. **Judge/guardrail (Gemini-only callers)** — :func:`resolve_judge_model` /
   :func:`resolve_guardrail_model` feed eval.py / guardrail.py, which call
   ``genai.Client`` directly. Overrides naming a non-Google provider log and
   fall back to the configured Gemini model rather than break execution.

Unknown providers always degrade to Gemini; the Gemini path is never broken.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from app.config import settings

logger = logging.getLogger("aegis.model_ref")

# Providers runnable for canvas LLM nodes (node tier above).
SUPPORTED_PROVIDERS = ("google", "openai", "anthropic")

_PROVIDER_ALIASES = {"gemini": "google"}

_PROVIDER_SETTINGS_KEY = {
    "google": "google_api_key",
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
}

_PROVIDER_ENV_VAR = {
    "google": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}

_PROVIDER_LABELS = {
    "google": "Google Gemini",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
}

# Curated per-provider catalogs for the UI picker. Keep in sync with
# token_tracker.MODEL_PRICES_PER_MTOK so cost estimates resolve.
_OPENAI_MODELS = [
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "o4-mini",
]

_ANTHROPIC_MODELS = [
    "claude-opus-4-1",
    "claude-sonnet-4-5",
    "claude-sonnet-4-0",
    "claude-haiku-4-5",
    "claude-3-7-sonnet-latest",
    "claude-3-5-haiku-latest",
]

_GOOGLE_EXTRA_MODELS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
]


@dataclass(frozen=True)
class ModelRef:
    provider: str
    model: str

    @property
    def litellm_model(self) -> str:
        """litellm-style ``provider/model`` id (OpenAI/Anthropic paths)."""
        return f"{self.provider}/{self.model}"


def default_ref() -> ModelRef:
    return ModelRef(provider="google", model=settings.gemini_model)


def normalize_provider(provider: Any) -> str:
    """Canonical provider id; anything unrecognized collapses to google."""
    raw = str(provider or "").strip().lower()
    raw = _PROVIDER_ALIASES.get(raw, raw)
    return raw if raw in SUPPORTED_PROVIDERS else "google"


def provider_available(provider: str) -> bool:
    """True when the provider's API key is configured (env-level)."""
    key = _PROVIDER_SETTINGS_KEY.get(provider)
    return bool(key and getattr(settings, key, ""))


def provider_env_var(provider: str) -> str:
    return _PROVIDER_ENV_VAR.get(provider, "GOOGLE_API_KEY")


def model_catalog() -> list[dict[str, Any]]:
    """Per-provider model catalog for the UI, with key-configured flags.

    Unconfigured providers are included (flagged ``configured: False``) so the
    frontend can explain why a model is unavailable instead of hiding it.
    """
    google_models = [settings.gemini_model] + [
        m for m in _GOOGLE_EXTRA_MODELS if m != settings.gemini_model
    ]
    catalog = [
        {
            "provider": "google",
            "label": _PROVIDER_LABELS["google"],
            "configured": provider_available("google"),
            "default": settings.gemini_model,
            "models": google_models,
        },
        {
            "provider": "openai",
            "label": _PROVIDER_LABELS["openai"],
            "configured": provider_available("openai"),
            "default": _OPENAI_MODELS[0],
            "models": list(_OPENAI_MODELS),
        },
        {
            "provider": "anthropic",
            "label": _PROVIDER_LABELS["anthropic"],
            "configured": provider_available("anthropic"),
            "default": _ANTHROPIC_MODELS[0],
            "models": list(_ANTHROPIC_MODELS),
        },
    ]
    return catalog


def available_models() -> list[ModelRef]:
    """Models runnable right now: configured providers' catalogs (Gemini default first)."""
    refs: list[ModelRef] = []
    seen: set[tuple[str, str]] = set()

    def _add(ref: ModelRef) -> None:
        if (ref.provider, ref.model) not in seen:
            seen.add((ref.provider, ref.model))
            refs.append(ref)

    _add(default_ref())
    for entry in model_catalog():
        if not entry["configured"]:
            continue
        for model in entry["models"]:
            _add(ModelRef(provider=entry["provider"], model=model))
    return refs


def node_ref(data: dict | None) -> ModelRef:
    """Resolve a graph node's ``modelProvider``/``model`` data keys to a ModelRef.

    Absent or unrecognized values fall back to the default Gemini model, so
    graphs authored before multi-provider support keep running unchanged.
    """
    data = data or {}
    raw = str(data.get("modelProvider") or "").strip().lower()
    provider = _PROVIDER_ALIASES.get(raw, raw)
    model = str(data.get("model") or "").strip()
    if provider in {"openai", "anthropic"}:
        if model:
            return ModelRef(provider=provider, model=model)
        return default_ref()
    if provider in {"", "google"}:
        return ModelRef(provider="google", model=model or settings.gemini_model)
    # Unrecognized provider: run on the default Gemini model rather than fail.
    logger.warning(
        "Unknown model provider %r on node; falling back to Gemini",
        raw,
        extra={"requested_model": model, "provider": raw},
    )
    return default_ref()


def adk_model(ref: ModelRef) -> Any:
    """The ``model=`` argument for ``google.adk.Agent``.

    Gemini stays a plain model string (native ADK path, genai http_options
    resilience applies). OpenAI/Anthropic use ADK's LiteLlm wrapper; timeout and
    retry budget mirror node_llm_* settings since genai http_options do not
    apply on the litellm path.
    """
    if ref.provider == "google":
        return ref.model or settings.gemini_model
    from google.adk.models.lite_llm import LiteLlm

    return LiteLlm(
        model=ref.litellm_model,
        timeout=max(5, int(settings.node_llm_timeout_seconds or 60)),
        num_retries=max(0, int(settings.node_llm_max_retries or 0)),
        # Tolerate params a provider doesn't support (e.g. response_format on
        # some Anthropic models) instead of failing the call.
        drop_params=True,
    )


def strip_code_fences(text: str) -> str:
    """Strip code fences (```json ... ``` or ``` ... ```) from model output.

    Resilient to conversational preambles/trailers (common with Anthropic
    models when JSON mode is simulated via system prompts).
    """
    stripped = (text or "").strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", stripped, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return stripped


def complete_text(
    ref: ModelRef,
    *,
    system: str | None = None,
    prompt: str,
    schema: type | None = None,
) -> str:
    """One direct (non-streaming) completion on any supported provider.

    ``schema`` (a pydantic model class) requests JSON output: Gemini uses the
    native ``response_schema``; litellm providers get JSON-object mode plus a
    schema hint appended to the system prompt. Callers parse the text
    themselves (with :func:`strip_code_fences` when validating JSON).
    """
    if ref.provider == "google":
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.google_api_key)
        config_kwargs: dict[str, Any] = {}
        if system:
            config_kwargs["system_instruction"] = system
        if schema is not None:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = schema
        response = client.models.generate_content(
            model=ref.model or settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        return response.text or ""

    import litellm

    system_text = system or ""
    if schema is not None:
        try:
            schema_json = json.dumps(schema.model_json_schema(), default=str)
        except Exception:  # noqa: BLE001 — fall back to field names only
            schema_json = ", ".join(getattr(schema, "model_fields", {}) or {})
        system_text = (
            f"{system_text}\n\nRespond with JSON only, matching this schema:\n{schema_json}"
        ).strip()

    messages: list[dict[str, str]] = []
    if system_text:
        messages.append({"role": "system", "content": system_text})
    messages.append({"role": "user", "content": prompt})

    kwargs: dict[str, Any] = {
        "model": ref.litellm_model,
        "messages": messages,
        "timeout": max(5, int(settings.node_llm_timeout_seconds or 60)),
        "num_retries": max(0, int(settings.node_llm_max_retries or 0)),
        "drop_params": True,
    }
    key = getattr(settings, _PROVIDER_SETTINGS_KEY.get(ref.provider, ""), "")
    if key:
        kwargs["api_key"] = key
    if schema is not None:
        kwargs["response_format"] = {"type": "json_object"}
    response = litellm.completion(**kwargs)
    choice = response.choices[0]
    return getattr(choice.message, "content", None) or ""


def _coerce(override: dict | str | None) -> ModelRef | None:
    if override is None:
        return None
    if isinstance(override, str):
        model = override.strip()
        return ModelRef(provider="google", model=model) if model else None
    if isinstance(override, dict):
        model = str(override.get("model") or "").strip()
        provider = str(override.get("provider") or "google").strip().lower()
        if not model:
            return None
        return ModelRef(provider=_PROVIDER_ALIASES.get(provider, provider), model=model)
    return None


def resolve_model(override: dict | str | None = None) -> str:
    """Resolve a judge/guardrail override to a Gemini-path model string.

    These callers (eval.py / guardrail.py) talk to ``genai.Client`` directly, so
    non-Google providers log and fall back to the configured Gemini model
    rather than break execution. Node-level multi-provider selection lives in
    :func:`node_ref` / :func:`adk_model` instead.
    """
    ref = _coerce(override)
    if ref is None:
        return settings.gemini_model
    if ref.provider != "google":
        logger.warning(
            "Judge/guardrail model provider %r runs on the Gemini-only path; "
            "falling back to Gemini",
            ref.provider,
            extra={"requested_model": ref.model, "provider": ref.provider},
        )
        return settings.gemini_model
    return ref.model or settings.gemini_model


def resolve_judge_model(preset: dict | None = None) -> str:
    """Model for an LLM-as-judge eval. Reads an optional preset['judge_model']."""
    override = preset.get("judge_model") if isinstance(preset, dict) else None
    return resolve_model(override)


def resolve_guardrail_model(rules: dict | None = None) -> str:
    """Model for an LLM/injection/moderation guardrail. Reads rules['guardrail_model']."""
    override = rules.get("guardrail_model") if isinstance(rules, dict) else None
    return resolve_model(override)
