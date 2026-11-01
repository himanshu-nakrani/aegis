#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export UV_CACHE_DIR="$PWD/backend/.venv-cache"
npm --prefix frontend ci
if [[ ! -x backend/.venv/bin/python ]]; then
  uv venv --python python3 backend/.venv
fi
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
(cd backend && .venv/bin/alembic upgrade head)
