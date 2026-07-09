#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  npx drizzle-kit migrate
  echo "Verifying failed_jobs migration repair..."
  node /app/scripts/ensure-failed-jobs-table.mjs
  echo "Verifying audit_findings resolution columns..."
  node /app/scripts/ensure-audit-findings-resolution.mjs
fi

exec "$@"
