#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  # Pre-repair: sync schema/journal when columns already exist (avoids ER_DUP_FIELDNAME crash-loops)
  echo "Verifying waiver revocation columns / journal..."
  node /app/scripts/ensure-waiver-revocation.mjs
  echo "Verifying secondary tables (cost/comms/webhooks)..."
  node /app/scripts/ensure-secondary-tables.mjs
  echo "Verifying template memory lineage..."
  node /app/scripts/ensure-template-memory.mjs
  echo "Running database migrations..."
  npx drizzle-kit migrate
  echo "Verifying failed_jobs migration repair..."
  node /app/scripts/ensure-failed-jobs-table.mjs
  echo "Verifying audit_findings resolution columns..."
  node /app/scripts/ensure-audit-findings-resolution.mjs
fi

exec "$@"
