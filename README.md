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
| `APP_ENCRYPTION_KEY` | Fernet key for credential secrets at rest — plaintext (with a warning) when unset |
| `APPROVAL_TIMEOUT_SECONDS` | How long a run may sit at a human-approval gate (default `3600`) |
| `RETENTION_ENABLED` / `RUN_RETENTION_DAYS` | Purge runs and their spans past N days (off by default, `90`) |
| `OTEL_*` | Optional trace export |
| `PRESIDIO_ENABLED` | Entity PII guardrails |
| `EXA_API_KEY` | Optional search provider |

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

Interactive OpenAPI: `/docs` when the backend is running.

---

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
- [ ] `CORS_ORIGINS` locked to your UI origin  
- [ ] Tracing / webhooks configured if you need them  

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
