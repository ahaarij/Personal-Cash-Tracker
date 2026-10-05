#!/usr/bin/env bash
# ── Cash Flow App — Deployment Script ────────────────────────────────────────
# Run this on the server to deploy or update the app.
# Usage: ./deploy.sh [--update]   (--update skips .env setup, just rebuilds)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_MODE=false
[[ "${1:-}" == "--update" ]] && UPDATE_MODE=true

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy]${NC} $*"; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."
command -v docker   >/dev/null 2>&1 || error "Docker is not installed. Install from https://docs.docker.com/engine/install/"
command -v node     >/dev/null 2>&1 || error "Node.js is not installed. Install from https://nodejs.org/"
docker compose version >/dev/null 2>&1 || error "Docker Compose (v2) is not available. Update Docker Desktop or install the plugin."
success "Prerequisites OK"

cd "$SCRIPT_DIR"

# ── Environment setup (first deploy only) ─────────────────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  if [ ! -f .env ]; then
    info "No .env found — creating from .env.example..."
    cp .env.example .env
    echo ""
    warn "============================================================"
    warn " ACTION REQUIRED: fill in .env before continuing"
    warn "============================================================"
    warn " Open .env and set:"
    warn "   POSTGRES_PASSWORD  — run: openssl rand -hex 32"
    warn "   JWT_SECRET         — run: openssl rand -hex 64"
    warn "   APP_URL            — your Cloudflare Tunnel public URL"
    warn "   CLOUDFLARE_TUNNEL_TOKEN — from the Cloudflare dashboard"
    warn "   BACKUP_ENCRYPTION_PUBKEY — from: age-keygen (keep private key offline)"
    warn "============================================================"
    echo ""
    read -rp "Press Enter once .env is filled in, or Ctrl+C to abort: "
  else
    info ".env already exists — skipping setup"
  fi
fi

# Sanity-check required vars are not still at placeholder values
source .env 2>/dev/null || true
for VAR in POSTGRES_PASSWORD JWT_SECRET CLOUDFLARE_TUNNEL_TOKEN; do
  VAL="${!VAR:-}"
  if [[ -z "$VAL" || "$VAL" == change_me* ]]; then
    error "${VAR} is not set or still a placeholder in .env"
  fi
done

# ── Build frontend ─────────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
(cd frontend && npm install --silent)

info "Building frontend..."
(cd frontend && npm run build)
success "Frontend built → frontend/dist"

# ── Docker Compose ─────────────────────────────────────────────────────────────
info "Building and starting containers..."
docker compose up -d --build

success "Containers started. Waiting for health checks..."
sleep 5
docker compose ps

# ── First-time user creation ───────────────────────────────────────────────────
if [ "$UPDATE_MODE" = false ]; then
  echo ""
  read -rp "Create the app user now? (y/N): " CREATE_USER
  if [[ "$CREATE_USER" =~ ^[Yy]$ ]]; then
    read -rp "  Email: "    USER_EMAIL
    read -rsp " Password: " USER_PASS; echo
    read -rp "  Username: " USER_NAME

    info "Enabling user creation..."
    # Temporarily add ALLOW_CREATE_USER and restart
    grep -q "ALLOW_CREATE_USER" .env && sed -i 's/.*ALLOW_CREATE_USER.*/ALLOW_CREATE_USER=1/' .env || echo "ALLOW_CREATE_USER=1" >> .env
    docker compose restart backend
    sleep 3

    info "Creating user..."
    RESPONSE=$(curl -sf -X POST "http://localhost:3000/api/auth/create-user" \
      -H "Content-Type: application/json" \
      -H "X-CF-App-Request: 1" \
      -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASS}\",\"username\":\"${USER_NAME}\"}" || true)

    if echo "$RESPONSE" | grep -q '"id"'; then
      success "User created successfully"
    else
      warn "Unexpected response: ${RESPONSE}"
      warn "You can create the user manually — see PROJECT_CONTEXT.md"
    fi

    # Remove the flag
    sed -i '/ALLOW_CREATE_USER/d' .env
    docker compose restart backend
    sleep 2
  fi
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
success "============================================================"
success " Deployment complete!"
success " App is live at: ${APP_URL:-<check APP_URL in .env>}"
success ""
success " Useful commands:"
success "   docker compose logs -f backend    # backend logs"
success "   docker compose logs -f            # all logs"
success "   docker compose ps                 # service status"
success "   ./deploy.sh --update              # redeploy after code changes"
success "   docker compose run --rm backup    # manual backup"
success "============================================================"
