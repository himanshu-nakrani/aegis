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
    "validate_provider_endpoints",
    "build_adk_model",
    "generate_text",
    "generate_structured",
    "api_key_available",
    "provider_env_var",
    "provider_configured",
    "model_catalog",
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
    # `modelProvider` is the legacy key from the earlier multi-provider work; read
    # it as a fallback so graphs authored against that convention keep resolving.
    provider_raw = data.get(provider_key)
    if not provider_raw and provider_key == "provider":
        provider_raw = data.get("modelProvider")
    provider = str(provider_raw or "google").strip().lower()
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
    bound_key: str | None = None
    if cfg:
        bound_key = (cfg.get("api_key") or "").strip() or None
        base_url = (cfg.get("base_url") or "").strip() or None
        if base_url:
            raise ValueError(
                f"Credential base_url for provider {provider!r} is not supported; "
                "configure the endpoint operator-side "
                f"(e.g. {provider.upper()}_API_BASE) instead."
            )

    api_key = bound_key
    if not api_key and spec.requires_key and spec.env_key:
        # Env-var fallback sourced through Settings (config.py owns all env access).
        env_val = getattr(settings, spec.env_key.lower(), "") or ""
        api_key = env_val.strip() or None
    # Custom endpoints are rejected outright for now. Resolve-time DNS checks
    # cannot survive the provider HTTP clients' redirect-following
    # (litellm/OpenAI default follow_redirects=True with no per-call
    # transport override), so a public caller-supplied base can still
    # redirect/rebind to metadata or loopback at request time. Until
    # per-request pinning exists, only operator-configured endpoints
    # (provider env var, e.g. OLLAMA_API_BASE for LAN Ollama) and spec
    # defaults are allowed. This still permits the documented flows:
    # default bases, env-configured bases, and the experiment matrix for
    # provider/model pairs (matrix api_base entries are rejected likewise).
    caller_base = (data.get("apiBase") or data.get("api_base") or "").strip() or None
    if caller_base:
        raise ValueError(
            f"Custom apiBase for provider {provider!r} is not supported; "
            "configure the endpoint operator-side "
            f"(e.g. {provider.upper()}_API_BASE) instead."
        )
    api_base: str | None = None
    env_base = getattr(settings, f"{provider}_api_base", "") or ""
    api_base = env_base.strip() or None

    if not model:
        model = spec.default_models[0] if spec.default_models else ""

    return ProviderModel(
        provider=provider,
        model=model,
        api_key=api_key,
        api_base=api_base or spec.default_base_url,
    )


def validate_provider_endpoints(
    graph_json: dict | None, context_ref: dict | None = None
) -> None:
    """DNS-level SSRF gate for provider endpoints in a graph (sync, network I/O).

    Call from synchronous request handlers (run-create, experiment-create)
    *before* the graph can execute: every non-Google LLM node's *resolved*
    ``api_base`` — node/matrix base, credential ``base_url``, env var, or spec
    default, exactly as :func:`resolve_provider_model` merges them — is
    checked. Keyed providers must resolve fully public; keyless providers
    (Ollama) get the metadata-only check so loopback/LAN bases keep working.
    Raises ``ValueError`` naming the node.

    This complements the format/pairing checks in
    :func:`resolve_provider_model` (which are network-free so the compiler can
    call them on the event loop). Resolution-time validation cannot stop DNS
    rebinding between check and connect, but it keeps private/metadata
    endpoints from ever reaching execution.
    """
    from app.services.workflow_capabilities import LLM_NODE_TYPES

    for node in (graph_json or {}).get("nodes", []) or []:
        data = node.get("data") or {}
        node_type = data.get("nodeType", "agent")
        targets: list[tuple[dict, dict]] = []
        if node_type in LLM_NODE_TYPES:
            targets.append((data, {}))
        if node_type == "guardrail":
            # Guardrail LLM judges resolve under guardrail_provider/
            # guardrail_model keys with their own apiBase (compiler.py).
            rules = data.get("rules", {}) or {}
            targets.append(
                (
                    {
                        **rules,
                        "credentialId": data.get("credentialId"),
                        "credentialName": data.get("credentialName"),
                    },
                    {"provider_key": "guardrail_provider", "model_key": "guardrail_model"},
                )
            )
        for target_data, key_overrides in targets:
            # Pairing/format violations raise here with a clear message and
            # propagate as the 400 — fail closed before any DNS check.
            pm = resolve_provider_model(target_data, context_ref, **key_overrides)
            if pm.is_google or not pm.api_base:
                continue
            try:
                check_provider_endpoint(pm)
            except ValueError as exc:
                raise ValueError(
                    f"Node '{node.get('id')}' apiBase for provider {pm.provider!r} is not allowed: {exc}"
                ) from exc

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
    if not pm.spec.requires_key:
        # Keyless providers (Ollama) are always ready to call.
        return True
    return bool(pm.api_key)

def provider_env_var(provider: str) -> str:
    """Conventional env var name for a provider's API key."""
    return get_spec(provider).env_key


def provider_configured(provider: str) -> bool:
    """Whether a provider's API key is set at the environment/settings level.

    Credential-bound keys are per-user and can't be checked here; this reflects
    only the process-wide fallback (used for graph capability gating and the
    model catalog's ``configured`` flag).
    """
    spec = get_spec(provider)
    if not spec.requires_key:
        return True
    return bool(getattr(settings, spec.env_key.lower(), ""))


def model_catalog() -> list[dict[str, Any]]:
    """Provider/model catalog for the UI picker (env-configured flags)."""
    catalog: list[dict[str, Any]] = []
    for pid, spec in PROVIDERS.items():
        catalog.append(
            {
                "provider": pid,
                "label": spec.label,
                "configured": provider_configured(pid),
                "default": spec.default_models[0] if spec.default_models else "",
                "models": list(spec.default_models),
                "needs_credential": pid in CREDENTIAL_PROVIDER_IDS,
                "has_base_url": spec.openai_compatible or spec.default_base_url is not None,
            }
        )
    return catalog


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


def check_provider_endpoint(pm: ProviderModel) -> None:
    """Keyless-aware DNS policy for a resolved provider endpoint.

    Keyed providers must resolve fully public. Keyless providers (Ollama)
    legitimately target loopback/LAN bases, so they resolve too but only
    link-local/metadata targets are refused — closing the DNS-alias bypass
    that hostname-only checks miss. Blocking I/O: threads/sync handlers only.
    """
    if pm.is_google or not pm.api_base:
        return
    from app.services.url_safety import validate_http_url, validate_lan_endpoint

    check = validate_lan_endpoint if not pm.spec.requires_key else validate_http_url
    try:
        check(pm.api_base)
    except ValueError as exc:
        raise ValueError(
            f"Provider {pm.provider!r} endpoint is not allowed: {exc}"
        ) from exc


def _require_public_endpoint(pm: ProviderModel) -> None:
    """DNS-level SSRF enforcement for direct provider calls.

    Every non-Google ``generate_*`` call funnels through here — playground,
    node-test, routers/classifiers/expression-agents, eval judges, guardrail
    judges — so this is the single choke point for the *resolved* endpoint
    (node/matrix base, credential ``base_url``, env var, or spec default).
    All callers run in worker threads or sync request handlers, never
    directly on the event loop, so blocking DNS resolution is safe.
    """
    check_provider_endpoint(pm)

def _usage_row_from_response(pm, response) -> dict[str, Any] | None:
    """Build a token-tracker-compatible usage row from a model response.

    Deferred evals and direct (non-ADK) LLM calls bypass the token plugin, so
    they capture usage here; the executor merges these rows into per-node
    totals. Returns None when the response carries no usage metadata.
    """
    usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
    if usage is None:
        return None
    from app.services.token_tracker import estimate_cost_usd

    if hasattr(usage, "prompt_token_count"):
        prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
        completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        thinking_tokens = int(getattr(usage, "thoughts_token_count", 0) or 0)
        total_tokens = int(getattr(usage, "total_token_count", 0) or 0)
        model = getattr(response, "model_version", None) or pm.model
    else:
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        thinking_tokens = 0
        total_tokens = int(getattr(usage, "total_tokens", 0) or prompt_tokens + completion_tokens)
        model = pm.model
    row: dict[str, Any] = {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "thinking_tokens": thinking_tokens,
        "total_tokens": total_tokens,
        "calls": 1,
        "model": str(model),
        "provider": pm.provider,
    }
    cost = estimate_cost_usd(str(model), prompt_tokens, completion_tokens + thinking_tokens, pm.provider)
    row["cost_usd"] = round(cost, 6) if cost is not None else None
    row["pricing_status"] = "priced" if cost is not None else "unpriced"
    return row


def generate_text(
    pm: ProviderModel,
    *,
    system_instruction: str,
    contents: str,
    extra_config: dict[str, Any] | None = None,
    on_usage: Any | None = None,
) -> str:
    """One-shot free-text generation across providers."""
    from app.services.tracing import model_call_span

    _require_public_endpoint(pm)
    with model_call_span(pm.provider, pm.model) as call:
        call.set_io(prompt=str(contents))
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
            call.set_usage_from(response)
            if on_usage is not None:
                row = _usage_row_from_response(pm, response)
                if row is not None:
                    on_usage(row)
            text = response.text or ""
            call.set_io(completion=text)
            return text

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
        call.set_usage_from(response)
        if on_usage is not None:
            row = _usage_row_from_response(pm, response)
            if row is not None:
                on_usage(row)
        text = response.choices[0].message.content or ""
        call.set_io(completion=text)
        return text


def generate_structured(
    pm: ProviderModel,
    *,
    system_instruction: str,
    contents: str,
    schema: type[_TModel],
    on_usage: Any | None = None,
) -> _TModel:
    """One-shot structured (JSON) generation validated into ``schema``."""
    from app.services.tracing import model_call_span

    _require_public_endpoint(pm)
    with model_call_span(pm.provider, pm.model) as call:
        call.set_io(prompt=str(contents))
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
            call.set_usage_from(response)
            if on_usage is not None:
                row = _usage_row_from_response(pm, response)
                if row is not None:
                    on_usage(row)
            call.set_io(completion=response.text or "")
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
        call.set_usage_from(response)
        if on_usage is not None:
            row = _usage_row_from_response(pm, response)
            if row is not None:
                on_usage(row)
        content = response.choices[0].message.content or "{}"
        call.set_io(completion=content)
        return schema.model_validate_json(_strip_json_fence(content))
