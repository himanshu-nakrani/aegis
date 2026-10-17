<p align="center">
  <img src="docs/design/aegis-header.svg" alt="Aegis — Visual agent workbench" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml"><img src="https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/license-MIT-e3dfd3?labelColor=0e0d0b" alt="MIT" />
  <img src="https://img.shields.io/badge/Next.js-14-0e0d0b?labelColor=141311&color=e3dfd3" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-Python-0e0d0b?labelColor=141311&color=e3dfd3" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Google_ADK-2.11-0e0d0b?labelColor=141311&color=e3dfd3" alt="Google ADK" />
</p>

<p align="center">
  <strong>Visual agent development — with guardrails, evals, and ops built in.</strong><br />
  Design graph workflows on a canvas. Run them against real inputs. Measure quality. Ship with confidence.
</p>

---

Aegis is an **instrument for agent workflows** — not a chat wrapper. You compose nodes on a dark, dense canvas, promote versions into production, and triage failures like an ops console.

| Build | Run | Quality | Operate |
|:-----:|:---:|:-------:|:-------:|
| Visual graph canvas | Inline & worker execution | Multi-dimension evals | Live triage & traces |
| Templates & versions | Durable runs & restart recovery | Guardrail policies (PII/rules) | SSE, OTLP & LangSmith |
| Prompt registry & playground | Database-backed approval gates | Tool-call & injection checks | Failure clusters & annotations |
| Sub-workflows & RAG v1 | Webhook, cron & MCP triggers | CI regression gate (`aegis gate`) | Cost breakdown & search |

---

## Why Aegis

Most agent tools stop at “make a graph and hope.” Aegis closes the loop:

1. **Author** — React Flow canvas with agents, tools, routers, joins, code, integrations, and RAG knowledge retrieval; per-node LLM provider/model selection (Gemini, OpenAI, Anthropic, Fireworks, OpenRouter, Featherless, Vercel AI Gateway, and local Ollama) plus a versioned prompt registry.
2. **Harden** — Guardrail playground (deterministic rules, Presidio PII, prompt injection, LLM classifier, and pre-execution tool-call guardrails) before nodes go live.
3. **Grade** — Multi-dimension LLM evals with presets, pass thresholds, RAG retrieval metrics, and matrix experiments across models and datasets.
4. **Operate** — Observability triage: regressions, clusters, failed stream, cross-run trace search, feedback annotation queue, and OTLP / LangSmith tracing.
5. **Ship & Deploy** — Version, publish, and invoke the live graph via scoped API keys, signed webhooks, hosted chat sessions, or as an MCP server. Durable checkpoints survive server restarts.

The UI language is intentional: warm near-black, bone primary, monochrome chrome — **chroma reserved for status and data**.

---

## Quick start

**Prerequisites:** Node 20+, Python 3.12+, Docker (for Postgres), a [Google API key](https://ai.google.dev/) with Gemini access (the default provider — OpenAI, Anthropic, Ollama, and LiteLLM providers are optional per-node).

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
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Workflows  Templates  Observability  Guardrails  Prompts  Playground  Creds ... │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   Workspace health · Continue building · Needs attention                        │
│   Searchable workflow library       Pinned shortcuts                            │
│   Drafts │ In review │ Live          Recent activity                            │
│                                                                                 │
│   Canvas  ·  Inspector  ·  Run  ·  Versions  ·  Deploy / Chat                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

| Area | What you get |
|------|----------------|
| **Workflows** | Workspace health · resume cards · attention queue · searchable lifecycle library · pinned shortcuts · visual canvas · templates · version history |
| **Templates** | Production-ready starter workflows · clone to workspace · eval presets |
| **Observability** | Live SSE · regression queue · failure clusters · cross-run trace search · feedback annotation queue · failed/running stream · all runs · cost breakdown |
| **Guardrails** | Policy playground — rules, Presidio PII, prompt injection, LLM classifier, tool-call frequency and parameter caps |
| **Prompts** | Versioned prompt registry · `promptRef` binding on agent nodes · prompt history & rollback |
| **Playground** | Ephemeral multi-model comparison playground · test prompts across providers before updating graphs |
| **Credentials** | Dedicated credentials management · provider API keys · integrations (Slack, Discord, Email, Postgres) · registered MCP servers |
| **Settings** | API key auth · eval presets · alert rules · operational knobs (online eval sampling, data retention) |
| **Runs** | Detail view · execution timeline · run comparison · feedback & dataset export · trace attempt counter & deep links |
| **Hosted Chat** | Dedicated `/chat/[deploymentId]` chat view · token-authenticated sessions · embeddable iframe with cookie fallback |

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
  UI[Next.js workbench] --> API[FastAPI backend]
  API --> Compiler[Graph compiler]
  API --> Executor[Run executor]
  API --> Scheduler[Cron worker]
  API --> MCPServer[Published MCP server /mcp]
  Compiler --> ADK[Google ADK 2.11]
  Executor --> ADK
  ADK --> LLM[Gemini native + LiteLLM + Ollama]
  ADK --> MCPClient[MCP client - stdio / HTTP]
  Executor --> DB[(PostgreSQL / SQLite)]
  Executor --> Checkpoints[(Run checkpoints)]
  Scheduler --> DB
  API --> Obs[Observability & traces]
  Obs --> DB
  Executor -.-> OTLP[OTLP / OpenTelemetry]
  Executor -.-> LangSmith[LangSmith OTLP export]
  Worker[Worker process worker.py] -.-> DB
  Worker -.-> Executor
```

Graphs live in Postgres. On run, the compiler validates the DAG and hands execution to **Google ADK 2.11**; each node's LLM provider resolves through `llm_providers` (Gemini natively, other providers via LiteLLM, or local keyless Ollama) while node events stream over SSE and quality signals update the ops surfaces.

| Layer | Stack |
|-------|--------|
| UI | Next.js 14 · React 18 · React Flow · TanStack Query · Tailwind · Lucide |
| API | FastAPI · SQLAlchemy 2 · Alembic · Pydantic Settings · Starlette |
| Runtime | Google ADK 2.11 · Gemini native + LiteLLM (OpenAI, Anthropic, Fireworks, OpenRouter, Featherless, Vercel AI Gateway) + local Ollama |
| Execution modes | `inline` (in API process) or `worker` (`worker.py` headless daemon via DB poll & advisory locks) |
| Durability | Database checkpoints (`run_checkpoints`), restart recovery frontier re-wiring, database-backed `approval_requests` |
| Data & Vectors | PostgreSQL (SQLite for local/tests) · Vector retrieval: `auto` (pgvector on Postgres, sqlite-vec on SQLite, JSON fallback) |
| Telemetry | Structured logs · OpenTelemetry (OTLP) · LangSmith OTLP export with deep secret sanitization |
| Integrations | MCP client (stdio & Streamable HTTP) · Published workflow MCP server (`/mcp`) · Slack · Discord · Email · Postgres |

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
| `DATABASE_URL` | Postgres (or SQLite for quick local dev) |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `FIREWORKS_AI_API_KEY` · `OPENROUTER_API_KEY` · `FEATHERLESS_API_KEY` · `AI_GATEWAY_API_KEY` | Optional extra LLM providers — per-node selection; a bound credential overrides env |
| `OLLAMA_API_BASE` | Local or remote keyless Ollama base URL (default `http://localhost:11434`) |
| `AUTH_ENABLED` / `AEGIS_API_KEY` | Optional API-key auth (`X-Aegis-API-Key`) |
| `APP_ENCRYPTION_KEY` | Fernet key for credential secrets, MCP headers/env, and deployment webhook signing secrets |
| `RUN_EXECUTION_MODE` | `inline` (default) to run in the API process, or `worker` for external `worker.py` processing |
| `RUN_WORKER_POLL_SECONDS` | Poll frequency when running in `worker` mode (default `2`) |
| `APPROVAL_TIMEOUT_SECONDS` | How long a run may sit at a human-approval gate (default `3600`) |
| `RESUME_RUNS_ON_BOOT` / `RESUME_MAX_ATTEMPTS` | Resume interrupted runs from checkpoints on startup (default `true`, max `3` attempts before failing stale runs) |
| `EVENT_BUS_NOTIFY_ENABLED` / `EVENT_BUS_POLL_SECONDS` | Postgres `LISTEN`/`NOTIFY` cross-process event delivery and polling safety net (default `true`, `30`) |
| `DEPLOYMENT_ENVIRONMENT` | `development` by default; set `production` to hard-block unavailable safety judges, timeouts, and unusable verdicts |
| `ONLINE_EVAL_SAMPLE_RATE` | Default `0.05`; Settings → Operational config persists an instance-wide override in `[0,1]`. `0` disables extra judge calls |
| `RETENTION_ENABLED` / `RUN_RETENTION_DAYS` | Purge runs and their spans past N days (off by default, `90`) |
| `VECTOR_STORE` / `PGVECTOR_ENABLED` | Vector store backend (`auto`, `pgvector`, `sqlite_vec`, `none`); `auto` selects pgvector on Postgres, sqlite-vec on SQLite, or JSON fallback |
| `OTEL_*` | Optional OpenTelemetry trace export (`OTEL_ENABLED`, `OTEL_EXPORTER_ENDPOINT`, `OTEL_EXPORTER_HEADERS`, `OTEL_UI_BASE_URL`) |
| `LANGSMITH_*` | Direct LangSmith OTLP export (`LANGSMITH_ENABLED`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_API_KEY`, `LANGSMITH_CAPTURE_CONTENT`) |
| `PRESIDIO_ENABLED` | Microsoft Presidio entity-based PII guardrails |
| `EXA_API_KEY` | Optional Exa search provider |
| `MCP_STDIO_ENABLED` | Default `false`; enabling lets editor-managed MCP credentials execute trusted host commands via argv, not a shell |
| `MCP_ALLOWED_HOSTS` | Exact comma-separated hostnames/IPs trusted for private/local HTTP MCP endpoints; public endpoints use DNS pinning |
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
├── backend/          # FastAPI · services · alembic · tests · worker.py
├── frontend/         # Next.js App Router · canvas · ops UI · chat
├── cli/              # Aegis CLI (stdlib-only regression gate)
├── docs/             # Architecture, design notes & research
├── docker-compose.yml
└── .env.example
```

---

## API snapshot

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + DB + scheduler + LangSmith export status |
| `GET/POST` | `/api/workflows` | List / create graphs |
| `POST` | `/api/runs` | Start a run (inline execution or worker queue) |
| `GET` | `/api/runs/{id}/stream` | Run SSE (supports `?after_seq=` replay) |
| `POST` | `/api/runs/{id}/approve` | Resume/deny a run paused at a human-approval or tool gate (`approval_id` required) |
| `GET` | `/api/observability/*` | Summary, quality, errors, stream, costs, spans (`/spans`), annotation queue (`/annotations`) |
| `GET/POST` | `/api/prompts` · `/api/prompts/{id}/versions` | Versioned prompt registry & rollback |
| `POST` | `/api/playground/run` | Ephemeral multi-model prompt test run |
| `POST` | `/api/workflows/{id}/knowledge/upload` | Knowledge base document upload (PDF, DOCX, MD, TXT) and sentence chunking |
| `GET` | `/api/meta/models` | LLM provider/model catalog for the node picker |
| `POST` | `/api/workflows/{id}/publish` | Promote a version to live deployment |
| `POST/DELETE` | `/api/workflows/{id}/deploy/credentials/{invoke_key\|webhook_secret\|chat_token}` | Issue/rotate once or revoke deployment credentials |
| `POST` | `/v1/workflows/{id}/invoke` · `/v1/invoke` | Invoke the published version with scoped credentials |
| `POST` | `/v1/webhooks/{workflow_id}` | Inbound event webhook trigger (HMAC or token) |
| `POST` | `/v1/chat/session` · `/v1/chat/invoke` | Hosted chat: exchange a chat token for a session cookie, then invoke the pinned workflow |
| `POST` | `/mcp` · `/mcp/` | Published workflow MCP server (Streamable HTTP JSON-RPC) |
| `POST` | `/api/datasets/{id}/import-csv` | Atomic CSV import (`csv_text`, maximum 500 rows / 2 MB text) |
| `GET` | `/api/experiments/{id}/gate` | Evaluate CI regression gate verdict |

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

---

## Deploy

| Piece | Typical host |
|-------|----------------|
| Frontend | Vercel (`frontend/` root) |
| Backend | Docker · Cloud Run · Railway · Fly |
| Worker | Headless container running `python worker.py` |
| Database | Neon or any Postgres 16+ (with `pgvector` recommended) |

```bash
cd backend && docker build -t aegis-backend .
docker run -p 8000:8000 --env-file ../.env aegis-backend
```

**Before production**

- [ ] `GOOGLE_API_KEY` + production `DATABASE_URL`  
- [ ] `alembic upgrade head`  
- [ ] `AUTH_ENABLED=true` and a strong `AEGIS_API_KEY`  
- [ ] `DEPLOYMENT_ENVIRONMENT=production` and usable guardrail judge credentials  
- [ ] `APP_ENCRYPTION_KEY` set before issuing webhook signing secrets or storing MCP/integration credentials  
- [ ] `CORS_ORIGINS` locked to your UI origin  
- [ ] Tracing / LangSmith / webhooks configured if you need them  

---

### Published invocation credentials and hosted chat

Publish a version, then open **More actions → Deploy details** to issue a scoped invoke key, webhook signing secret, or chat token. Credentials appear once; store them server-side. Repeated issuance rotates the value; revoke removes access. Publishing another version revokes both credentials. Existing publications require provisioning after migration. Invoke keys are hashed; webhook secrets are Fernet-encrypted. Account `X-Aegis-API-Key` authenticates management only, not invocation.

Both invocation routes require `X-Aegis-Deployment-ID` and `X-Aegis-Version-ID`, plus either `X-Aegis-Invoke-Key` or signed-webhook headers. `/v1/invoke` also includes `workflow_id` in its JSON body. A supplied `version_id` must match the published target. Rate quotas use the authenticated deployment across both routes, not account-token headers.

For signed webhooks, concatenate UTF-8 `POST\n{request_path}\n{deployment_id}\n{version_id}\n{timestamp}\n{nonce}\n` with the **exact raw request body**. Set `X-Aegis-Signature` to `sha256=` followed by the hex HMAC-SHA256 digest using the deployment secret. Send `X-Aegis-Timestamp` as Unix seconds (within ±300 seconds) and `X-Aegis-Nonce` as a fresh URL-safe 16–128-character value. Reused nonces return HTTP 409.

Hosted chat (`/chat/[deploymentId]`) exchanges a scoped chat token for an HTTP-only session cookie (`/v1/chat/session`), bound to the deployment. The chat UI can run standalone or in an iframe with cookie fallback, calling `/v1/chat/invoke` to interact with the pinned workflow version.

---

### Durable execution, restarts, and database-backed approvals

Aegis implements durable execution with database-backed checkpoints and human approvals across process restarts and separate API/worker nodes.

1. **Checkpoints & Restart Recovery:**
   Every node execution records a row in `run_checkpoints` (`started` upon entry, `completed` with node output alongside `NodeResult`, or `skipped` for conditional branches). Checkpoints snapshot context state and pending memory writes. On application boot or worker recovery (`recover_stale_runs`), orphaned runs are re-queued. `compute_resume` identifies the uncompleted execution frontier and pins outputs from completed checkpoints. Graph execution rewires triggers into the frontier, restoring context and avoiding redundant node re-execution.

2. **Database-Backed Approval Gates & Notifications:**
   Human Approval nodes and pre-execution tool review gates persist their wait state in the `approval_requests` database table.
   - Wait state records assignee, positive escalation timeout, parked/approved/denied/timed_out status, resolution timestamps, and sanitized delivery diagnostics.
   - Parking dispatches `approval_requested` to the workflow webhook and bound Slack/email credentials (email requires SMTP configuration; delivery errors are recorded safely and never approve runs).
   - If the gate remains pending when `escalationTimeoutSeconds` elapses, a single `approval_escalated` reminder is sent without granting approval.
   - `wait_for_approval` anchors deadlines to `parked_at` (wall clock) and polls the database row every second, augmented by Postgres `LISTEN`/`NOTIFY` wake-ups.
   - Approvals are **durable across server restarts and worker/API separation**: decisions submitted to the API resolve waits executing in worker processes via atomic row compare-and-swap (CAS). If a server restarts while a run is waiting, the interrupted approval row is marked `cancelled` and the recovered run re-parks the node with a fresh approval request row.
   - `POST /api/runs/{id}/approve` requires `{ "approval_id": "<pending-UUID>", "approved": true, "comment": "..." }`. Stale or mismatched IDs return HTTP 409 and cannot approve subsequent calls.

3. **Durability vs. Exactly-Once Guarantees:**
   Database-backed durability guarantees that orchestrator state, approval records, and completed checkpoint outputs survive process restarts without losing workflow progress. However, **this is distinct from distributed exactly-once execution guarantees for external side effects**. If a node performs an external action (such as dispatching an un-idempotent HTTP request or publishing a message) and the system crashes before checkpoint commit, resumption executes from the frontier. Nodes with external side effects should be idempotent or use downstream deduplication keys.

---

### Knowledge Base & RAG v1

Aegis includes built-in RAG capabilities for document indexing and grounded retrieval:

- **Document Ingestion:** Upload PDF, DOCX, Markdown, or plain text documents in the workflow data panel. Files are chunked using sentence-aware boundary detection (800 characters, 120 character overlap) and tracked with source provenance and metadata.
- **Pluggable Vector Stores:** Configured via `VECTOR_STORE=auto|pgvector|sqlite_vec|none`. On PostgreSQL, `auto` uses `pgvector` with cosine distance indexes (`vector(768)`). On SQLite, `auto` utilizes `sqlite-vec` for native local KNN vector queries, falling back to JSON similarity search when extensions are unavailable.
- **Retrieval Nodes:** `kb_retrieve` nodes query indexed collections with top-k ranking, relevance thresholds, and formatted citation output for downstream LLM synthesis.

---

### Agent tool loops and MCP (client and server)

Agent nodes can select builtin Tool declarations or discovered tools from Model Context Protocol (MCP) servers.

- **MCP Client for Agents:**
  Agent nodes attach discovered tools from named MCP servers registered in **Settings → MCP servers**. Transports support `stdio` (launches local commands via argv without a shell, gated by `MCP_STDIO_ENABLED=true`) and `streamable_http` (HTTP endpoints with DNS pinning and private network host allowlists). Credentials are encrypted at rest with `APP_ENCRYPTION_KEY`. Tool schemas enforce bounded linear regex validation to protect against catastrophic backtracking.
- **Agent Configuration & Execution Budget:**
  Agent nodes configure attached tools, iteration limits, and cumulative token budgets:
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
  `maxToolIterations` (default 8) bounds model tool-call response cycles. `tokenBudget` (default 8192) tracks cumulative prompt, completion, and thinking tokens across iterations and search calls. Breaching either budget cleanly halts tool dispatch and follows configured node error branches. Tools with `requireApproval: true` serialize review through the database-backed approval gate prior to invocation.
- **Published Workflow MCP Server:**
  Aegis serves as an MCP server at `/mcp` and `/mcp/` using stateless Streamable HTTP. Published workflows are dynamically exposed as executable MCP tools. Requests authenticate via deployment credentials (`X-Aegis-Deployment-ID`, `X-Aegis-Version-ID`, and `X-Aegis-Invoke-Key` or HMAC signature) and execute through `invoke_and_wait`.

---

### Datasets, experiments, and annotation queue

- **Dataset CSV Import:** Experiments accepts CSV columns `input`, optional `expected_output`, and optional `metadata` (JSON object). Quoted/multiline CSV is supported; invalid rows reject the entire batch with row errors.
- **Feedback & Annotation Queue:** Thumbs-down ratings from users or operators enqueue runs into the annotation queue (`/observability`). Reviewers can inspect inputs, outputs, and execution traces, apply corrected gold labels, and promote them directly into evaluation datasets.
- **Cluster & Run Promotion:** Runs and failure cluster samples can be copied into target datasets, deduplicated by `source_run` with provenance preserved.
- **Provider Pricing:** Cost tracking uses an offline LiteLLM catalog with provider-scoped aliases. Unpriced or subscription models display `—` instead of false zero totals.

---

### Observability, Tracing, and LangSmith

Aegis provides deep operational visibility for production agent workflows:

- **OpenTelemetry (OTLP):** Export standard spans for workflow runs, node executions, and LLM calls to Jaeger, Langfuse, or any OTLP collector.
- **LangSmith Tracing:** Export every run and model call directly to LangSmith over OTLP (`LANGSMITH_ENABLED=true`).
  - **Privacy & Sanitization by Default:** Prompts, outputs, tool arguments, retrieved chunks, and error texts are stripped unless explicitly enabled via `LANGSMITH_CAPTURE_CONTENT=true`. Passwords, API keys, and bearer tokens are deeply redacted across nested JSON structures.
  - **Attempt Tracking:** Each run attempt is exported as a detached `workflow.run` root linked to the parent request context. Execution attempts across checkpoint resumes are tracked in `metrics_json.trace_attempts` and displayed in the UI badge.
  - **Graceful Worker Drain:** Both API and worker processes drain active executions and await span finalization before shutting down tracer providers.
- **Triage & Feedback Loops:** Observability surfaces include live SSE run streaming, failure cluster grouping, cross-run trace search (`/api/observability/spans`), and cost breakdowns per node and model.

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
