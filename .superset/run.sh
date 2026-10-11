#!/usr/bin/env bash
# Superset Run button — starts FastAPI (backend) + Next.js (frontend) on the
# ports reserved during setup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORTS_FILE="$SCRIPT_DIR/.ports"
PIDS_FILE="$SCRIPT_DIR/.pids"

if [ -f "$PORTS_FILE" ]; then
  FRONTEND_PORT=$(sed -n '1p' "$PORTS_FILE")
  BACKEND_PORT=$(sed -n '2p' "$PORTS_FILE")
else
  FRONTEND_PORT=3000
  BACKEND_PORT=8000
  echo "⚠ No .ports file — using defaults $FRONTEND_PORT / $BACKEND_PORT"
  echo "  (run setup first for per-workspace isolation)"
fi

cleanup() {
  if [ -f "$PIDS_FILE" ]; then
    while IFS= read -r pid; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
}
trap cleanup EXIT INT TERM

if [ ! -x "$ROOT_DIR/backend/.venv/bin/uvicorn" ]; then
  echo "✗ backend/.venv missing — run setup first (./.superset/setup.sh)"
  exit 1
fi

echo "🚀 Starting Aegis"
echo "   Backend:  http://localhost:$BACKEND_PORT"
echo "   Frontend: http://localhost:$FRONTEND_PORT"
echo ""

(
  cd "$ROOT_DIR/backend"
  exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PIDS_FILE"

# Give the API a moment so the frontend's first requests don't bounce.
sleep 1

cd "$ROOT_DIR/frontend"
# Don't exec — keep this shell so the EXIT trap can stop the backend too.
npx next dev --hostname 127.0.0.1 --port "$FRONTEND_PORT"
