#!/bin/bash
# ============================================================
# Exprsn Production Packager
#
# Creates a deployment tarball for uploading to exprsn.io
# Output: exprsn-production.tar.gz
#
# Usage:
#   ./scripts/package-production.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT="$ROOT_DIR/exprsn-production.tar.gz"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[package]${NC} $1"; }
warn() { echo -e "${YELLOW}[package]${NC} $1"; }
error() { echo -e "${RED}[package]${NC} $1"; exit 1; }

cd "$ROOT_DIR"

log "Packaging Exprsn for production deployment..."
log "Target: /var/www/exprsn.io on remote server"

# ---- Collect files ----
# We include everything Docker needs to build, plus deploy configs and scripts.
# Excluded: node_modules, .next, dist (rebuilt on server), dev artifacts, .env files with secrets.

log "Creating tarball (this may take a moment)..."

tar czf "$OUTPUT" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='dump.rdb' \
  --exclude='.git' \
  --exclude='.claude' \
  --exclude='output' \
  --exclude='Mockups' \
  --exclude='Markdowns' \
  --exclude='Exprsn' \
  --exclude='sprints' \
  --exclude='exprsn-competitive-brief.html' \
  --exclude='exprsn-investor-pitch.html' \
  --exclude='*.sqlite' \
  --exclude='*.sqlite-journal' \
  --exclude='data/' \
  --exclude='__pycache__' \
  --exclude='.turbo' \
  --exclude='.vercel' \
  \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.json \
  docker-compose.yml \
  docker-compose.prod.yml \
  .env.example \
  .env.production.example \
  CLAUDE.md \
  \
  packages/ \
  docker/ \
  deploy/ \
  scripts/deploy.sh \
  scripts/install-server.sh

SIZE=$(du -h "$OUTPUT" | cut -f1)
log "Created: $OUTPUT ($SIZE)"
echo ""
log "Upload to your server:"
echo "  scp $OUTPUT root@exprsn.io:/tmp/"
echo ""
log "Then on the server:"
echo "  sudo bash /tmp/install-exprsn.sh"
echo "  # or manually:"
echo "  sudo mkdir -p /var/www/exprsn.io"
echo "  sudo tar xzf /tmp/exprsn-production.tar.gz -C /var/www/exprsn.io"
echo "  cd /var/www/exprsn.io"
echo "  cp .env.production.example .env.production"
echo "  # Edit .env.production with real values"
echo "  sudo bash scripts/install-server.sh"
