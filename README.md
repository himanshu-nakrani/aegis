# Aegis

[![CI](https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml/badge.svg)](https://github.com/himanshu-nakrani/aegis/actions/workflows/ci.yml)

Visual agent development platform with built-in evaluation, guardrails, and observability. Build graph-based LLM workflows on a canvas, run them against real inputs, and measure quality in production.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Development](#development)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Overview

Aegis is an end-to-end platform for designing, executing, and operating agent workflows:

- **Visual builder** — drag-and-drop canvas powered by React Flow
- **Execution engine** — compiles graphs to [Google ADK](https://google.github.io/adk-docs/) workflows
- **Quality layer** — LLM evaluation, guardrails, and regression detection
- **Operations** — observability dashboards, structured logging, OpenTelemetry tracing, and webhooks

The frontend talks to a FastAPI backend backed by PostgreSQL. Workflows support branching, parallel joins, knowledge retrieval, persistent memory, scheduled triggers, and human-in-the-loop approval.

## Features

### Visual Workflow Builder

- Node types: Agent, Tool, Router, Classifier, Join, If/Switch, Code, Evaluation, Guardrail, and more
- Flow control: conditional routing, parallel branches, sub-workflows, delays
- Data: knowledge-base retrieval, workflow memory, input schemas, field transforms
- Integrations: Slack, Discord, Email, Postgres
- Graph validation on save (DAG rules, single entry, reachability)
- Version history, duplication, import/export, and starter templates

### Evaluation & Guardrails

- Four-dimension LLM eval scores: faithfulness, helpfulness, relevance, toxicity
- Built-in and custom eval presets with configurable thresholds
- Guardrails: keyword blocklists, regex, max length, PII detection (Presidio), prompt-injection checks
- Per-run eval history, workflow quality views, and run comparison with score deltas

### Observability & Reliability

- Live observability dashboard with SSE stream updates
- Hourly rollup aggregates for fast quality and status metrics
- Structured JSON logging with `run_id`, `workflow_id`, and `node_id` correlation
- Optional OpenTelemetry export (Jaeger, LangFuse, Datadog, and other OTLP collectors)
- Webhook notifications on run completion
- Cron-based schedule triggers with DB-backed deduplication
- Concurrency limits and stale-run recovery on startup

### Developer Experience

- Split observability API (`/overview`, `/quality`, `/runs`) for efficient frontend loading
- TanStack Query on dashboard, observability, and settings pages
- Optional API-key auth for multi-tenant deployments
- 159+ backend tests, Alembic migrations, and GitHub Actions CI

## Architecture

```mermaid
flowchart LR
  subgraph Client
    UI[Next.js UI]
  end

  subgraph Backend
    API[FastAPI]
    Compiler[Graph Compiler]
    Executor[Run Executor]
    Scheduler[Cron Scheduler]
    Obs[Observability Service]
  end

  subgraph External
    Gemini[Google Gemini]
    ADK[Google ADK Runtime]
    DB[(PostgreSQL)]
    OTLP[OTLP Collector]
  end

  UI --> API
  API --> Compiler
  API --> Executor
  API --> Scheduler
  API --> Obs
  Compiler --> ADK
  Executor --> ADK
  Executor --> Gemini
  Executor --> DB
  Obs --> DB
  Scheduler --> DB
  Executor --> OTLP
```

**Request flow:** the UI saves workflow graphs to PostgreSQL. On run, the compiler validates and compiles the graph into an ADK workflow. The executor streams node events over SSE, persists results, updates rollups, and optionally exports traces.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 14, React 18, React Flow, TanStack Query, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic Settings |
| Database | PostgreSQL (Neon in production; SQLite in tests) |
| LLM | Google Gemini API |
| Execution | Google ADK 2.0 |
| Observability | OpenTelemetry, structured logging |
| CI | GitHub Actions (pytest + Next.js build) |

## Prerequisites

- **Node.js** 20+
- **Python** 3.12+
- **PostgreSQL** 16+ (or [Neon](https://neon.tech) for hosted)
- **Google API key** with Gemini access

Optional:

- [EXA API key](https://exa.ai) for EXA search tool nodes
- [Presidio](https://github.com/microsoft/presidio) + `en_core_web_sm` for entity-based PII detection
- OTLP-compatible trace backend (Jaeger, LangFuse, etc.)

## Getting Started

### 1. Clone and configure environment

```bash
git clone https://github.com/himanshu-nakrani/aegis.git
cd aegis
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
GOOGLE_API_KEY=your_google_api_key
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
```

### 2. Start PostgreSQL (local)

```bash
docker compose up -d postgres
```

Default local connection string:

```bash
DATABASE_URL=postgresql://aegis:aegis@localhost:5432/aegis
```

### 3. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API available at http://127.0.0.1:8000  
Interactive docs at http://127.0.0.1:8000/docs

### 4. Frontend setup

In a separate terminal:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

App available at http://localhost:3000

### 5. Verify

```bash
curl http://127.0.0.1:8000/health
```

Expected response includes `"status": "ok"` and `"database_ok": true`.

## Configuration

### Backend (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | Yes | — | Gemini API key |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Default Gemini model |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `AUTH_ENABLED` | No | `false` | Enable API-key authentication |
| `AEGIS_API_KEY` | If auth on | — | Shared API key for local/single-tenant use |
| `MAX_CONCURRENT_RUNS` | No | `5` | Global concurrent run limit |
| `SCHEDULE_ENABLED` | No | `true` | Enable cron schedule worker |
| `SCHEDULE_POLL_SECONDS` | No | `60` | Scheduler poll interval |
| `EXA_API_KEY` | No | — | EXA search provider |
| `OTEL_ENABLED` | No | `false` | Export traces via OTLP |
| `OTEL_EXPORTER_ENDPOINT` | If OTEL on | — | OTLP HTTP endpoint |
| `OTEL_UI_BASE_URL` | No | — | Trace UI link base (e.g. Jaeger) |
| `PRESIDIO_ENABLED` | No | `false` | Enable Presidio PII guardrails |

See [`.env.example`](.env.example) for the full list including LangFuse OTLP examples.

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |

### Authentication

When `AUTH_ENABLED=true`, set `AEGIS_API_KEY` in the backend and configure the same key in the frontend **Settings** page. Requests send the `X-Aegis-API-Key` header.

## Development

### Run tests

```bash
# Backend (uses SQLite)
cd backend
source .venv/bin/activate
DATABASE_URL=sqlite:///./test.db GOOGLE_API_KEY=test-key python -m pytest -q

# Frontend
cd frontend
npm run lint
npm run build
```

### Database migrations

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

### Bundle analysis

```bash
cd frontend
npm run analyze
```

### Search providers

| Provider | Configuration |
|----------|---------------|
| Google Search | Default (ADK + Gemini) |
| EXA | Set `EXA_API_KEY` |
| DuckDuckGo | No API key required |

## Project Structure

```
aegis/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI route modules
│   │   ├── db/            # SQLAlchemy models
│   │   ├── services/      # Compiler, executor, observability, scheduler
│   │   └── main.py
│   ├── alembic/           # Database migrations
│   ├── tests/             # Pytest suite
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── app/           # Next.js App Router pages
│       ├── components/    # UI and canvas components
│       └── lib/           # API client and utilities
├── docker-compose.yml     # Local PostgreSQL
├── .env.example
└── README.md
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health, DB status, scheduler, tracing |
| `GET /api/workflows` | List workflows |
| `POST /api/workflows` | Create workflow |
| `POST /api/runs` | Start a workflow run |
| `GET /api/runs/{id}/stream` | SSE run event stream |
| `GET /api/observability/summary` | Full observability snapshot |
| `GET /api/observability/overview` | Counts and scheduler status |
| `GET /api/observability/quality` | Eval and guardrail metrics |
| `GET /api/observability/stream` | SSE observability events |
| `GET /api/workflows/eval-snippets` | Batch eval history for dashboard |
| `GET /api/runs/{id}/export` | Export run as JSON |

Full interactive reference: http://127.0.0.1:8000/docs

## Deployment

| Component | Recommended target |
|-----------|-------------------|
| Frontend | [Vercel](https://vercel.com) (root directory: `frontend/`) |
| Backend | Docker / Cloud Run / Railway / Fly.io |
| Database | [Neon PostgreSQL](https://neon.tech) |

### Backend (Docker)

```bash
cd backend
docker build -t aegis-backend .
docker run -p 8000:8000 --env-file ../.env aegis-backend
```

### Frontend (Vercel)

1. Set the root directory to `frontend/`
2. Set `NEXT_PUBLIC_API_URL` to your deployed backend URL
3. Add your production origin to backend `CORS_ORIGINS`

### Production checklist

- [ ] `GOOGLE_API_KEY` and `DATABASE_URL` set
- [ ] `alembic upgrade head` run against production DB
- [ ] `AUTH_ENABLED=true` with a strong `AEGIS_API_KEY`
- [ ] `CORS_ORIGINS` restricted to your frontend domain
- [ ] `OTEL_ENABLED=true` if using a trace backend
- [ ] Webhook URLs validated before saving on workflows

## Contributing

1. Fork the repository and create a feature branch from `main`
2. Make changes with tests where applicable
3. Run `pytest` and `npm run build` locally
4. Open a pull request with a clear description of the change

Bug reports and feature requests are welcome via GitHub Issues.

## License

License not yet specified. Contact the repository owner for usage terms.