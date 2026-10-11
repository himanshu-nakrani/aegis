# Provider-aware cost estimates

Aegis resolves token rates using the actual billing provider and model, not the OpenAI-compatible transport or a vendor name inside a hosted model ID. Google/Gemini, OpenAI, Anthropic, Fireworks, OpenRouter, Featherless, and Vercel AI Gateway all resolve to either a token rate or an explicit **unpriced** state.

## Rate source

Pricing reads LiteLLM's packaged `model_prices_and_context_window_backup.json` once per process. It does not fetch a remote catalog or import LiteLLM's network-backed catalog loader. Upgrading LiteLLM updates the bundled snapshot; restarting Aegis picks it up. Resolved rates and missing rates are cached. Native model families missing a catalog entry can use the maintained fallback table in `backend/app/services/token_tracker.py`; only exact family names and recognized dated/versioned aliases match. Catalog entries take precedence over fallback families.

Hosted IDs are looked up only in their provider's namespace:

- Fireworks: `fireworks_ai/accounts/fireworks/models/<model>`; short model names resolve under the same Fireworks account namespace.
- OpenRouter: `openrouter/<vendor>/<model>`.
- Featherless: `featherless_ai/<organization>/<model>`, even though calls use the OpenAI-compatible transport.
- Vercel: `vercel_ai_gateway/<vendor>/<model>`, not the base vendor's rate.

An entry without both input and output token rates is unpriced, not free. Featherless's bundled entries may contain capabilities without token rates; subscription costs cannot honestly be inferred as per-token costs. Unknown models and missing hosted rates likewise stay unpriced. Explicit zero rates in a priced catalog entry remain zero.

## Usage contract

`estimate_cost_usd(model, prompt_tokens, completion_tokens, provider=None)` returns a USD estimate or `None`. Passing the billing provider is required for ambiguous OpenAI-compatible hosted routes. Native and fully qualified routing IDs can infer their provider.

The compiler supplies resolved billing targets to `TokenTrackerPlugin`. Every usage row includes `provider`, `model`, `cost_usd` (number or `null`) and `pricing_status` (`priced` or `unpriced`). Calls with missing response model IDs retain the requested target. Thinking tokens use the output rate. Each call is priced before aggregation so a sequence of short requests does not accidentally trigger a long-context rate; supported catalog context tiers use the request's prompt size.

If any contributing model call is unpriced, its aggregate cost is `null`, not a partial sum masquerading as a complete bill. Token counts remain available. Cost displays use an em dash for unknown estimates; this is distinct from a claim that usage was free. These are token-rate estimates, not provider invoices: cache discounts, multimodal input rates, gateway fees, subscriptions and negotiated rates are not inferred from unavailable billing metadata.
