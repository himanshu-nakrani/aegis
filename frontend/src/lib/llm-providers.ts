import type { ProviderId } from "@/types/workflow";

/**
 * Static catalog of LLM providers, the single source of truth for provider
 * dropdowns, model suggestions, and credential wiring across the inspector and
 * the settings credentials form. Kept in sync with the backend provider
 * registry: ids and default models mirror what the compiler resolves.
 */
export interface LlmProvider {
  id: ProviderId;
  label: string;
  /** Suggested model ids surfaced as a datalist; the field stays free-text. */
  defaultModels: string[];
  /** Whether a same-typed credential must be bound (google uses server env). */
  needsCredential: boolean;
  /** Whether the credential exposes an optional `base_url` config field. */
  hasBaseUrl: boolean;
}

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: "google",
    label: "Google Gemini",
    defaultModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    needsCredential: false,
    hasBaseUrl: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
    needsCredential: true,
    hasBaseUrl: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModels: [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    needsCredential: true,
    hasBaseUrl: false,
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    defaultModels: [
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
    ],
    needsCredential: true,
    hasBaseUrl: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModels: [
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    needsCredential: true,
    hasBaseUrl: true,
  },
  {
    id: "featherless",
    label: "Featherless AI",
    defaultModels: [
      "mistralai/Mistral-7B-Instruct-v0.3",
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
    ],
    needsCredential: true,
    hasBaseUrl: true,
  },
  {
    id: "vercel",
    label: "Vercel AI Gateway",
    defaultModels: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
    needsCredential: true,
    hasBaseUrl: true,
  },
];

const PROVIDERS_BY_ID: Record<string, LlmProvider> = Object.fromEntries(
  LLM_PROVIDERS.map((p) => [p.id, p])
);

export function getProvider(id: string | undefined): LlmProvider {
  return (id && PROVIDERS_BY_ID[id]) || LLM_PROVIDERS[0];
}
