/**
 * Turn a raw node/run error string into a concise, human headline plus the
 * original detail. Provider/runtime errors (LiteLLM, google-genai, HTTP) often
 * arrive as noisy one-liners like
 *   "litellm.BadRequestError: OpenAIException - You must be signed in..."
 * which read poorly in the run UI. We map the common failure classes to a clear
 * headline and keep the raw text available as collapsible detail.
 */
export interface ErrorSummary {
  /** Short, human-readable headline. */
  title: string;
  /** Cleaned original message, or null when it adds nothing over the title. */
  detail: string | null;
}

export function summarizeError(raw: string | null | undefined): ErrorSummary {
  const text = (raw ?? "").trim();
  if (!text) return { title: "Run failed", detail: null };

  // Strip the noisy library/exception prefixes so the detail reads cleanly.
  const cleaned = text
    .replace(/^litellm\.[A-Za-z]*Error:\s*/i, "")
    .replace(/^[A-Za-z]+Exception\s*[-:]\s*/i, "")
    .trim();

  const lower = text.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => lower.includes(n));

  let title: string;
  if (
    has(
      "must be signed in",
      "authenticationerror",
      "invalid api key",
      "invalid_api_key",
      "incorrect api key",
      "unauthorized",
      "no api key",
      "api key not",
      "401"
    )
  ) {
    title = "Authentication failed — check the model's credential / API key";
  } else if (has("ratelimit", "rate limit", "429", "quota", "insufficient_quota")) {
    title = "Rate limited or out of quota — try again shortly";
  } else if (
    has("notfounderror", "model_not_found", "does not exist", "not found", "404")
  ) {
    title = "Model not found for this provider — check the model id";
  } else if (has("timeout", "timed out")) {
    title = "The model request timed out";
  } else if (has("permission", "forbidden", "403")) {
    title = "Access denied by the provider";
  } else if (has("badrequesterror", "invalid request", "400")) {
    title = "The provider rejected the request";
  } else {
    const firstLine = cleaned.split("\n")[0].trim();
    title =
      firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine || "Run failed";
  }

  const detail = cleaned && cleaned !== title ? cleaned : null;
  return { title, detail };
}
