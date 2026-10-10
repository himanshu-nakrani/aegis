#!/usr/bin/env bash
# Superset workspace setup — runs when a new workspace is created.
# Installs deps, copies gitignored env files from the root checkout, and
# reserves per-workspace frontend/backend ports so parallel workspaces don't collide.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------- Colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# ---------- Port allocation ----------
# Shared registry at ~/.superset/port-allocations.json (see docs.superset.sh/ports).
# Each workspace claims a base port; frontend = base, backend = base + 5000.
# Examples: 3000/8000, 3010/8010, 3020/8020, …
ALLOC_FILE="$HOME/.superset/port-allocations.json"
LOCK_DIR="$HOME/.superset/port-allocations.lock"
PORT_RANGE=10
PORT_START=3000
BACKEND_OFFSET=5000

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

allocate_ports() {
  mkdir -p "$HOME/.superset"
  [ -f "$ALLOC_FILE" ] || echo '{}' > "$ALLOC_FILE"

  local waited=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [ "$waited" -ge 15 ]; then
      warn "Timed out waiting for port lock — removing stale lock"
      rm -rf "$LOCK_DIR"
      mkdir "$LOCK_DIR" 2>/dev/null || true
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "$$" > "$LOCK_DIR/pid" 2>/dev/null || true

  local key="$PWD"
  local existing
  existing=$(jq -r --arg k "$key" '.[$k] // empty' "$ALLOC_FILE" 2>/dev/null || true)
  if [ -n "$existing" ] && [[ "$existing" =~ ^[0-9]+$ ]]; then
    export FRONTEND_PORT="$existing"
    export BACKEND_PORT=$((existing + BACKEND_OFFSET))
    rm -rf "$LOCK_DIR"
    return 0
  fi

  local used
  used=$(jq -r '[.[] | select(type=="number")] | .[]' "$ALLOC_FILE" 2>/dev/null || true)

  local candidate=$PORT_START
  while true; do
    local taken=0
    if echo "$used" | grep -qx "$candidate" 2>/dev/null; then
      taken=1
    fi
    local backend=$((candidate + BACKEND_OFFSET))
    if [ "$taken" -eq 0 ] && ! port_in_use "$candidate" && ! port_in_use "$backend"; then
      break
    fi
    candidate=$((candidate + PORT_RANGE))
    if [ "$candidate" -gt 3990 ]; then
      error "Could not find a free frontend/backend port pair"
      rm -rf "$LOCK_DIR"
      exit 1
    fi
  done

  local tmp="${ALLOC_FILE}.tmp.$$"
  jq --arg k "$key" --argjson v "$candidate" '. + {($k): $v}' "$ALLOC_FILE" > "$tmp"
  mv "$tmp" "$ALLOC_FILE"

  export FRONTEND_PORT="$candidate"
  export BACKEND_PORT=$((candidate + BACKEND_OFFSET))
  rm -rf "$LOCK_DIR"
}

persist_ports() {
  printf '%s\n%s\n' "$FRONTEND_PORT" "$BACKEND_PORT" > "$SCRIPT_DIR/.ports"
  info "Allocated ports — frontend: $FRONTEND_PORT  backend: $BACKEND_PORT"
}

# ---------- Copy untracked files from the root worktree ----------
copy_untracked_files() {
  local root="${SUPERSET_ROOT_PATH:-}"
  if [ -z "$root" ]; then
    warn "SUPERSET_ROOT_PATH not set — skipping untracked-file copy"
    return 0
  fi

  if [ -f "$root/.env" ]; then
    cp "$root/.env" "$ROOT_DIR/.env"
    info "Copied .env from root workspace"
  elif [ -f "$root/.env.example" ]; then
    cp "$root/.env.example" "$ROOT_DIR/.env"
    warn "No .env in root — copied .env.example (fill in GOOGLE_API_KEY)"
  else
    warn "No .env found in root workspace — skipping"
  fi

  mkdir -p "$ROOT_DIR/frontend"
  if [ -f "$root/frontend/.env.local" ]; then
    cp "$root/frontend/.env.local" "$ROOT_DIR/frontend/.env.local"
    info "Copied frontend/.env.local from root workspace"
  elif [ -f "$root/frontend/.env.local.example" ]; then
    cp "$root/frontend/.env.local.example" "$ROOT_DIR/frontend/.env.local"
    warn "No frontend/.env.local in root — copied example"
  else
    warn "No frontend/.env.local found in root workspace — skipping"
  fi
}

# Patch env files so CORS and the API URL match this workspace's ports.
apply_port_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    if grep -q '^CORS_ORIGINS=' "$ROOT_DIR/.env"; then
      sed -i.bak "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://localhost:${FRONTEND_PORT}|" "$ROOT_DIR/.env"
    else
      printf '\nCORS_ORIGINS=http://localhost:%s\n' "$FRONTEND_PORT" >> "$ROOT_DIR/.env"
    fi
    rm -f "$ROOT_DIR/.env.bak"
    info "Set CORS_ORIGINS=http://localhost:$FRONTEND_PORT"
  fi

  mkdir -p "$ROOT_DIR/frontend"
  if [ -f "$ROOT_DIR/frontend/.env.local" ]; then
    if grep -q '^NEXT_PUBLIC_API_URL=' "$ROOT_DIR/frontend/.env.local"; then
      sed -i.bak "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}|" "$ROOT_DIR/frontend/.env.local"
    else
      printf 'NEXT_PUBLIC_API_URL=http://localhost:%s\n' "$BACKEND_PORT" > "$ROOT_DIR/frontend/.env.local"
    fi
    rm -f "$ROOT_DIR/frontend/.env.local.bak"
  else
    printf 'NEXT_PUBLIC_API_URL=http://localhost:%s\n' "$BACKEND_PORT" > "$ROOT_DIR/frontend/.env.local"
  fi
  info "Set NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT"
}

# ---------- Install dependencies ----------
pick_python() {
  if command -v python3.12 >/dev/null 2>&1; then
    echo "python3.12"
  elif [ -x /opt/homebrew/opt/python@3.12/bin/python3.12 ]; then
    echo "/opt/homebrew/opt/python@3.12/bin/python3.12"
  else
    echo "python3"
  fi
}

install_deps() {
  if [ -f "$ROOT_DIR/frontend/package-lock.json" ]; then
    echo "📥 Installing frontend dependencies..."
    (cd "$ROOT_DIR/frontend" && npm ci --prefer-offline 2>/dev/null || npm install)
    info "Frontend dependencies installed"
  elif [ -f "$ROOT_DIR/frontend/package.json" ]; then
    echo "📥 Installing frontend dependencies..."
    (cd "$ROOT_DIR/frontend" && npm install)
    info "Frontend dependencies installed"
  fi

  if [ -f "$ROOT_DIR/backend/requirements.txt" ]; then
    if [ ! -d "$ROOT_DIR/backend/.venv" ]; then
      local py
      py="$(pick_python)"
      echo "🐍 Creating backend virtualenv with $py..."
      "$py" -m venv "$ROOT_DIR/backend/.venv"
    fi
    echo "🐍 Installing backend dependencies..."
    "$ROOT_DIR/backend/.venv/bin/pip" install -q -r "$ROOT_DIR/backend/requirements.txt"
    info "Backend dependencies installed"

    echo "🗄  Applying database migrations..."
    (
      cd "$ROOT_DIR/backend"
      .venv/bin/alembic upgrade head
    )
    info "Database migrations applied"
  fi
}

# ---------- Main ----------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Setting up Aegis workspace"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$ROOT_DIR"

if command -v jq >/dev/null 2>&1; then
  allocate_ports
  persist_ports
else
  warn "jq not found — using default ports 3000/8000 (install jq for multi-workspace isolation)"
  FRONTEND_PORT=3000
  BACKEND_PORT=8000
  persist_ports
fi

copy_untracked_files
apply_port_env
install_deps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Setup complete"
echo "   Frontend: http://localhost:$FRONTEND_PORT"
echo "   Backend:  http://localhost:$BACKEND_PORT"
echo "   Use the Run button (or ./.superset/run.sh) to start both servers."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
