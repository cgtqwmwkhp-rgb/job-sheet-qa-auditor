# Staging Deployment Checklist

**Branch**: `cursor/fix-concurrent-reprocess-race-condition-a4fd`  
**Target**: Staging Environment  
**Date**: 2026-07-12

---

## Pre-Deployment Verification

### ✅ Code Quality

- [x] All commits cleanly applied
- [x] No merge conflicts with `main`
- [x] TypeScript compilation passes
- [x] ESLint checks pass
- [ ] Run full test suite: `pnpm test`
- [ ] Run backend contract tests: `pnpm test:contracts`
- [ ] Run E2E tests (if available)

### ✅ Security Checks

- [x] Object-level authorization implemented
- [x] File validation enabled
- [x] JWT_SECRET validation in place
- [x] CSRF protection framework ready
- [x] Database foreign keys defined
- [ ] Security scan (Snyk/Dependabot)
- [ ] Secrets audit in deployment config

### ✅ Database Migrations

**CRITICAL**: Must run in order!

1. **0001_add_foreign_keys.sql**
   - [ ] Backup production database
   - [ ] Test migration on staging data
   - [ ] Verify no orphaned records
   - [ ] Check cascade behavior
   - [ ] Run migration: `mysql < drizzle/0001_add_foreign_keys.sql`

2. **0002_add_performance_indexes.sql**
   - [ ] Test on staging data
   - [ ] Verify index creation time
   - [ ] Check index usage with EXPLAIN
   - [ ] Run migration: `mysql < drizzle/0002_add_performance_indexes.sql`

**Rollback Plan**: Keep pre-migration backup for 48 hours

---

## Environment Variables

### Required New Variables

```bash
# CRITICAL - Must be set
JWT_SECRET="<min-32-chars-strong-secret>"  # Generate: openssl rand -base64 48

# OPTIONAL - Recommended
CSRF_SECRET="<min-32-chars-strong-secret>"  # Can reuse JWT_SECRET
TIMEOUT_PROCESSING_MS="600000"  # 10 minutes
TIMEOUT_OCR_MS="180000"          # 3 minutes
TIMEOUT_AI_MS="300000"           # 5 minutes
TIMEOUT_UPLOAD_MS="60000"        # 1 minute
TIMEOUT_API_MS="30000"           # 30 seconds
TIMEOUT_DB_MS="10000"            # 10 seconds
```

### Verify Existing Variables

- [ ] `MISTRAL_API_KEY` present
- [ ] `GEMINI_API_KEY` present
- [ ] `AZURE_STORAGE_CONNECTION_STRING` or equivalent
- [ ] `DATABASE_URL` correct for staging
- [ ] `VITE_APP_ID` matches environment

---

## Deployment Steps

### 1. Pre-Deployment Testing (Local/Dev)

```bash
# Pull latest changes
git checkout cursor/fix-concurrent-reprocess-race-condition-a4fd
git pull origin cursor/fix-concurrent-reprocess-race-condition-a4fd

# Install dependencies
pnpm install

# Run tests
pnpm test
pnpm test:contracts

# Build application
pnpm build

# Verify build artifacts
ls -la dist/
```

### 2. Database Migration (Staging)

```bash
# Connect to staging database
mysql -h <staging-host> -u <user> -p <database>

# Backup first!
mysqldump <database> > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
source drizzle/0001_add_foreign_keys.sql;
source drizzle/0002_add_performance_indexes.sql;

# Verify migrations
SHOW CREATE TABLE job_sheets;
SHOW INDEXES FROM job_sheets;
```

### 3. Application Deployment

```bash
# Stop existing application
pm2 stop job-sheet-qa-auditor

# Pull latest code
git pull origin cursor/fix-concurrent-reprocess-race-condition-a4fd

# Install/update dependencies
pnpm install

# Build application
pnpm build

# Run database schema sync (if using Drizzle push)
pnpm db:push  # Only if not using manual migrations

# Start application
pm2 start ecosystem.config.js
pm2 logs job-sheet-qa-auditor
```

### 4. Smoke Tests (Post-Deployment)

Run these immediately after deployment:

#### Authentication

- [ ] Login with Microsoft Entra ID works
- [ ] Session persists across page reloads
- [ ] Logout works correctly

#### File Upload

- [ ] PDF upload succeeds
- [ ] Image upload (JPEG/PNG) succeeds
- [ ] File size limit enforced (10MB)
- [ ] Invalid file type rejected
- [ ] Malicious file rejected (try .exe renamed to .pdf)

#### Processing

- [ ] Job sheet processes within timeout
- [ ] OCR extraction works
- [ ] AI analysis completes
- [ ] Audit result created
- [ ] Findings displayed

#### Authorization

- [ ] Regular user cannot access other users' job sheets
- [ ] QA Lead can access all job sheets
- [ ] Admin can access all resources
- [ ] 403 errors clear and helpful

#### Database

- [ ] Foreign keys enforce relationships
- [ ] Cascade deletes work correctly
- [ ] Indexes improve query performance
- [ ] No orphaned records created

#### UI/UX

- [ ] Search page shows "Coming Soon"
- [ ] Notifications bell empty (no fake alerts)
- [ ] Analytics deep links work
- [ ] Resolved findings show as "passed"
- [ ] Dark mode works (colors correct)

---

## Monitoring & Alerts

### Metrics to Watch (First 24 Hours)

- **Error Rate**: Should not increase
- **Response Time**: Should decrease (due to indexes)
- **Processing Timeout**: Monitor for TimeoutError logs
- **Authorization Denials**: Track 403 errors
- **Database Connections**: Watch for connection pool exhaustion

### Log Patterns to Monitor

```bash
# Timeout errors
grep "TimeoutError" /var/log/app.log

# Authorization denials
grep "FORBIDDEN" /var/log/app.log

# Database foreign key violations
grep "foreign key constraint" /var/log/app.log

# Processing failures
grep "processing failed" /var/log/app.log
```

### Alert Thresholds

- Error rate > 5% → Investigate immediately
- P95 latency > 10s → Check database indexes
- Timeout rate > 1% → Increase timeout or investigate
- 403 errors > 100/hour → Check authorization logic

---

## Rollback Plan

### If Critical Issues Found

#### Option A: Quick Rollback (< 30 min)

```bash
# Revert to previous commit
git checkout main
git pull origin main

# Rebuild and restart
pnpm install
pnpm build
pm2 restart job-sheet-qa-auditor
```

#### Option B: Database Rollback (If Migrations Cause Issues)

```bash
# Restore from backup
mysql <database> < backup_<timestamp>.sql

# Verify restoration
mysql -e "SELECT COUNT(*) FROM job_sheets;"

# Rollback application code
git checkout main
pnpm install && pnpm build
pm2 restart job-sheet-qa-auditor
```

### Rollback Decision Criteria

Rollback immediately if:

- Error rate > 10%
- Data corruption detected
- Critical feature broken (upload, processing, auth)
- Foreign key violations preventing operations
- Cascading deletes causing data loss

---

## Post-Deployment Tasks

### Within 1 Hour

- [ ] Verify all smoke tests passing
- [ ] Check error logs for new issues
- [ ] Monitor processing queue depth
- [ ] Verify database performance

### Within 24 Hours

- [ ] Review performance metrics
- [ ] Analyze slow query log
- [ ] Check authorization logs for false denials
- [ ] Gather user feedback

### Within 1 Week

- [ ] Full regression test suite
- [ ] Performance benchmarking
- [ ] Security audit
- [ ] Update documentation

---

## Success Criteria

Deployment considered successful when:

- ✅ All smoke tests pass
- ✅ Error rate < 1%
- ✅ No data corruption
- ✅ Processing timeouts < 1%
- ✅ Authorization working correctly
- ✅ Performance improved (queries faster)
- ✅ No critical bugs reported

---

## Communication Plan

### Before Deployment

- [ ] Notify team in Slack #engineering
- [ ] Email stakeholders (QA leads, admins)
- [ ] Update status page (if applicable)

### During Deployment

- [ ] Post deployment start time
- [ ] Share migration progress
- [ ] Announce completion

### After Deployment

- [ ] Share smoke test results
- [ ] Post metrics comparison
- [ ] Document any issues encountered
- [ ] Thank team for support

---

## Emergency Contacts

**On-Call Engineer**: [TBD]  
**Database Admin**: [TBD]  
**DevOps Lead**: [TBD]  
**Product Owner**: [TBD]

---

## Additional Resources

- **Implementation Log**: `IMPLEMENTATION_LOG_2026-07-12.md`
- **Audit Report**: `COMPREHENSIVE_SYSTEM_AUDIT_2026-07-12.md`
- **Pull Request**: #275
- **Migration Scripts**: `drizzle/0001_*.sql`, `drizzle/0002_*.sql`

---

_Last Updated: 2026-07-12_
_Branch: cursor/fix-concurrent-reprocess-race-condition-a4fd_
