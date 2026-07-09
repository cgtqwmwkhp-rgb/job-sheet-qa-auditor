#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  npx drizzle-kit migrate
  echo "Verifying failed_jobs migration repair..."
  node /app/scripts/ensure-failed-jobs-table.mjs
fi

exec "$@"
