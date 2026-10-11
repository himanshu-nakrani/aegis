#!/usr/bin/env bash
# Superset workspace teardown — runs when a workspace is deleted.
# Stops anything the run script started and releases the port allocation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- Colors ----------
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
info() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

kill_port() {
  local port="$1"
  local label="$2"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.5
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
    info "Stopped $label on port $port"
  fi
}

kill_dev_servers() {
  local ports_file="$SCRIPT_DIR/.ports"
  local pids_file="$SCRIPT_DIR/.pids"

  if [ -f "$pids_file" ]; then
    while IFS= read -r pid; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done < "$pids_file"
    rm -f "$pids_file"
  fi

  if [ -f "$ports_file" ]; then
    local frontend_port backend_port
    frontend_port=$(sed -n '1p' "$ports_file")
    backend_port=$(sed -n '2p' "$ports_file")
    [ -n "$frontend_port" ] && kill_port "$frontend_port" "frontend"
    [ -n "$backend_port" ] && kill_port "$backend_port" "backend"
    rm -f "$ports_file"
  else
    # Fallback to defaults if setup never wrote .ports
    kill_port 3000 "frontend"
    kill_port 8000 "backend"
  fi
}

release_port() {
  local alloc_file="$HOME/.superset/port-allocations.json"
  local lock_dir="$HOME/.superset/port-allocations.lock"

  if [ ! -f "$alloc_file" ]; then
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    warn "jq not found — cannot release port allocation"
    return 0
  fi

  local waited=0
  while ! mkdir "$lock_dir" 2>/dev/null; do
    if [ "$waited" -ge 15 ]; then
      warn "Timed out waiting for port lock — removing stale lock"
      rm -rf "$lock_dir"
      mkdir "$lock_dir" 2>/dev/null || true
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "$$" > "$lock_dir/pid" 2>/dev/null || true

  local key="$PWD"
  local tmp="${alloc_file}.tmp.$$"
  if jq --arg k "$key" 'del(.[$k])' "$alloc_file" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$alloc_file"
    info "Released port allocation for this workspace"
  else
    rm -f "$tmp"
    warn "Could not update port allocations"
  fi

  rm -rf "$lock_dir"
}

# ---------- Main ----------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Tearing down Aegis workspace"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

kill_dev_servers
release_port

echo ""
info "Teardown complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
