# Aegis

Visual agent development platform with built-in evaluation and guardrails.

## Stack

- **Frontend**: Next.js 14, React Flow, Tailwind, shadcn-style UI
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL (SQLite fallback for local dev)
- **LLM**: Google Gemini API
- **Execution**: Google ADK 2.0 graph workflows

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Set GOOGLE_API_KEY (required)
# Optionally set EXA_API_KEY for Exa search
```

### 2. Database (Neon PostgreSQL)

Set `DATABASE_URL` in `.env` to your Neon connection string (pooler endpoint recommended):

```
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Local Docker Postgres is also available via `docker compose up -d` if you prefer.

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
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

## MVP1 Features

- Visual canvas with Agent, Tool, Evaluation, and Guardrail nodes
- Save / load workflows with versioning
- Run workflows via Google ADK + Gemini
- Real-time SSE progress streaming
- Results panel with eval scores, guardrail status, latency, tokens
- Dashboard listing workflows and past runs

## Search Providers

| Provider | Config | Notes |
|----------|--------|-------|
| Google Search | Default | Uses ADK `google_search` tool + Gemini |
| EXA | `EXA_API_KEY` | Set in node inspector |
| DuckDuckGo | No key | Set in node inspector |