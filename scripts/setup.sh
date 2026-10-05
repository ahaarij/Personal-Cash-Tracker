#!/usr/bin/env bash
# ── First-run setup script ────────────────────────────────────────────────
# Run once on a fresh server after copying .env.example → .env and filling values.
# After this script completes, account creation is disabled.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}▶ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────
command -v docker   >/dev/null 2>&1 || die "Docker is not installed"
command -v age      >/dev/null 2>&1 || warn "age not found — install it for encrypted backups: brew install age"

[ -f .env ] || die ".env file not found. Copy .env.example and fill in values first."
# shellcheck disable=SC1091
source .env

[ -n "${PB_ENCRYPTION_KEY:-}" ]       || die "PB_ENCRYPTION_KEY is not set in .env"
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] || die "CLOUDFLARE_TUNNEL_TOKEN is not set in .env"
[ -n "${PB_ADMIN_EMAIL:-}" ]          || die "PB_ADMIN_EMAIL is not set in .env"
[ -n "${PB_ADMIN_PASSWORD:-}" ]       || die "PB_ADMIN_PASSWORD is not set in .env"

# Check password length
if [ ${#PB_ADMIN_PASSWORD} -lt 14 ]; then
  die "PB_ADMIN_PASSWORD must be at least 14 characters"
fi

# ── Build frontend ────────────────────────────────────────────────────────
log "Building frontend…"
(cd frontend && npm ci && npm run build)

# ── Start services ────────────────────────────────────────────────────────
log "Starting services…"
docker compose up -d pocketbase

# Wait for PocketBase to be ready
log "Waiting for PocketBase to start…"
for i in $(seq 1 30); do
  if docker compose exec pocketbase wget -qO- http://localhost:8090/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
  [ $i -eq 30 ] && die "PocketBase failed to start"
done

# ── Create owner account ──────────────────────────────────────────────────
log "Creating owner account…"
# Use PocketBase's admin API to create the user
RESPONSE=$(curl -s -X POST "http://localhost:8090/api/admins" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\",\"passwordConfirm\":\"${PB_ADMIN_PASSWORD}\"}" \
  2>&1)

if echo "$RESPONSE" | grep -q '"email"'; then
  log "Admin account created."
else
  warn "Could not create admin via API (may already exist): $RESPONSE"
fi

# ── Generate recovery codes ───────────────────────────────────────────────
log "Generating recovery codes…"
RECOVERY_CODES=""
for _ in $(seq 1 10); do
  CODE=$(openssl rand -hex 8 | tr '[:lower:]' '[:upper:]' | sed 's/.\{4\}/&-/g;s/-$//')
  RECOVERY_CODES="${RECOVERY_CODES}${CODE}\n"
done

RECOVERY_FILE="recovery-codes-$(date +%Y%m%d).txt"
printf "Personal Cash Flow — Recovery Codes\n" > "$RECOVERY_FILE"
printf "Generated: $(date)\n" >> "$RECOVERY_FILE"
printf "Store these codes offline in a secure location.\n\n" >> "$RECOVERY_FILE"
printf "%b" "$RECOVERY_CODES" >> "$RECOVERY_FILE"

echo ""
echo -e "${YELLOW}══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  RECOVERY CODES — STORE OFFLINE IMMEDIATELY${NC}"
echo -e "${YELLOW}══════════════════════════════════════════════════════${NC}"
printf "%b" "$RECOVERY_CODES"
echo ""
echo -e "Also saved to: ${GREEN}${RECOVERY_FILE}${NC}"
echo -e "${YELLOW}Delete this file from the server after saving it offline.${NC}"
echo ""

# ── Start remaining services ──────────────────────────────────────────────
log "Starting web and tunnel…"
docker compose up -d

log "Setup complete."
echo ""
echo "  App URL:      ${APP_URL:-https://cashflow.yourdomain.com}"
echo "  PB Admin UI:  http://localhost:8090/_/  (localhost only — via SSH tunnel)"
echo ""
echo "  Next steps:"
echo "  1. Save recovery codes offline and delete ${RECOVERY_FILE}"
echo "  2. Configure Cloudflare Access in the Zero Trust dashboard"
echo "  3. Install the PWA on your devices (see README.md)"
echo "  4. Run the post-install checklist in SECURITY.md"
