#!/bin/bash
# Staging Database Migration Script
# Run this to apply foreign keys and performance indexes to staging

set -e

echo "🔄 Running Staging Database Migrations"
echo "======================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo ""
  echo "Please set DATABASE_URL to the staging database connection string:"
  echo "  export DATABASE_URL='mysql://jobsheet_staging:PASSWORD@ai-scheduler-mysql-prod.mysql.database.azure.com:3306/jobsheet_qa_staging?ssl={\"rejectUnauthorized\":true}'"
  echo ""
  exit 1
fi

echo "✅ DATABASE_URL found"
echo "📊 Target: jobsheet_qa_staging"
echo ""

# Backup reminder
echo "⚠️  IMPORTANT: Ensure you have a database backup before proceeding!"
echo "   Run: mysqldump jobsheet_qa_staging > backup_\$(date +%Y%m%d_%H%M%S).sql"
echo ""
read -p "Press Enter to continue with migrations..."

# Run Migration 1: Foreign Keys
echo ""
echo "📝 Running Migration 1: Add Foreign Keys (0001_add_foreign_keys.sql)"
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_staging \
      -p \
      jobsheet_qa_staging \
      --ssl-mode=REQUIRED < drizzle/0001_add_foreign_keys.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration 1 completed successfully"
else
  echo "❌ Migration 1 failed!"
  exit 1
fi

# Run Migration 2: Performance Indexes
echo ""
echo "📝 Running Migration 2: Add Performance Indexes (0002_add_performance_indexes.sql)"
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_staging \
      -p \
      jobsheet_qa_staging \
      --ssl-mode=REQUIRED < drizzle/0002_add_performance_indexes.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration 2 completed successfully"
else
  echo "❌ Migration 2 failed!"
  exit 1
fi

# Verify migrations
echo ""
echo "🔍 Verifying Foreign Keys..."
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_staging \
      -p \
      jobsheet_qa_staging \
      --ssl-mode=REQUIRED \
      -e "SELECT 
            TABLE_NAME, 
            CONSTRAINT_NAME, 
            REFERENCED_TABLE_NAME 
          FROM information_schema.KEY_COLUMN_USAGE 
          WHERE TABLE_SCHEMA = 'jobsheet_qa_staging' 
            AND REFERENCED_TABLE_NAME IS NOT NULL
          ORDER BY TABLE_NAME;" 2>/dev/null | head -20

echo ""
echo "🔍 Verifying Indexes..."
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_staging \
      -p \
      jobsheet_qa_staging \
      --ssl-mode=REQUIRED \
      -e "SELECT 
            TABLE_NAME, 
            INDEX_NAME, 
            COLUMN_NAME 
          FROM information_schema.STATISTICS 
          WHERE TABLE_SCHEMA = 'jobsheet_qa_staging' 
            AND INDEX_NAME != 'PRIMARY'
          ORDER BY TABLE_NAME, INDEX_NAME;" 2>/dev/null | head -20

echo ""
echo "✅ All migrations completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "  1. Verify staging health: curl https://jobsheet-qa-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz"
echo "  2. Check for foreign key violations in logs"
echo "  3. Monitor application performance"
