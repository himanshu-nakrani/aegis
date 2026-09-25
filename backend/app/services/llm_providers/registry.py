"""Static catalog of the LLM providers Aegis can route to.

Each :class:`ProviderSpec` maps an Aegis provider id (also the credential
``type`` for non-Google providers) to the information the resolver needs to
build a concrete model call: the LiteLLM routing prefix, the environment
variable used as an API-key fallback, an optional default base URL, and whether
the provider speaks the OpenAI-compatible wire protocol (in which case calls are
routed through LiteLLM's ``openai/<model>`` path against a custom ``api_base``).

Google/Gemini keeps its native ``google-genai`` path; every other provider is
dispatched through LiteLLM (directly, or via the ADK ``LiteLlm`` model wrapper).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    # LiteLLM provider prefix (e.g. "openai", "anthropic", "fireworks_ai",
    # "openrouter"). Empty for OpenAI-compatible providers that route through
    # the "openai/<model>" path against ``default_base_url``.
    litellm_prefix: str
    # Environment variable consulted for an API key when no credential is bound.
    env_key: str
    default_base_url: str | None = None
    # OpenAI-compatible HTTP surface -> route via "openai/<model>" + api_base.
    openai_compatible: bool = False
    default_models: tuple[str, ...] = field(default_factory=tuple)


GOOGLE = ProviderSpec(
    id="google",
    label="Google Gemini",
    litellm_prefix="",
    env_key="GOOGLE_API_KEY",
    default_models=(
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
    ),
)

PROVIDERS: dict[str, ProviderSpec] = {
    "google": GOOGLE,
    "openai": ProviderSpec(
        id="openai",
        label="OpenAI",
        litellm_prefix="openai",
        env_key="OPENAI_API_KEY",
        default_models=("gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"),
    ),
    "anthropic": ProviderSpec(
        id="anthropic",
        label="Anthropic",
        litellm_prefix="anthropic",
        env_key="ANTHROPIC_API_KEY",
        default_models=(
            "claude-sonnet-4-20250514",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
        ),
    ),
    "fireworks": ProviderSpec(
        id="fireworks",
        label="Fireworks AI",
        litellm_prefix="fireworks_ai",
        env_key="FIREWORKS_AI_API_KEY",
        default_models=(
            "accounts/fireworks/models/llama-v3p1-70b-instruct",
            "accounts/fireworks/models/qwen2p5-72b-instruct",
        ),
    ),
    "openrouter": ProviderSpec(
        id="openrouter",
        label="OpenRouter",
        litellm_prefix="openrouter",
        env_key="OPENROUTER_API_KEY",
        default_base_url="https://openrouter.ai/api/v1",
        default_models=(
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
            "meta-llama/llama-3.1-70b-instruct",
        ),
    ),
    "featherless": ProviderSpec(
        id="featherless",
        label="Featherless AI",
        litellm_prefix="",
        env_key="FEATHERLESS_API_KEY",
        default_base_url="https://api.featherless.ai/v1",
        openai_compatible=True,
        default_models=(
            "mistralai/Mistral-7B-Instruct-v0.3",
            "meta-llama/Meta-Llama-3.1-70B-Instruct",
        ),
    ),
    "vercel": ProviderSpec(
        id="vercel",
        label="Vercel AI Gateway",
        litellm_prefix="",
        env_key="AI_GATEWAY_API_KEY",
        default_base_url="https://ai-gateway.vercel.sh/v1",
        openai_compatible=True,
        default_models=(
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
        ),
    ),
}

# Provider ids that are backed by a stored Aegis credential (everything except
# Google, which uses the process-wide GOOGLE_API_KEY). This is the set exposed as
# credential ``type`` values and offered as provider options in the node UI.
CREDENTIAL_PROVIDER_IDS: tuple[str, ...] = tuple(
    pid for pid in PROVIDERS if pid != "google"
)


def is_google(provider: str | None) -> bool:
    return (provider or "google").strip().lower() in ("google", "gemini")


def get_spec(provider: str) -> ProviderSpec:
    key = (provider or "google").strip().lower()
    if key == "gemini":
        key = "google"
    return PROVIDERS.get(key, GOOGLE)
