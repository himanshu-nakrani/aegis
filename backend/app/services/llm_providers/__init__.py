"""Provider-neutral model resolution and invocation.

This is the single seam every LLM call in Aegis routes through. A node's data
(``provider`` / ``model`` / ``credentialId`` / ``credentialName``) plus the live
run ``context_ref`` (for the owning ``_user_id``) resolve to a
:class:`ProviderModel`, which is then either:

* handed to a ``google.adk`` ``Agent`` via :func:`build_adk_model` (a Gemini
  model string, or a ``LiteLlm`` wrapper for any other provider), or
* invoked directly for one-shot text / structured-output calls via
  :func:`generate_text` / :func:`generate_structured` (Gemini uses
  ``google-genai`` natively; everything else uses ``litellm``).

Google/Gemini remains the default so existing Gemini-only workflows are
unaffected. Non-Google providers pull their API key from a bound credential
(``config.api_key`` / optional ``config.base_url``), falling back to the
provider's environment variable.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, TypeVar
from uuid import UUID

from pydantic import BaseModel

from app.config import settings
from app.services.llm_providers.registry import (
    CREDENTIAL_PROVIDER_IDS,
    PROVIDERS,
    ProviderSpec,
    get_spec,
    is_google,
)

logger = logging.getLogger("aegis.llm_providers")

_TModel = TypeVar("_TModel", bound=BaseModel)

__all__ = [
    "ProviderModel",
    "resolve_provider_model",
    "build_adk_model",
    "generate_text",
    "generate_structured",
    "api_key_available",
    "CREDENTIAL_PROVIDER_IDS",
    "PROVIDERS",
]


@dataclass(frozen=True)
class ProviderModel:
    """A fully resolved model target ready to invoke."""

    provider: str
    model: str
    api_key: str | None = None
    api_base: str | None = None

    @property
    def is_google(self) -> bool:
        return is_google(self.provider)

    @property
    def spec(self) -> ProviderSpec:
        return get_spec(self.provider)

    @property
    def litellm_model(self) -> str:
        """The ``litellm`` model string for non-Google providers."""
        spec = self.spec
        if spec.openai_compatible:
            return f"openai/{self.model}"
        if spec.litellm_prefix:
            return f"{spec.litellm_prefix}/{self.model}"
        return self.model


# ---------------------------------------------------------------------------
# Credential + node-data resolution
# ---------------------------------------------------------------------------


def _load_credential_config(
    user_id: str | None,
    credential_id: str | None,
    credential_name: str | None,
) -> dict[str, Any]:
    """Decrypted credential config for a bound provider key. Empty when absent."""
    if not user_id or not (credential_id or credential_name):
        return {}
    # Imported lazily to avoid a circular import at module load (credentials ->
    # crypto -> config are cheap, but keep the DB session local to call time).
    from app.db.database import SessionLocal
    from app.services.credentials import get_user_credential, resolve_credential

    db = SessionLocal()
    try:
        cred = get_user_credential(
            db,
            UUID(str(user_id)),
            credential_id=UUID(str(credential_id)) if credential_id else None,
            name=credential_name,
        )
        return resolve_credential(cred)
    except Exception as exc:  # noqa: BLE001 — a bad/absent credential must not crash the build
        logger.warning("Failed to load provider credential: %s", exc)
        return {}
    finally:
        db.close()


def resolve_provider_model(
    data: dict[str, Any] | None,
    context_ref: dict[str, Any] | None = None,
    *,
    provider_key: str = "provider",
    model_key: str = "model",
    credential_id_key: str = "credentialId",
    credential_name_key: str = "credentialName",
) -> ProviderModel:
    """Resolve node/config data into a concrete :class:`ProviderModel`.

    Defaults to the configured Gemini model when no provider is set or the
    provider is unknown, so Gemini-only graphs keep working untouched. The
    ``*_key`` overrides let callers reuse this for guardrail rules
    (``guardrail_provider`` / ``guardrail_model`` / ...).
    """
    data = data or {}
    provider = str(data.get(provider_key) or "google").strip().lower()
    if provider == "gemini":
        provider = "google"
    model = str(data.get(model_key) or "").strip()

    if provider == "google":
        return ProviderModel(provider="google", model=model or settings.gemini_model)

    if provider not in PROVIDERS:
        logger.warning("Unknown LLM provider %r; falling back to Gemini", provider)
        return ProviderModel(provider="google", model=settings.gemini_model)

    spec = PROVIDERS[provider]
    api_key: str | None = None
    api_base: str | None = None

    user_id = str(context_ref.get("_user_id")) if context_ref and context_ref.get("_user_id") else None
    cfg = _load_credential_config(
        user_id,
        data.get(credential_id_key),
        data.get(credential_name_key),
    )
    if cfg:
        api_key = (cfg.get("api_key") or "").strip() or None
        api_base = (cfg.get("base_url") or "").strip() or None

    if not api_key:
        # Env-var fallback sourced through Settings (config.py owns all env access).
        env_val = getattr(settings, spec.env_key.lower(), "") or ""
        api_key = env_val.strip() or None

    if not model:
        model = spec.default_models[0] if spec.default_models else ""

    return ProviderModel(
        provider=provider,
        model=model,
        api_key=api_key,
        api_base=api_base or spec.default_base_url,
    )


# ---------------------------------------------------------------------------
# ADK model construction
# ---------------------------------------------------------------------------


def build_adk_model(pm: ProviderModel) -> Any:
    """Return a value suitable for ``google.adk.Agent(model=...)``.

    Gemini stays a plain model string (native ADK path). Every other provider
    is wrapped in ADK's ``LiteLlm`` so the Runner is otherwise unchanged.
    """
    if pm.is_google:
        return pm.model
    from google.adk.models.lite_llm import LiteLlm

    kwargs: dict[str, Any] = {}
    if pm.api_key:
        kwargs["api_key"] = pm.api_key
    if pm.api_base:
        kwargs["api_base"] = pm.api_base
    return LiteLlm(model=pm.litellm_model, **kwargs)


def api_key_available(pm: ProviderModel) -> bool:
    """Whether the resolved provider has a usable API key configured."""
    if pm.is_google:
        return bool(settings.google_api_key)
    return bool(pm.api_key)


# ---------------------------------------------------------------------------
# Direct (one-shot) invocation
# ---------------------------------------------------------------------------


def _strip_json_fence(text: str) -> str:
    """Strip ```json fences some providers wrap structured output in."""
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1] if "\n" in stripped else stripped[3:]
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[:-3]
    return stripped.strip()


def _genai_client(pm: ProviderModel):
    from google import genai

    return genai.Client(api_key=pm.api_key or settings.google_api_key)


def generate_text(
    pm: ProviderModel,
    *,
    system_instruction: str,
    contents: str,
    extra_config: dict[str, Any] | None = None,
) -> str:
    """One-shot free-text generation across providers."""
    if pm.is_google:
        from google.genai import types

        config_kwargs: dict[str, Any] = {"system_instruction": system_instruction}
        if extra_config:
            config_kwargs.update(extra_config)
        response = _genai_client(pm).models.generate_content(
            model=pm.model,
            contents=str(contents),
            config=types.GenerateContentConfig(**config_kwargs),
        )
        return response.text or ""

    import litellm

    response = litellm.completion(
        model=pm.litellm_model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": str(contents)},
        ],
        api_key=pm.api_key,
        api_base=pm.api_base,
    )
    return response.choices[0].message.content or ""


def generate_structured(
    pm: ProviderModel,
    *,
    system_instruction: str,
    contents: str,
    schema: type[_TModel],
) -> _TModel:
    """One-shot structured (JSON) generation validated into ``schema``."""
    if pm.is_google:
        from google.genai import types

        response = _genai_client(pm).models.generate_content(
            model=pm.model,
            contents=str(contents),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
        return schema.model_validate_json(response.text or "{}")

    import litellm

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": str(contents)},
    ]
    try:
        response = litellm.completion(
            model=pm.litellm_model,
            messages=messages,
            api_key=pm.api_key,
            api_base=pm.api_base,
            response_format=schema,
        )
    except Exception:  # noqa: BLE001 — provider may reject json_schema; retry as json_object
        schema_hint = json.dumps(schema.model_json_schema())
        messages[0]["content"] = (
            f"{system_instruction}\n\nRespond with JSON matching this schema:\n{schema_hint}"
        )
        response = litellm.completion(
            model=pm.litellm_model,
            messages=messages,
            api_key=pm.api_key,
            api_base=pm.api_base,
            response_format={"type": "json_object"},
        )
    content = response.choices[0].message.content or "{}"
    return schema.model_validate_json(_strip_json_fence(content))
