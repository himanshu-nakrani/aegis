<p align="center">
  <img src="docs/design/aegis-header.svg" alt="Aegis — Visual agent workbench" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml"><img src="https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/license-MIT-e3dfd3?labelColor=0e0d0b" alt="MIT" />
  <img src="https://img.shields.io/badge/Next.js-14-0e0d0b?labelColor=141311&color=e3dfd3" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-Python-0e0d0b?labelColor=141311&color=e3dfd3" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Gemini-ADK-0e0d0b?labelColor=141311&color=e3dfd3" alt="Gemini ADK" />
</p>

<p align="center">
  <strong>Visual agent development — with guardrails, evals, and ops built in.</strong><br />
  Design graph workflows on a canvas. Run them against real inputs. Measure quality. Ship with confidence.
</p>

---

Aegis is an **instrument for agent workflows** — not a chat wrapper. You compose nodes on a dark, dense canvas, promote versions into production, and triage failures like an ops console.

| Build | Run | Quality | Operate |
|:-----:|:---:|:-------:|:-------:|
| Visual graph canvas | Manual, webhook, cron | Evals + guardrails | Live triage & traces |
| Templates & versions | Human approval gates | Presets & thresholds | SSE + OpenTelemetry |
| Sub-workflows | Input schemas | Regression alerts | Failure clusters |

---

## Why Aegis

Most agent tools stop at “make a graph and hope.” Aegis closes the loop:

1. **Author** — React Flow canvas with agents, tools, routers, joins, code, integrations; per-node LLM provider/model selection  
2. **Harden** — Guardrail playground (rules, PII, injection) before nodes go live  
3. **Grade** — Multi-dimension LLM evals with presets and pass thresholds  
4. **Operate** — Observability triage: regressions, clusters, failed stream, all runs  
5. **Ship** — Version, publish, invoke the live graph via API  

The UI language is intentional: warm near-black, bone primary, monochrome chrome — **chroma reserved for status and data**.

---

## Quick start

**Prerequisites:** Node 20+, Python 3.12+, Docker (for Postgres), a [Google API key](https://ai.google.dev/) with Gemini access (the default provider — OpenAI, Anthropic, and other LiteLLM-routed providers are optional per-node).

```bash
git clone https://github.com/himanshu-nakrani/aegis.git
cd aegis
cp .env.example .env
# set GOOGLE_API_KEY (and DATABASE_URL if not using local Postgres)
```

**Database**

```bash
docker compose up -d postgres
# DATABASE_URL=postgresql://aegis:aegis@localhost:5432/aegis
```

**Backend** — http://127.0.0.1:8000

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend** — http://localhost:3000

```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install && npm run dev
```

**Health check**

```bash
curl -s http://127.0.0.1:8000/health | jq .
# expect status: ok, database_ok: true
```

API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## Product surface

```
┌─────────────────────────────────────────────────────────────┐
│  Workflows          Observability      Guardrails  Settings │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Workspace health · Continue building · Needs attention    │
│   Searchable workflow library       Pinned workflows       │
│   Drafts │ In review │ Live          Recent activity        │
│                                                             │
│   Canvas  ·  Inspector  ·  Run  ·  Versions  ·  Publish     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| Area | What you get |
|------|----------------|
| **Workflows** | Workspace health · resume cards · attention queue · searchable lifecycle library · pinned shortcuts · visual canvas · templates · version history |
| **Observability** | Live SSE · regression queue · failure clusters · failed/running stream · all runs |
| **Guardrails** | Policy playground — rules, Presidio PII, prompt injection, LLM classifier |
| **Settings** | API key · integration credentials · eval presets · alert rules · ops knobs |
| **Runs** | Detail view · comparison · feedback · trace deep-links |

The homepage keeps three compact recently opened or updated workflows within reach
and shows the six latest runs beside the library. The attention queue previews four
items; expand it to inspect all surfaced items. **Find workflow** jumps directly to
the library search, which supports clearing the query and resetting empty filters.
Library sorting is cached until workflow data changes, and search state stays local
to the library. Health and attention panels distinguish loading, unavailable, and
empty states; workflow navigation remains available when observability fails.
Pin shortcuts are stored locally in your browser.

---

## Architecture

```mermaid
flowchart LR
  UI[Next.js workbench] --> API[FastAPI]
  API --> Compiler[Graph compiler]
  API --> Executor[Run executor]
  API --> Scheduler[Cron worker]
  Compiler --> ADK[Google ADK]
  Executor --> ADK
  ADK --> LLM[Gemini + LiteLLM providers]
  Executor --> DB[(PostgreSQL)]
  Scheduler --> DB
  API --> Obs[Observability]
  Obs --> DB
  Executor -.-> OTLP[OTLP / traces]
```

Graphs live in Postgres. On run, the compiler validates the DAG and hands execution to **Google ADK**; each node's LLM provider resolves through `llm_providers` (Gemini natively, other providers via LiteLLM) while node events stream over SSE and quality signals update the ops surfaces.

| Layer | Stack |
|-------|--------|
| UI | Next.js 14 · React 18 · React Flow · TanStack Query · Tailwind |
| API | FastAPI · SQLAlchemy 2 · Alembic · Pydantic Settings |
| Runtime | Google ADK · Gemini native + LiteLLM (OpenAI, Anthropic, Fireworks, OpenRouter, Featherless, Vercel AI Gateway) |
| Data | PostgreSQL (SQLite for tests) |
| Telemetry | Structured logs · optional OpenTelemetry |

---

## Configuration

Minimal `.env`:

```bash
GOOGLE_API_KEY=your_google_api_key
DATABASE_URL=postgresql://aegis:aegis@localhost:5432/aegis
```

| Variable | Notes |
|----------|--------|
| `GOOGLE_API_KEY` | **Required** — Gemini (default provider) |
| `DATABASE_URL` | Postgres (or SQLite for quick local) |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `FIREWORKS_AI_API_KEY` · `OPENROUTER_API_KEY` · `FEATHERLESS_API_KEY` · `AI_GATEWAY_API_KEY` | Optional extra LLM providers — per-node selection; a bound credential overrides env |
| `AUTH_ENABLED` / `AEGIS_API_KEY` | Optional API-key auth (`X-Aegis-API-Key`) |
| `APP_ENCRYPTION_KEY` | Fernet key for credential secrets; required to issue deployment webhook signing secrets, which are never stored plaintext |
| `APPROVAL_TIMEOUT_SECONDS` | How long a run may sit at a human-approval gate (default `3600`) |
| `DEPLOYMENT_ENVIRONMENT` | `development` by default; set `production` to hard-block unavailable safety judges, including timeouts and unusable verdicts |
| `ONLINE_EVAL_SAMPLE_RATE` | Default `0.05`; Settings → Operational config persists an instance-wide override in `[0,1]`. `0` disables extra judge calls; workflows with inline eval are skipped |
| `RETENTION_ENABLED` / `RUN_RETENTION_DAYS` | Purge runs and their spans past N days (off by default, `90`) |
| `OTEL_*` | Optional trace export |
| `PRESIDIO_ENABLED` | Entity PII guardrails |
| `EXA_API_KEY` | Optional search provider |
| `MCP_STDIO_ENABLED` | Default `false`; enabling lets editor-managed MCP credentials execute trusted host commands via argv, not a shell |
| `MCP_ALLOWED_HOSTS` | Exact comma-separated hostnames/IPs trusted for private/local HTTP MCP endpoints; public endpoints still use DNS pinning |
| `MCP_TIMEOUT_SECONDS` | MCP initialize/discovery/call timeout, default `30`; redirects and compressed HTTP responses are rejected |

Full list: [`.env.example`](.env.example)  
Frontend: `NEXT_PUBLIC_API_URL` in `frontend/.env.local`

---

## Development

```bash
# Backend tests
cd backend && source .venv/bin/activate
DATABASE_URL=sqlite:///./test.db GOOGLE_API_KEY=test-key python -m pytest -q

# Frontend
cd frontend && npm run typecheck && npm run lint && npm run build
```

```bash
# Migrations
cd backend && alembic revision --autogenerate -m "msg" && alembic upgrade head
```

```
aegis/
├── backend/          # FastAPI · services · alembic · tests
├── frontend/         # Next.js App Router · canvas · ops UI
├── docs/             # Design notes & mockups
├── docker-compose.yml
└── .env.example
```

---

## API snapshot

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + DB + scheduler |
| `GET/POST` | `/api/workflows` | List / create graphs |
| `POST` | `/api/runs` | Start a run |
| `GET` | `/api/runs/{id}/stream` | Run SSE |
| `POST` | `/api/runs/{id}/approve` | Resume/deny a run paused at a human-approval gate |
| `GET` | `/api/observability/*` | Summary, quality, errors, stream |
| `GET` | `/api/meta/models` | LLM provider/model catalog for the node picker |
| `POST` | `/api/workflows/{id}/publish` | Promote a version |
| `POST/DELETE` | `/api/workflows/{id}/deploy/credentials/{invoke_key\|webhook_secret\|chat_token}` | Issue/rotate once or revoke deployment credentials |
| `POST` | `/v1/workflows/{id}/invoke` · `/v1/invoke` | Invoke the published version with scoped credentials |
| `POST` | `/v1/chat/session` · `/v1/chat/invoke` | Hosted chat: exchange a chat token for a session cookie, then invoke the pinned workflow |
| `POST` | `/api/datasets/{id}/import-csv` | Atomic CSV import (`csv_text`, maximum 500 rows / 2 MB text) |

Interactive OpenAPI: `/docs` when the backend is running.

---

## CI regression gate

`cli/` ships a small stdlib-only `aegis` CLI that drives the experiment gate
(`GET /api/experiments/{id}/gate`) so a pipeline can block a deploy on an eval
regression:

```bash
pip install ./cli          # or: PYTHONPATH=cli/src python -m aegis_cli …

aegis gate \
  --url https://your-aegis-api.example.com \
  --workflow <workflow-id> \
  --dataset <dataset-id> \
  --threshold 0.5          # max allowed drop in avg eval vs baseline
```

The command creates a `kind=regression` experiment (candidate = latest version,
baseline = previous; override with `--version`/`--baseline`), polls the gate,
prints the verdict, and exits `0` on pass, `1` on regression, `2` on
error/`not_applicable`. Auth: `--key` or `$AEGIS_API_KEY`, sent as
`X-Aegis-API-Key` (only needed when the server has `AUTH_ENABLED=true`).

A ready-made `workflow_dispatch` GitHub Action lives at
`.github/workflows/regression-gate.yml`; to gate in your own job, copy the
"Gate on regression experiment" step — it is just `pip install ./cli` plus
`aegis gate` with `secrets.AEGIS_API_KEY` in the environment.

## Deploy

| Piece | Typical host |
|-------|----------------|
| Frontend | Vercel (`frontend/` root) |
| Backend | Docker · Cloud Run · Railway · Fly |
| Database | Neon or any Postgres 16+ |

```bash
cd backend && docker build -t aegis-backend .
docker run -p 8000:8000 --env-file ../.env aegis-backend
```

**Before production**

- [ ] `GOOGLE_API_KEY` + production `DATABASE_URL`  
- [ ] `alembic upgrade head`  
- [ ] `AUTH_ENABLED=true` and a strong `AEGIS_API_KEY`  
- [ ] `DEPLOYMENT_ENVIRONMENT=production` and usable guardrail judge credentials
- [ ] `APP_ENCRYPTION_KEY` set before issuing webhook signing secrets
- [ ] `CORS_ORIGINS` locked to your UI origin  
- [ ] Tracing / webhooks configured if you need them  

### Published invocation credentials

Publish a version, then open **More actions → Deploy details** to issue a scoped invoke key or webhook signing secret. Credentials appear once; store them server-side. Repeated issuance rotates the value; revoke removes access. Publishing another version revokes both credentials. Existing publications require provisioning after migration. Invoke keys are hashed; webhook secrets are Fernet-encrypted. Account `X-Aegis-API-Key` authenticates management only, not invocation. The obsolete account-authenticated `/api/workflows/{id}/trigger` path has been removed.

Both invocation routes require `X-Aegis-Deployment-ID` and `X-Aegis-Version-ID`, plus either `X-Aegis-Invoke-Key` or signed-webhook headers. `/v1/invoke` also includes `workflow_id` in its JSON body. A supplied `version_id` must match the published target. Rate quotas use the authenticated deployment across both routes, not account-token headers.

For signed webhooks, concatenate UTF-8 `POST\n{request_path}\n{deployment_id}\n{version_id}\n{timestamp}\n{nonce}\n` with the **exact raw request body**. Set `X-Aegis-Signature` to `sha256=` followed by the hex HMAC-SHA256 digest using the deployment secret. Send `X-Aegis-Timestamp` as Unix seconds (within ±300 seconds) and `X-Aegis-Nonce` as a fresh URL-safe 16–128-character value. Reused nonces return HTTP 409. The Deploy sheet provides the target IDs and signing contract; do not put credentials in URLs or public embeds. The MCP tab remains a descriptor, not an MCP protocol server.

### Approval notifications and dataset recycling

Human Approval nodes accept an assignee, a positive escalation timeout, and optional bound Slack/email credentials. Parking sends `approval_requested` to the workflow webhook and selected channels; a still-pending gate sends one `approval_escalated` reminder. SMTP must actually be configured for email delivery. Delivery errors are recorded without secrets and never approve a run. Approval rows preserve metadata/status, but waits remain **in-process**: restarts and API/worker separation still require Phase 2 durable execution.

Experiments accepts CSV columns `input`, optional `expected_output`, and optional `metadata` (a JSON object). Quoted/multiline CSV is supported; any bad row rejects the whole import with row errors and imports no examples. Run Detail can add the viewed run or send negative feedback into a selected dataset; without a target, thumbs-down creates/reuses the workflow's **Negative feedback** dataset. Failure-cluster promotion copies only displayed members of the selected workflow. All copy actions dedupe by `source_run`, retain existing labels, and preserve observed output as provenance. Only completed-run copies use output as a default gold label; failed/negative examples remain unlabelled. Invalid dataset targets or runs without input return an explicit error rather than inventing training data.

Provider costs use the installed offline LiteLLM catalog with provider-scoped aliases and native fallbacks. Unknown or subscription-only rates remain `unpriced`/`null`, including mixed aggregate totals; the UI displays `—`, not zero. See [provider pricing](docs/provider-pricing.md) and the time-boxed [Agent Builder migration guide](docs/agent-builder-migration.md).

### Agent tool loops and MCP clients

Agent nodes can select builtin Tool declarations or discovered MCP tools. A builtin declaration is a normal canvas Tool node **without edges**; attach it in the agent inspector. Attached declarations are not standalone workflow steps, cannot be run-from-here targets, and may be shared by multiple agents. Connected Tool nodes retain their standalone behavior and cannot also be attached. Calculator, HTTP, Exa/DuckDuckGo search, and nested Gemini Google Search are supported. Builtin arguments are `{ "input": "..." }`; HTTP templates see this call's input through `{{input.text}}` and `{{last_output}}`, while retaining the run's steps/memory.

Stable agent configuration:

```json
{
  "tools": [
    { "kind": "node", "nodeId": "calculator", "requireApproval": true },
    { "kind": "mcp", "credentialId": "<owned-credential-UUID>", "toolName": "add" }
  ],
  "maxToolIterations": 8,
  "tokenBudget": 8192
}
```

`maxToolIterations` counts model responses containing tool calls; parallel calls in one response count as one round. `tokenBudget` cumulatively charges reported prompt, completion, and thinking usage across model calls, nested Google Search, and retry attempts. Missing usage fails the node rather than bypassing the budget. Actual prompt cost is known only after a model response, so that response can exceed the allocation, but no subsequent tools execute. Bound failures use the node's configured error branch; production unavailable-judge failures remain nonrecoverable. Whole-node retries stop after tool execution starts to prevent replaying external side effects. The configured node timeout pauses while queued for or waiting on approval.

Register named servers in **Settings → MCP servers**, then **Refresh tools** before attaching exact discovered names in the inspector. Credentials use `type: "mcp"` and either `{ "transport": "streamable_http", "url": "https://host/mcp", "headers": {} }` or `{ "transport": "stdio", "command": "...", "args": [], "env": {} }`. Config is immutable; replace the credential to change its connection. Nonempty environment/header values require `APP_ENCRYPTION_KEY`, are encrypted/masked, and are never copied into workflow JSON. Stdio inherits only the SDK's minimal safe environment plus explicit values. HTTP URL credentials, query strings, fragments, redirects, and compressed responses are rejected. Private endpoints require an exact deployment allowlist. Migration `019_mcp_tool_cache` stores public descriptors on each owner-scoped credential; live discovery revalidates the server before an agent offers tools. These are MCP clients, not the Phase 3 published-workflow MCP server.

MCP schemas are bounded and do not fetch remote references. Regex `pattern`/`patternProperties` support a deliberate linear subset: up to 200 characters of fixed literals/classes/dot/character-category atoms/anchors, or one whole-string-anchored repetition of one primitive atom; bounded repetitions are at most 1024. Groups, alternatives, lookaround, backreferences, flags, and multiple/unanchored repetitions are rejected explicitly. Common `^[A-Za-z0-9_-]+$` patterns work; unrestricted schema regexes do not. Tool/server errors fail the node rather than returning fake results.

Each tool invocation has its own trace span, including parallel repeated calls and failures/cancellation. `requireApproval` parks **before invocation** and shows tool arguments. Human/tool reviews serialize through one run-wide in-process gate. `POST /api/runs/{id}/approve` now requires `{ "approval_id": "<displayed-pending-UUID>", "approved": true, "comment": "..." }`; stale/mismatched IDs return HTTP 409 and cannot approve the next call. Waits still require inline execution and are not durable across restarts.


---

## Contributing

1. Branch from `main`  
2. Prefer small, reviewable PRs  
3. Keep `pytest` and `npm run typecheck && npm run lint` green  
4. Describe *why*, not only *what*  

Issues and ideas welcome.

---

## License

[MIT](LICENSE) © Aegis Contributors

---

<p align="center">
  <sub>Build carefully. Measure always. Ship agents you can operate.</sub>
</p>
