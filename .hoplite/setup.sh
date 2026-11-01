#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix frontend ci
uv venv --python python3 backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
(cd backend && .venv/bin/alembic upgrade head)
