#!/bin/bash
# ============================================================
# Exprsn Server Installation Script
#
# Run on the production server after extracting the tarball.
# Installs Docker, configures the system, obtains SSL certs,
# and starts all services.
#
# Usage:
#   sudo bash /var/www/exprsn.io/scripts/install-server.sh
#
# Prerequisites:
#   - Ubuntu 22.04+ or Debian 12+
#   - Root access
#   - DNS A records pointing to this server:
#       exprsn.io       -> <server-ip>
#       api.exprsn.io   -> <server-ip>
#       www.exprsn.io   -> <server-ip>
# ============================================================

set -euo pipefail

DOMAIN="exprsn.io"
INSTALL_DIR="/var/www/${DOMAIN}"
CERT_EMAIL="admin@${DOMAIN}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${GREEN}[install]${NC} $1"; }
warn()  { echo -e "${YELLOW}[install]${NC} $1"; }
error() { echo -e "${RED}[install]${NC} $1"; exit 1; }
info()  { echo -e "${BLUE}[install]${NC} $1"; }

# ---- Pre-flight checks ----
if [ "$EUID" -ne 0 ]; then
  error "This script must be run as root (sudo)"
fi

if [ ! -f "${INSTALL_DIR}/docker-compose.prod.yml" ]; then
  error "docker-compose.prod.yml not found in ${INSTALL_DIR}. Extract the tarball first."
fi

echo ""
info "============================================"
info "  Exprsn Production Server Setup"
info "  Domain: ${DOMAIN}"
info "  Install dir: ${INSTALL_DIR}"
info "============================================"
echo ""

# ---- 1. System packages ----
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl wget gnupg2 ca-certificates lsb-release software-properties-common ufw fail2ban > /dev/null

# ---- 2. Docker ----
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 plugin not found. Install it: apt-get install docker-compose-plugin"
fi

# ---- 3. Firewall ----
log "Configuring firewall (ufw)..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow ssh > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null
log "Firewall: SSH, HTTP, HTTPS allowed"

# ---- 4. SSL certificates via Certbot ----
log "Setting up SSL certificates..."

if ! command -v certbot &>/dev/null; then
  apt-get install -y -qq certbot > /dev/null
fi

CERT_DIR="${INSTALL_DIR}/deploy/nginx/ssl"
mkdir -p "$CERT_DIR"

if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
  log "Obtaining Let's Encrypt certificates for ${DOMAIN}..."

  # Stop anything on port 80 temporarily
  docker compose -f "${INSTALL_DIR}/docker-compose.prod.yml" down 2>/dev/null || true

  certbot certonly --standalone \
    --non-interactive --agree-tos \
    --email "${CERT_EMAIL}" \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}" \
    -d "api.${DOMAIN}" \
    || {
      warn "Certbot failed. You can run it manually later:"
      warn "  certbot certonly --standalone -d ${DOMAIN} -d www.${DOMAIN} -d api.${DOMAIN}"
      warn "Then copy certs to ${CERT_DIR}/"
    }

  # Link certs
  if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    ln -sf "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${CERT_DIR}/fullchain.pem"
    ln -sf "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" "${CERT_DIR}/privkey.pem"
    log "SSL certificates linked"
  fi
else
  log "SSL certificates already present"
fi

# ---- 5. Auto-renew cron ----
CRON_CMD="0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f ${INSTALL_DIR}/docker-compose.prod.yml restart nginx'"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_CMD") | crontab -
log "Certbot auto-renewal cron installed"

# ---- 6. .env.production ----
ENV_FILE="${INSTALL_DIR}/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  warn ".env.production not found!"
  warn "Creating from template - YOU MUST EDIT THIS before starting services."
  cp "${INSTALL_DIR}/.env.production.example" "$ENV_FILE"

  # Generate random secrets
  JWT=$(openssl rand -hex 32)
  ENC=$(openssl rand -hex 16)
  GRAFANA_PW=$(openssl rand -base64 16)
  DB_PW=$(openssl rand -base64 24 | tr -d '/+=')

  sed -i "s|JWT_SECRET=generate-a-64-char-random-string|JWT_SECRET=${JWT}|" "$ENV_FILE"
  sed -i "s|ENCRYPTION_KEY=generate-a-32-byte-hex-key|ENCRYPTION_KEY=${ENC}|" "$ENV_FILE"
  sed -i "s|GRAFANA_ADMIN_PASSWORD=CHANGE_ME|GRAFANA_ADMIN_PASSWORD=${GRAFANA_PW}|" "$ENV_FILE"
  sed -i "s|DATABASE_URL=postgresql://exprsn:CHANGE_ME@postgres:5432/exprsn|DATABASE_URL=postgresql://exprsn:${DB_PW}@postgres:5432/exprsn|" "$ENV_FILE"

  chmod 600 "$ENV_FILE"
  log "Generated random secrets in .env.production"
  warn ">>> IMPORTANT: Edit ${ENV_FILE} to set S3/storage credentials, OAuth keys, etc."
else
  log ".env.production exists"
fi

# ---- 7. System tuning ----
log "Applying system tuning..."

cat > /etc/sysctl.d/99-exprsn.conf << 'SYSCTL'
# Exprsn production tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 65535
vm.overcommit_memory = 1
fs.file-max = 1000000
SYSCTL
sysctl --system > /dev/null 2>&1

# Docker log rotation
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DOCKER_CONF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
DOCKER_CONF
systemctl restart docker

# ---- 8. Create systemd service ----
log "Creating systemd service..."

cat > /etc/systemd/system/exprsn.service << SYSTEMD
[Unit]
Description=Exprsn Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.production up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.production down
ExecReload=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.production restart
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable exprsn.service
log "Systemd service 'exprsn' enabled (starts on boot)"

# ---- 9. Build and start ----
cd "$INSTALL_DIR"

log "Building Docker images (this will take several minutes)..."
docker compose -f docker-compose.prod.yml --env-file .env.production build --parallel

log "Starting services..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Wait for services
log "Waiting for services to initialize (30s)..."
sleep 30

# ---- 10. Health checks ----
echo ""
info "============================================"
info "  Health Checks"
info "============================================"

check_health() {
  local name="$1" url="$2"
  if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
    log "${name}: OK"
  else
    warn "${name}: FAILED (may still be starting)"
  fi
}

check_health "API"   "http://localhost:3001/health"
check_health "Web"   "http://localhost:3000/"
check_health "Nginx" "http://localhost:80/"

# ---- Done ----
echo ""
info "============================================"
info "  Installation Complete!"
info "============================================"
echo ""
log "Services:"
docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
docker compose -f docker-compose.prod.yml ps
echo ""
log "Endpoints:"
echo "  Web:         https://${DOMAIN}"
echo "  API:         https://api.${DOMAIN}"
echo "  Grafana:     https://grafana.${DOMAIN} (or http://localhost:3030)"
echo ""
log "Management:"
echo "  Start:       systemctl start exprsn"
echo "  Stop:        systemctl stop exprsn"
echo "  Restart:     systemctl restart exprsn"
echo "  Logs (api):  docker compose -f docker-compose.prod.yml logs -f api"
echo "  Logs (web):  docker compose -f docker-compose.prod.yml logs -f web"
echo "  Status:      docker compose -f docker-compose.prod.yml ps"
echo ""
log "Database migrations:"
echo "  cd ${INSTALL_DIR}"
echo "  docker compose -f docker-compose.prod.yml exec api npx drizzle-kit migrate"
echo ""

if grep -q "your-access-key" "$ENV_FILE" 2>/dev/null; then
  warn ">>> You still need to configure S3/storage credentials in ${ENV_FILE}"
  warn ">>> Then restart: systemctl restart exprsn"
fi
