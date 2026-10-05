#!/usr/bin/env bash
# ── Cash Flow App — Native Deployment (no Docker) ────────────────────────────
# Installs and runs everything directly on the server.
# Tested on Ubuntu 22.04 / Debian 12.
# Usage:
#   First deploy:  ./deploy-native.sh
#   Update:        ./deploy-native.sh --update

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_MODE=false
[[ "${1:-}" == "--update" ]] && UPDATE_MODE=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy]${NC} $*"; exit 1; }

cd "$SCRIPT_DIR"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
info "Checking prerequisites..."

install_node() {
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_postgres() {
  info "Installing PostgreSQL..."
  sudo apt-get install -y postgresql postgresql-client
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
}

install_caddy() {
  info "Installing Caddy..."
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
}

install_cloudflared() {
  info "Installing cloudflared..."
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
    -o /tmp/cloudflared.deb
  sudo dpkg -i /tmp/cloudflared.deb
  rm /tmp/cloudflared.deb
}

install_pm2() {
  info "Installing pm2..."
  sudo npm install -g pm2
}

command -v node      >/dev/null 2>&1 || install_node
command -v psql      >/dev/null 2>&1 || install_postgres
command -v caddy     >/dev/null 2>&1 || install_caddy
command -v cloudflared >/dev/null 2>&1 || install_cloudflared
command -v pm2       >/dev/null 2>&1 || install_pm2

success "Prerequisites OK"

# ── 2. Environment setup ──────────────────────────────────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  if [ ! -f .env ]; then
    info "Creating .env from template..."
    cp .env.example .env
    # Native deployment uses localhost for DB
    sed -i 's|^#.*||' .env
    echo ""
    warn "============================================================"
    warn " ACTION REQUIRED: fill in .env before continuing"
    warn "============================================================"
    warn "   POSTGRES_PASSWORD  — run: openssl rand -hex 32"
    warn "   JWT_SECRET         — run: openssl rand -hex 64"
    warn "   APP_URL            — your Cloudflare Tunnel public URL"
    warn "   CLOUDFLARE_TUNNEL_TOKEN — from the Cloudflare dashboard"
    warn "============================================================"
    echo ""
    read -rp "Press Enter once .env is filled in, or Ctrl+C to abort: "
  fi
fi

set -a; source .env; set +a

for VAR in POSTGRES_PASSWORD JWT_SECRET CLOUDFLARE_TUNNEL_TOKEN; do
  VAL="${!VAR:-}"
  [[ -z "$VAL" || "$VAL" == change_me* ]] && error "${VAR} is not set or still a placeholder in .env"
done

# ── 3. PostgreSQL database ────────────────────────────────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  info "Setting up PostgreSQL database..."
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='cashflow'" \
    | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER cashflow WITH PASSWORD '${POSTGRES_PASSWORD}';"

  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='cashflow'" \
    | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE cashflow OWNER cashflow;"

  success "Database ready"
fi

# ── 4. Build frontend ─────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
(cd frontend && npm install --silent)

info "Building frontend..."
(cd frontend && npm run build)
success "Frontend built → frontend/dist"

# ── 5. Build backend ──────────────────────────────────────────────────────────
info "Installing backend dependencies..."
(cd backend && npm install --silent)

info "Compiling backend TypeScript..."
(cd backend && npm run build)
success "Backend compiled → backend/dist"

# Write backend .env (native DB URL uses localhost)
cat > backend/.env <<EOF
DATABASE_URL=postgresql://cashflow:${POSTGRES_PASSWORD}@localhost:5432/cashflow
JWT_SECRET=${JWT_SECRET}
PORT=3000
ALLOWED_ORIGINS=${APP_URL:-http://localhost:8080}
EOF

# ── 6. Start backend with pm2 ─────────────────────────────────────────────────
info "Starting backend with pm2..."
pm2 delete cashflow-backend 2>/dev/null || true
pm2 start backend/dist/index.js --name cashflow-backend --no-autorestart false
pm2 save
pm2 startup 2>/dev/null | grep "sudo" | bash || true
success "Backend running on :3000"

# ── 7. Configure and start Caddy ─────────────────────────────────────────────
DIST_PATH="$SCRIPT_DIR/frontend/dist"

info "Writing Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
# Cash Flow App — native Caddyfile
# Cloudflare Tunnel connects to :8080; Caddy serves static files + proxies /api

:8080 {
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        -Server
        -X-Powered-By
    }

    @api path /api/*
    reverse_proxy @api localhost:3000 {
        header_up X-Real-IP {remote_host}
    }

    root * ${DIST_PATH}
    encode gzip
    try_files {path} /index.html
    file_server { hide .git }

    @static {
        path *.js *.css *.woff2 *.woff *.ttf *.svg *.ico *.png *.webp
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    @html path /index.html /
    header @html Cache-Control "no-cache, no-store, must-revalidate"
}
EOF

sudo systemctl enable caddy
sudo systemctl restart caddy
success "Caddy serving on :8080"

# ── 8. Configure cloudflared ──────────────────────────────────────────────────
info "Installing cloudflared as a service..."
sudo cloudflared service install "${CLOUDFLARE_TUNNEL_TOKEN}" 2>/dev/null || \
  sudo cloudflared service install --token "${CLOUDFLARE_TUNNEL_TOKEN}" 2>/dev/null || \
  warn "cloudflared service install failed — run manually: sudo cloudflared service install <token>"

sudo systemctl enable cloudflared 2>/dev/null || true
sudo systemctl restart cloudflared 2>/dev/null || true
success "Cloudflare Tunnel started"

# ── 9. First-time user creation ───────────────────────────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  echo ""
  read -rp "Create the app user now? (y/N): " CREATE_USER
  if [[ "$CREATE_USER" =~ ^[Yy]$ ]]; then
    read -rp "  Email: "    USER_EMAIL
    read -rsp " Password: " USER_PASS; echo
    read -rp "  Username: " USER_NAME

    # Temporarily enable user creation
    echo "ALLOW_CREATE_USER=1" >> backend/.env
    pm2 restart cashflow-backend
    sleep 3

    RESPONSE=$(curl -sf -X POST "http://localhost:3000/api/auth/create-user" \
      -H "Content-Type: application/json" \
      -H "X-CF-App-Request: 1" \
      -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASS}\",\"username\":\"${USER_NAME}\"}" || true)

    if echo "$RESPONSE" | grep -q '"id"'; then
      success "User created"
    else
      warn "Unexpected response: ${RESPONSE}"
    fi

    sed -i '/ALLOW_CREATE_USER/d' backend/.env
    pm2 restart cashflow-backend
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
success "============================================================"
success " Deployment complete!"
success " App is live at: ${APP_URL:-<check APP_URL in .env>}"
success ""
success " Useful commands:"
success "   pm2 logs cashflow-backend     # backend logs"
success "   pm2 status                    # process status"
success "   sudo systemctl status caddy   # caddy status"
success "   sudo journalctl -u cloudflared -f  # tunnel logs"
success "   ./deploy-native.sh --update   # redeploy after git pull"
success "============================================================"
