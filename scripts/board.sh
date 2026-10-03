#!/usr/bin/env bash
# Start/stop the self-hosted board: Docker stack (Postgres + Electric + remote
# server) plus the local backend and web UI.
#
#   scripts/board.sh start | stop | restart | status | logs [name] | backup
#
# Data lives in the Docker volume `remote_remote-db-data`. `stop` never removes
# volumes. Do NOT use `pnpm run remote:dev`: it ends with `down -v` and wipes the DB.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="$REPO/crates/remote"
RUN_DIR="${BOARD_RUN_DIR:-$HOME/.vibe-board}"
FRONTEND_PORT=3000
BACKEND_PORT=3001
PREVIEW_PROXY_PORT=3002
REMOTE_PORT=8081

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock}"

mkdir -p "$RUN_DIR/backups"

log() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

dc() { (cd "$REMOTE_DIR" && docker-compose --env-file .env.remote "$@"); }

# Repo scripts call `pnpm` recursively; if it is not installed, shim it via corepack.
if ! command -v pnpm >/dev/null 2>&1; then
  mkdir -p "$RUN_DIR/bin"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' >"$RUN_DIR/bin/pnpm"
  chmod +x "$RUN_DIR/bin/pnpm"
  export PATH="$RUN_DIR/bin:$PATH"
fi

listener() { lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true; }

wait_for() { # url, label, tries
  local i
  for ((i = 0; i < ${3:-60}; i++)); do
    curl -sf -m3 "$1" >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "$2 did not become ready ($1). See: scripts/board.sh logs"
}

ensure_docker() {
  command -v colima >/dev/null || die "colima not installed (brew install colima docker docker-compose)"
  command -v docker-compose >/dev/null || die "docker-compose not installed"
  [ -f "$REMOTE_DIR/.env.remote" ] || die "missing $REMOTE_DIR/.env.remote"
  if ! colima status >/dev/null 2>&1; then
    log "Starting Colima"
    colima start --cpu 4 --memory 6
  fi
  docker info >/dev/null 2>&1 || die "Docker daemon not reachable at $DOCKER_HOST"
  docker image inspect electricsql/electric:1.4.13 >/dev/null 2>&1 ||
    die "local image electricsql/electric:1.4.13 is missing (it is built from source; see the repo notes)"
}

start() {
  ensure_docker

  log "Starting remote stack (Postgres, Electric, remote server)"
  dc up -d --pull never
  wait_for "http://localhost:$REMOTE_PORT/v1/health" "remote server"

  if [ -n "$(listener $BACKEND_PORT)" ]; then
    log "Local backend already running on :$BACKEND_PORT"
  else
    log "Building and starting local backend"
    (cd "$REPO" && cargo build --bin server --bin vibe-kanban-mcp)
    (
      cd "$REPO"
      FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT PREVIEW_PROXY_PORT=$PREVIEW_PROXY_PORT \
        VK_SHARED_API_BASE="http://localhost:$REMOTE_PORT" \
        VK_ALLOWED_ORIGINS="http://localhost:$FRONTEND_PORT" \
        DISABLE_WORKTREE_CLEANUP=1 RUST_LOG=info \
        nohup target/debug/server >"$RUN_DIR/backend.log" 2>&1 &
    )
  fi
  wait_for "http://localhost:$BACKEND_PORT/api/health" "local backend"

  if [ -n "$(listener $FRONTEND_PORT)" ]; then
    log "Web UI already running on :$FRONTEND_PORT"
  else
    log "Starting web UI"
    (
      cd "$REPO"
      FRONTEND_PORT=$FRONTEND_PORT BACKEND_PORT=$BACKEND_PORT PREVIEW_PROXY_PORT=$PREVIEW_PROXY_PORT \
        VITE_VK_SHARED_API_BASE="http://localhost:$REMOTE_PORT" \
        nohup pnpm run local-web:dev >"$RUN_DIR/frontend.log" 2>&1 &
    )
  fi
  wait_for "http://localhost:$FRONTEND_PORT/" "web UI"

  status
  echo
  echo "Board:  http://localhost:$FRONTEND_PORT/  (sidebar > Projects)"
  echo "Logs:   scripts/board.sh logs [backend|frontend|remote]"
}

stop() {
  local pid
  for port in $FRONTEND_PORT $BACKEND_PORT $PREVIEW_PROXY_PORT; do
    pid="$(listener "$port")"
    if [ -n "$pid" ]; then
      log "Stopping process on :$port"
      # shellcheck disable=SC2086
      kill $pid 2>/dev/null || true
    fi
  done
  if docker info >/dev/null 2>&1; then
    log "Stopping remote stack (data is kept)"
    dc stop
  fi
}

status() {
  local name url
  for entry in \
    "web UI|http://localhost:$FRONTEND_PORT/" \
    "local backend|http://localhost:$BACKEND_PORT/api/health" \
    "remote server|http://localhost:$REMOTE_PORT/v1/health"; do
    name="${entry%%|*}"
    url="${entry#*|}"
    if curl -sf -m3 "$url" >/dev/null 2>&1; then printf '  %-15s up    %s\n' "$name" "$url"; else printf '  %-15s DOWN  %s\n' "$name" "$url"; fi
  done
  if docker info >/dev/null 2>&1; then dc ps --format '  {{.Service}}: {{.Status}}' 2>/dev/null || true; else echo "  docker: not running"; fi
}

logs() {
  case "${1:-backend}" in
    backend) tail -n 80 -f "$RUN_DIR/backend.log" ;;
    frontend) tail -n 80 -f "$RUN_DIR/frontend.log" ;;
    remote) dc logs -f --tail 80 remote-server ;;
    *) die "unknown log '$1' (backend|frontend|remote)" ;;
  esac
}

backup() {
  local out
  out="$RUN_DIR/backups/remote-$(date +%Y%m%d-%H%M%S).sql.gz"
  docker info >/dev/null 2>&1 || die "Docker is not running"
  dc exec -T remote-db pg_dump -U remote --no-owner remote | gzip >"$out"
  [ -s "$out" ] || die "backup is empty"
  log "Backup written: $out ($(du -h "$out" | cut -f1))"
  # keep the 14 most recent backups
  # shellcheck disable=SC2012
  ls -1t "$RUN_DIR"/backups/remote-*.sql.gz | tail -n +15 | xargs -I{} rm -f {}
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 2; start ;;
  status) status ;;
  logs) shift; logs "${1:-backend}" ;;
  backup) backup ;;
  *) echo "usage: $0 start|stop|restart|status|logs [backend|frontend|remote]|backup"; exit 2 ;;
esac
