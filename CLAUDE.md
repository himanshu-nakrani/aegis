# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Aegis is

A visual agent-workflow workbench: users compose graph workflows (LLM agents, tools, routers, guardrails, evals) on a React Flow canvas, run them against real inputs via Google ADK (Gemini natively; OpenAI, Anthropic, and other providers through LiteLLM), and operate them through an observability/triage surface. Two apps in one repo: `backend/` (FastAPI, Python 3.12) and `frontend/` (Next.js 14 App Router, TypeScript).

## Commands

### Backend (from `backend/`, with `.venv` activated)

```bash
pip install -r requirements.txt
alembic upgrade head                          # schema is owned by Alembic
uvicorn app.main:app --reload --port 8000     # dev server

# Tests — SQLite + fake key, no external services needed
DATABASE_URL=sqlite:///./test.db GOOGLE_API_KEY=test-key python -m pytest -q

# Single file / single test
DATABASE_URL=sqlite:///./test.db GOOGLE_API_KEY=test-key python -m pytest tests/test_compiler.py -q
DATABASE_URL=sqlite:///./test.db GOOGLE_API_KEY=test-key python -m pytest -k "test_name" -q

# New migration (revision files are numbered: 001_..., 002_..., keep the sequence)
alembic revision --autogenerate -m "msg" && alembic upgrade head
```

There is no Python linter/formatter configured; match the existing style.

### Frontend (from `frontend/`)

```bash
npm run dev          # http://localhost:3000, needs NEXT_PUBLIC_API_URL in .env.local
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run build
```

There is no frontend test suite; `typecheck` + `lint` + `build` are the gate. CI
(`.github/workflows/ci.yml`) has three jobs: **backend** (`alembic upgrade head` against a fresh
SQLite DB, then pytest), **migrations-postgres** (`alembic upgrade head` against a fresh
`pgvector/pgvector:pg16` service container — SQLite accepts dialect-specific mistakes that Postgres
rejects, so migrations are gated on both), and **frontend** (`typecheck`, `lint`, `build`). Keep all
three green.

### Environment

`cp .env.example .env` at the repo root (backend config loads `.env` from `backend/` or the root via pydantic-settings in `app/config.py`). `GOOGLE_API_KEY` is required for real runs (Gemini is the default provider; other providers authenticate per-node via bound credentials or their own env keys — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.); `DATABASE_URL` defaults to SQLite for local dev, Postgres in production (`docker compose up -d postgres`). Frontend needs `frontend/.env.local` with `NEXT_PUBLIC_API_URL`. Health check: `curl http://127.0.0.1:8000/health`.

## Architecture

### Run pipeline (the core loop)

Workflow graphs are stored as JSON (`nodes` + `edges`) in Postgres. A run flows through:

1. `app/services/graph_validation.py` — validates the DAG (must be Trigger → … → End, acyclic, no orphan edges) before save or compile.
2. `app/services/compiler.py` — `compile_workflow()` translates graph JSON into a Google ADK `Workflow` (agents, join nodes, routed edges). Non-LLM node behaviors come from `_make_*_fn` factories in `app/services/node_handlers.py`.
3. `app/services/executor.py` — executes via the ADK `Runner`, persists each event to `run_events` (per-run seq) and fans out to SSE subscribers through the local `_RunEventBroker`; Postgres LISTEN/NOTIFY wakes remote processes (see `event_bus.py`). Applies guardrails/eval thresholds and records observability rollups.

Every LLM call routes through `app/services/llm_providers/`: a node's `provider`/`model`/`credentialId` resolves to a `ProviderModel` dispatched to native `google-genai` (Gemini, the default) or LiteLLM (OpenAI, Anthropic, Fireworks, OpenRouter, Featherless, Vercel AI Gateway, Ollama). Adding a provider means `llm_providers/registry.py` (canonical), credential types in `app/schemas/credential.py`, and `frontend/src/lib/llm-providers.ts`. Ollama is keyless (`requires_key=false`, no credential type): base URL resolves from node `apiBase` → `OLLAMA_API_BASE` → `http://localhost:11434`. Experiment model-matrix runs re-target LLM nodes per `{provider, model}` pair via `model_override` staged on `WorkflowRun.authoring_overrides_json` and applied by `run_authoring.apply_model_override` before compile.

### Node type system spans both apps

Adding or changing a node type touches a fixed set of files that must stay in sync:

- Backend: `app/services/node_registry.py` (canonical metadata, served to the UI), `node_handlers.py` (execution factory), `compiler.py` (wiring), `graph_validation.py` if it has structural rules.
- Frontend: `src/types/workflow.ts` (`NodeType` union + node data types), `src/lib/node-registry.ts` (labels/icons/categories), and the matching canvas component in `src/components/canvas/nodes/`.

### Schema and migrations

Alembic is the single source of schema truth — the app deliberately does **not** call `Base.metadata.create_all()` on startup; instead `app/services/startup.py` gates boot on the DB being at Alembic head (`migration_check_strict`). Tests are the exception: `tests/conftest.py` builds the schema with `create_all` under SQLite and stamps Alembic head to satisfy the gate. Use the `valid_graph()` helper from conftest to build test graphs that pass Trigger→End validation.

### Execution modes and cross-process transport

`RUN_EXECUTION_MODE=inline` (default) executes runs in the API process. `worker` mode has a separate `worker.py` process claim and execute runs — the API must not also start the run worker (split-brain double-claim). Run streams and approval waits are durable: `/stream` replays `run_events` + cross-process NOTIFY into the API's broker (reconnect via `?after_seq=`/`Last-Event-ID`), and `/approve` is a row CAS — the executor's `wait_for_approval` polls the `approval_requests` row every second (NOTIFY is a wake-up hint). Boot-time `recover_stale_runs` re-queues `running`/`awaiting_approval` orphans for checkpoint resume from `run_checkpoints` (`RESUME_RUNS_ON_BOOT`/`RESUME_MAX_ATTEMPTS`). Cross-process delivery applies only on Postgres; on SQLite everything stays in-process (the bus no-ops, approval waiters rely on the row poll).

### Backend layout

`app/api/*` routers (one per resource: workflows, runs, observability, credentials, guardrail_policies, assist, …) → `app/schemas/*` Pydantic models → `app/services/*` (all business logic, ~60 modules) → `app/db/models.py` (single SQLAlchemy models file). Assist actions are review-only: they return drafts/diffs (generate, suggest, explain, edit, compare, schema, draft-eval-suite) that the caller applies through the resource endpoints — they never mutate stored workflows, datasets, or presets. All settings live in `app/config.py` (`Settings`); never read env vars directly. Auth is optional API-key auth (`X-Aegis-API-Key`) with a read-only "viewer" role enforced by middleware in `app/main.py`; rate limits only apply when auth is enabled. Credential secrets are Fernet-encrypted when `APP_ENCRYPTION_KEY` is set, plaintext with a loud warning otherwise.

### Consumption surfaces (Phase 3)

Chat turns share context via `WorkflowContext.session_history` — invoked runs with the same `session_id` rehydrate prior inputs/outputs (staged on `run.metrics_json`, capped at 50 turns). Templates resolve `session.turns`/`session.last_output`/`session.N.field`. Invokes stream via `?stream=true` (SSE, same `id:`/`retry:` framing as `/runs/{id}/stream`); `wait` and `stream` are mutually exclusive. `/mcp` is a stateless Streamable-HTTP MCP server (low-level `mcp.server.Server` in `app/services/mcp_server.py`) exposing each published workflow as an `invoke_*` tool under deployment-key auth; `backend/mcp_stdio_entry.py` bridges stdio clients via `AEGIS_*` env vars. Hosted chat lives at `/chat/{deploymentId}?token=` — a scoped `chat_token` (`aegis_chat_`, 30d, revocable) is exchanged via `POST /v1/chat/session` for an httpOnly cookie; calls hit `POST /v1/chat/invoke` under an HMAC session token, and `?key=` (invoke key in URL) survives only as a self-hosted fallback. Shared invoke internals live in `app/services/invoke_runner.py`.

### Knowledge retrieval (Phase 4)

`kb_retrieve` pulls from `knowledge_documents` — uploaded files (`POST …/knowledge/upload`, PDF/DOCX/MD/TXT) are chunked (800/120) into rows carrying `source_*` provenance, so node output gains `citations[]` (rank, doc, source name, char span, score). Vector search dispatches on `settings.vector_store` (`auto|pgvector|sqlite_vec|none`) via `app/services/vector_stores.py`; the JSON `embedding` column is the universal fallback. UUID columns are always `sa.Uuid`/`Uuid` — see "Schema note".

### Schema note

Declare UUID columns as `sa.Uuid`/`Uuid`, never `sa.UUID()`: on SQLite `sa.UUID()` emits literal `UUID` DDL (NUMERIC affinity), which coerces all-digit UUID strings to integers. Revision 021 repairs existing SQLite DBs; the patched source revisions keep fresh builds correct.

### Annotation queue (Phase 5)

`annotation_tasks` (`app/api/annotation.py` + `app/services/annotation.py`) stages runs for human labels — thumbs-down feedback auto-enqueues (deduped per `user_id, run_id`), plus opt-in failed/low-eval capture and manual "queue for review". `POST /api/annotation/{id}/label` writes the label and applies `expected_output` through the shared `dataset_service.copy_runs` seam: a run already captured (e.g. the feedback row recorded on `task.dataset_item_id`) is labeled in place rather than duplicated in another dataset. The review surface is the "Review" view on the observability page (`components/observability/AnnotationQueue.tsx`).

### Moat additions (Phase 5)

- **Prompt registry + playground** — `prompts`/`prompt_versions` (`api/prompts.py`, `services/prompt_service.py`); agent nodes take `promptRef{prompt_id, version?}` resolved in the executor `_enrich_graph` step (inline `instruction` is the fallback). `POST /api/playground/run` runs a template against 1-N model targets ephemerally; `/prompts` + `/playground` pages.
- **Tool-call guardrails** — `guardrail_policies` `scope` (`model_io`/`tool_call`/`both`) + `tool_rule` caps live in `rules_json`; enforced in `trace_plugin.before_tool_callback` (block → ADK skips the tool, `blocked` RunSpan + policy event). Covers ADK agent tool calls only, not standalone tool nodes.
- **Trace search + inbound OTLP** — `GET /api/observability/spans` filters `run_spans`+`llm_calls` cross-run; `POST /v1/ingest/runs` auto-detects OTLP/GenAI envelopes (`services/otlp_ingest.py`, mapping table in its docstring).
- **Event triggers** — `workflow_schedules.workflow_id` unique constraint dropped (migration 026); cron list on the trigger node's `scheduleCrons`, sync keyed `(trigger_node_id, cron_expr)`. `POST /v1/webhooks/{workflow_id}` accepts `X-Aegis-Event-Token` or deployment-secret HMAC (+replay receipts); body → `input.event`/`input.body`. Slack mapper included, IMAP is a follow-on.
- **CLI + CI gate** — `cli/` (`aegis gate`, stdlib-only, exit 0/1/2) + `.github/workflows/regression-gate.yml`.
- **Matrix + Ollama** — experiments accept `models: [{provider, model, api_base?}]` → `summary.matrix`; `ollama` is a keyless LiteLLM provider (`OLLAMA_API_BASE`).
- **Eval-suite assist** — `POST /api/assist/draft-eval-suite` drafts dataset+preset for review (never auto-applies).

### Frontend layout

- All backend calls go through the typed client in `src/lib/api.ts` (single `request()` helper, `NEXT_PUBLIC_API_URL` base, auth headers from `src/lib/auth.ts`). Types live in `src/types/workflow.ts`.
- TanStack Query everywhere, with cache keys centralized in `src/lib/query-keys.ts` — add new keys there, don't inline them.
- SSE (run stream, observability stream) is proxied through Next route handlers under `src/app/api/*/stream/route.ts` rather than hitting the backend directly.
- The canvas lives in `src/components/canvas/` (React Flow via `@xyflow/react`): `WorkflowCanvas.tsx` orchestrates; node renderers in `nodes/`, run-mode UI in `run/`, toolbar/status chrome in `chrome/`.
- Stack: Tailwind v3 (not v4), shadcn/Radix primitives in `src/components/ui/`, framer-motion, sonner toasts.

## Conventions

- Commit messages follow conventional-commit style seen in history: `feat(canvas): …`, `fix(ui): …`, `test(mvp2): …`.
- Design language is deliberate: warm near-black surfaces, bone/monochrome chrome, with color reserved for status and data. Match the existing palette and density when touching UI; design specs and phase plans live in `docs/superpowers/`.
- Prefer small, reviewable changes; describe *why*, not only *what* (from the repo's contributing notes).
