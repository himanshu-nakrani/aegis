#!/usr/bin/env bash
set -e
export DATABASE_URL=sqlite:///./aegis.db
export GOOGLE_API_KEY=test-key
(cd backend && .venv/bin/alembic upgrade head && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev -- --hostname 0.0.0.0
