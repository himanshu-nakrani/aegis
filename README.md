# Aegis

Visual agent development platform with built-in evaluation, guardrails, and observability.

## Stack

- **Frontend**: Next.js 14, React Flow, Tailwind
- **Backend**: FastAPI, SQLAlchemy, Alembic
- **Database**: Neon PostgreSQL (SQLite for tests)
- **LLM**: Google Gemini API
- **Execution**: Google ADK 2.0 graph workflows

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Required: GOOGLE_API_KEY, DATABASE_URL
```

### 2. Database

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### 3. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Features

### Visual Builder
- Agent, Tool (Calculator/Search), Evaluation, Guardrail nodes
- **Router** — conditional branching with labeled edges
- **Join** — merge parallel branches
- Graph validation on save (DAG, single entry, reachability)

### Evaluation & Guardrails
- 4-dimension eval scores (faithfulness, helpfulness, relevance, toxicity)
- Eval presets: RAG Quality, Support Tone, Code Safety
- Guardrails: keywords, regex, max length, PII detection
- Run comparison with eval deltas

### Observability
- Structured JSON logging (`run_id`, `workflow_id`, `node_id`)
- Observability dashboard (`/observability`)
- Run export as JSON
- Webhook notifications on run completion

### Templates & Versioning
- 3 starter templates (Research, Calculator, Support)
- Version history sidebar
- Duplicate workflows

### Auth (optional)
Set `AUTH_ENABLED=true` and `AEGIS_API_KEY` in backend `.env`.
Configure the key in frontend **Settings**.

## Deployment

| Component | Target |
|-----------|--------|
| Frontend | Vercel (root: `frontend/`) |
| Backend | Docker / Cloud Run / Railway |
| Database | Neon PostgreSQL |

```bash
# Backend Docker
cd backend && docker build -t aegis-backend .
docker run -p 8000:8000 --env-file ../.env aegis-backend
```

Set `NEXT_PUBLIC_API_URL` to your backend URL in Vercel env vars.

## API

- `GET /health` — service status
- `GET /api/observability/summary` — platform metrics
- `GET /api/runs/{id}/export` — download run JSON
- `PATCH /api/workflows/{id}` — update webhook URL

## Search Providers

| Provider | Config |
|----------|--------|
| Google Search | Default (ADK + Gemini) |
| EXA | `EXA_API_KEY` |
| DuckDuckGo | No key required |