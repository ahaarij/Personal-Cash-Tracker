#!/bin/bash
# setup-collections.sh
# Run once after PocketBase first starts to create the admin account
# and all 6 app collections.
#
# Usage:
#   ./scripts/setup-collections.sh <admin-email> <admin-password>
#
# Example:
#   ./scripts/setup-collections.sh admin@example.com MySecret123

set -e

BASE="http://127.0.0.1:8090"
ADMIN_EMAIL="${1:-admin@cashflow.local}"
ADMIN_PASSWORD="${2:-changeme123}"
CSRF="-H X-CF-App-Request:1"

if [ ${#ADMIN_PASSWORD} -lt 10 ]; then
  echo "Password must be at least 10 characters"
  exit 1
fi

echo "==> Creating admin account..."
curl -sf -X POST "$BASE/api/admins" \
  -H "Content-Type: application/json" \
  -H "X-CF-App-Request: 1" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"passwordConfirm\":\"$ADMIN_PASSWORD\"}" \
  > /dev/null && echo "    Admin created" || echo "    (Admin may already exist — continuing)"

echo "==> Authenticating as admin..."
TOKEN=$(curl -sf -X POST "$BASE/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -H "X-CF-App-Request: 1" \
  -d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not authenticate. Check email/password."
  exit 1
fi
echo "    Authenticated"

AUTH="-H \"Authorization: $TOKEN\""

create_collection() {
  local NAME="$1"
  local PAYLOAD="$2"
  echo "==> Creating collection: $NAME"
  RESP=$(curl -sf -X POST "$BASE/api/collections" \
    -H "Content-Type: application/json" \
    -H "Authorization: $TOKEN" \
    -H "X-CF-App-Request: 1" \
    -d "$PAYLOAD" 2>&1) && echo "    OK" || echo "    (already exists or error — skipping)"
}

# ── accounts ──────────────────────────────────────────────────────────────────
create_collection "accounts" '{
  "name": "accounts",
  "type": "base",
  "schema": [
    {"name":"owner","type":"relation","required":true,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"maxSelect":1}},
    {"name":"name","type":"text","required":true,"options":{"min":1,"max":100}},
    {"name":"type","type":"select","required":true,"options":{"values":["credit_card","cash","debit_card"],"maxSelect":1}},
    {"name":"currency","type":"text","required":true,"options":{"min":3,"max":3}},
    {"name":"opening_balance","type":"number","required":true,"options":{"min":-9999999999,"max":9999999999}},
    {"name":"credit_limit","type":"number","required":false,"options":{"min":0,"max":9999999999}},
    {"name":"opening_utilized","type":"number","required":false,"options":{"min":0,"max":9999999999}},
    {"name":"archived","type":"bool","required":false},
    {"name":"sort_order","type":"number","required":false,"options":{"min":0,"max":9999}}
  ],
  "listRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "viewRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "createRule":"@request.auth.id != '\'''\''",
  "updateRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "deleteRule":null
}'

# ── categories ────────────────────────────────────────────────────────────────
create_collection "categories" '{
  "name": "categories",
  "type": "base",
  "schema": [
    {"name":"owner","type":"relation","required":true,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"maxSelect":1}},
    {"name":"name","type":"text","required":true,"options":{"min":1,"max":80}},
    {"name":"colour","type":"text","required":false,"options":{"max":50}},
    {"name":"archived","type":"bool","required":false}
  ],
  "listRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "viewRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "createRule":"@request.auth.id != '\'''\''",
  "updateRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "deleteRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id"
}'

# ── trips ─────────────────────────────────────────────────────────────────────
create_collection "trips" '{
  "name": "trips",
  "type": "base",
  "schema": [
    {"name":"owner","type":"relation","required":true,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"maxSelect":1}},
    {"name":"name","type":"text","required":true,"options":{"min":1,"max":120}},
    {"name":"start_date","type":"text","required":true,"options":{"max":10}},
    {"name":"end_date","type":"text","required":true,"options":{"max":10}}
  ],
  "listRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "viewRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "createRule":"@request.auth.id != '\'''\''",
  "updateRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "deleteRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id"
}'

# ── transactions ──────────────────────────────────────────────────────────────
create_collection "transactions" '{
  "name": "transactions",
  "type": "base",
  "schema": [
    {"name":"owner","type":"relation","required":true,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"maxSelect":1}},
    {"name":"date","type":"text","required":true,"options":{"max":10}},
    {"name":"amount","type":"number","required":true,"options":{"min":1,"max":9999999999}},
    {"name":"account","type":"relation","required":true,"options":{"collectionId":"accounts","maxSelect":1}},
    {"name":"type","type":"select","required":true,"options":{"values":["expense","income","transfer"],"maxSelect":1}},
    {"name":"category","type":"relation","required":false,"options":{"collectionId":"categories","maxSelect":1}},
    {"name":"note","type":"text","required":false,"options":{"max":500}},
    {"name":"trip","type":"relation","required":false,"options":{"collectionId":"trips","maxSelect":1}},
    {"name":"transfer_pair_id","type":"text","required":false,"options":{"max":36}},
    {"name":"transfer_direction","type":"select","required":false,"options":{"values":["out","in"],"maxSelect":1}},
    {"name":"client_id","type":"text","required":true,"options":{"min":1,"max":36}},
    {"name":"deleted","type":"bool","required":false}
  ],
  "listRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "viewRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "createRule":"@request.auth.id != '\'''\''",
  "updateRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "deleteRule":null
}'

# ── settings ──────────────────────────────────────────────────────────────────
create_collection "settings" '{
  "name": "settings",
  "type": "base",
  "schema": [
    {"name":"owner","type":"relation","required":true,"options":{"collectionId":"_pb_users_auth_","cascadeDelete":true,"maxSelect":1}},
    {"name":"enabled_currencies","type":"json","required":false},
    {"name":"default_currency","type":"text","required":false,"options":{"max":3}},
    {"name":"default_account","type":"relation","required":false,"options":{"collectionId":"accounts","maxSelect":1}},
    {"name":"date_format","type":"text","required":false,"options":{"max":30}},
    {"name":"number_format","type":"text","required":false,"options":{"max":10}}
  ],
  "listRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "viewRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "createRule":"@request.auth.id != '\'''\''",
  "updateRule":"@request.auth.id != '\'''\'' && owner = @request.auth.id",
  "deleteRule":null
}'

# ── audit_log ─────────────────────────────────────────────────────────────────
create_collection "audit_log" '{
  "name": "audit_log",
  "type": "base",
  "schema": [
    {"name":"user","type":"text","required":false,"options":{"max":36}},
    {"name":"session_id","type":"text","required":false,"options":{"max":36}},
    {"name":"ip","type":"text","required":false,"options":{"max":45}},
    {"name":"action","type":"text","required":true,"options":{"max":80}},
    {"name":"target_record","type":"text","required":false,"options":{"max":36}},
    {"name":"result","type":"select","required":true,"options":{"values":["success","failure"],"maxSelect":1}}
  ],
  "listRule":null,
  "viewRule":null,
  "createRule":null,
  "updateRule":null,
  "deleteRule":null
}'

echo ""
echo "==> Setup complete!"
echo "    Admin: $ADMIN_EMAIL"
echo "    Collections created: accounts, categories, trips, transactions, settings, audit_log"
echo ""
echo "    Now create a user account at: http://localhost:8090/_/"
echo "    Then open the app at:         http://localhost:5173"
