#!/bin/bash
# ============================================================
# Exprsn Production Deploy Script
#
# Usage:
#   ./scripts/deploy.sh              # Full deploy
#   ./scripts/deploy.sh --build      # Build only
#   ./scripts/deploy.sh --migrate    # Run migrations only
#   ./scripts/deploy.sh --restart    # Restart services only
#   ./scripts/deploy.sh --update     # Pull latest, rebuild, restart
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
error() { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

# Check prerequisites
check_prereqs() {
  command -v docker >/dev/null 2>&1 || error "Docker is required"
  docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required"

  if [ ! -f "$ENV_FILE" ]; then
    error ".env.production not found. Copy .env.production.example and fill in values."
  fi

  if [ ! -f "$COMPOSE_FILE" ]; then
    error "docker-compose.prod.yml not found in ${ROOT_DIR}"
  fi
}

# Run database migrations
run_migrations() {
  log "Running database migrations..."
  cd "$ROOT_DIR"

  # Run migrations inside the running API container
  if docker compose -f "$COMPOSE_FILE" ps api --format '{{.State}}' 2>/dev/null | grep -q running; then
    docker compose -f "$COMPOSE_FILE" exec api npx drizzle-kit migrate 2>&1 || {
      warn "Drizzle migrate failed, trying push..."
      docker compose -f "$COMPOSE_FILE" exec api npx drizzle-kit push 2>&1 || error "Database migration failed"
    }
  else
    # API not running yet — source env and run locally
    set -a
    source "$ENV_FILE"
    set +a

    cd "$ROOT_DIR/packages/api"
    npx drizzle-kit migrate 2>&1 || {
      warn "Drizzle migrate failed, trying push..."
      npx drizzle-kit push 2>&1 || error "Database migration failed"
    }
  fi

  log "Migrations complete"
}

# Build Docker images
build_images() {
  log "Building Docker images..."
  cd "$ROOT_DIR"

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --parallel

  log "Build complete"
}

# Start/restart services
start_services() {
  log "Starting services..."
  cd "$ROOT_DIR"

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

  log "Services started"

  # Wait for health checks
  log "Waiting for health checks..."
  sleep 15

  # Check API health
  if curl -sf --max-time 5 http://localhost:3001/health > /dev/null 2>&1; then
    log "API is healthy"
  else
    warn "API health check failed - check logs: docker compose -f $COMPOSE_FILE logs api"
  fi

  # Check web health
  if curl -sf --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
    log "Web is healthy"
  else
    warn "Web health check failed - check logs: docker compose -f $COMPOSE_FILE logs web"
  fi
}

# Show status
show_status() {
  echo ""
  log "Service status:"
  cd "$ROOT_DIR"
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  log "Endpoints:"
  echo "  Web:        https://exprsn.io  (http://localhost:3000)"
  echo "  API:        https://api.exprsn.io  (http://localhost:3001)"
  echo "  Grafana:    http://localhost:3030"
}

# Update from tarball
update_from_tarball() {
  local tarball="$1"
  if [ ! -f "$tarball" ]; then
    error "Tarball not found: $tarball"
  fi

  log "Updating from ${tarball}..."
  log "Backing up .env.production..."
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"

  log "Extracting..."
  tar xzf "$tarball" -C "$ROOT_DIR"

  log "Restoring .env.production..."
  # .env.production is excluded from tarball, so backup is just for safety

  build_images
  start_services
  show_status
}

# Main
check_prereqs

case "${1:-}" in
  --build)
    build_images
    ;;
  --migrate)
    run_migrations
    ;;
  --restart)
    start_services
    show_status
    ;;
  --update)
    if [ -n "${2:-}" ]; then
      update_from_tarball "$2"
    else
      build_images
      start_services
      show_status
    fi
    ;;
  *)
    run_migrations
    build_images
    start_services
    show_status
    ;;
esac
