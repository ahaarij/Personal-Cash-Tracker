#!/usr/bin/env sh
# ── Nightly encrypted backup ──────────────────────────────────────────────
# Runs as a Docker container (see backup service in docker-compose.yml).
# Schedule via cron on the host: 0 2 * * * docker compose run --rm backup

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${BACKUP_DEST:-/backups}/cashflow_${TIMESTAMP}.sql"
ENCRYPTED_FILE="${DUMP_FILE}.age"

echo "Starting backup: ${TIMESTAMP}"

# Install dependencies on first run (Alpine image)
apk add --no-cache postgresql-client age >/dev/null 2>&1

# Dump the PostgreSQL database
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-password \
  -f "${DUMP_FILE}"

# Encrypt with age public key
echo "${BACKUP_ENCRYPTION_PUBKEY}" | age -r - -o "${ENCRYPTED_FILE}" "${DUMP_FILE}"
rm -f "${DUMP_FILE}"

# Remove backups older than 30 days
find "${BACKUP_DEST:-/backups}" -name "cashflow_*.sql.age" -mtime +30 -delete

FINAL_SIZE=$(stat -c%s "${ENCRYPTED_FILE}" 2>/dev/null || stat -f%z "${ENCRYPTED_FILE}")
echo "Backup complete: ${ENCRYPTED_FILE} (${FINAL_SIZE} bytes)"

# ── Restore procedure (documented here, not automated) ────────────────────
# 1. age --decrypt -i /path/to/private-key.txt cashflow_YYYYMMDD_HHMMSS.sql.age > restore.sql
# 2. PGPASSWORD=... psql -h localhost -U cashflow -d cashflow -f restore.sql
