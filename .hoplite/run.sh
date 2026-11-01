#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
(cd backend && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000) &
pids+=("$!")
(cd frontend && export NEXT_PUBLIC_API_URL=/backend AEGIS_PREVIEW_API_URL=http://127.0.0.1:8000 NEXT_DIST_DIR=.next-preview && exec npm run dev -- --hostname 0.0.0.0 --port 3000) &
pids+=("$!")
wait -n "${pids[@]}"
