# Production Deployment Plan
**Target Release**: Security Hardening & Operational Infrastructure (PR #275)  
**Status**: Ready for Production (Pending Staging Validation)  
**Date Prepared**: 2026-07-12

---

## 📋 Pre-Deployment Checklist

### Staging Validation Requirements
- [ ] New code version live in staging (SHA: `0b4fe31`)
- [ ] Database migrations applied successfully
- [ ] No foreign key violation errors
- [ ] All health checks passing
- [ ] Smoke tests completed
- [ ] Performance tests show improvement
- [ ] No critical errors in staging logs (24h observation)

### Production Readiness
- [ ] Database backup completed (< 1 hour old)
- [ ] Rollback plan reviewed and approved
- [ ] On-call engineer available
- [ ] Deployment window scheduled (low-traffic period)
- [ ] Stakeholders notified
- [ ] Monitoring dashboards ready

---

## 🚀 Deployment Steps

### Phase 1: Pre-Deployment (T-60 minutes)

#### 1.1 Database Backup
```bash
# Connect to production database
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_prod \
      -p jobsheet_qa_production \
      --ssl-mode=REQUIRED

# Create backup
mysqldump --single-transaction \
          --routines \
          --triggers \
          --events \
          jobsheet_qa_production > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
gzip backup_*.sql
```

**Success Criteria**: Backup file exists and size is reasonable (> 1MB)

#### 1.2 Enable Maintenance Mode (Optional)
```bash
# If maintenance window is needed, update environment variable
az containerapp update \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --set-env-vars MAINTENANCE_MODE=true
```

#### 1.3 Capture Baseline Metrics
```bash
# Current version
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz \
  | jq '{sha, dbLatency: .checks.database.latencyMs, timestamp: .timestamp}' \
  > pre_deployment_metrics.json

# Recent error rate
az containerapp logs show \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --tail 100 \
  | grep -i error | wc -l
```

---

### Phase 2: Deployment (T-0)

#### 2.1 Trigger Production Deploy
Production deployment is **MANUAL** via GitHub Actions:

```bash
gh workflow run "Azure Deploy" \
  --ref main \
  -f environment=production \
  -f deploy_sha=$(git rev-parse main)
```

**Monitor**: https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions

#### 2.2 Watch Deployment Progress
```bash
# Get latest workflow run
RUN_ID=$(gh run list --workflow="Azure Deploy" --limit 1 --json databaseId --jq '.[0].databaseId')

# Watch logs
gh run watch $RUN_ID
```

**Expected Duration**: 8-12 minutes

**Success Indicators**:
- ✅ Build & Push to ACR: success
- ✅ Deploy to Production: success
- ✅ Verify Production: success

---

### Phase 3: Database Migrations (T+15 minutes)

#### 3.1 Apply Migrations
```bash
# Connect to production database
export DB_HOST="ai-scheduler-mysql-prod.mysql.database.azure.com"
export DB_USER="jobsheet_prod"
export DB_NAME="jobsheet_qa_production"

# Test connection
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME --ssl-mode=REQUIRED -e "SELECT 1;"

# Run Migration 1: Foreign Keys
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME --ssl-mode=REQUIRED \
  < drizzle/0001_add_foreign_keys.sql

# Verify
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME --ssl-mode=REQUIRED -e \
  "SELECT COUNT(*) as foreign_keys 
   FROM information_schema.KEY_COLUMN_USAGE 
   WHERE TABLE_SCHEMA = 'jobsheet_qa_production' 
     AND REFERENCED_TABLE_NAME IS NOT NULL;"

# Expected: ~21 foreign keys
```

#### 3.2 Apply Performance Indexes
```bash
# Run Migration 2: Indexes
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME --ssl-mode=REQUIRED \
  < drizzle/0002_add_performance_indexes.sql

# Verify
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME --ssl-mode=REQUIRED -e \
  "SELECT COUNT(*) as indexes 
   FROM information_schema.STATISTICS 
   WHERE TABLE_SCHEMA = 'jobsheet_qa_production' 
     AND INDEX_NAME != 'PRIMARY';"

# Expected: ~30+ indexes
```

**Duration**: 30-60 seconds per migration  
**Downtime**: None (online DDL operations)

---

### Phase 4: Verification (T+20 minutes)

#### 4.1 Health Checks
```bash
# Check all health endpoints
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/healthz | jq .
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq .

# Verify correct version
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz \
  | jq -r '.version.sha' | grep -q "0b4fe31"
```

**Success Criteria**:
- `status: "ok"`
- `database.status: "ok"`
- `storage.status: "ok"`
- `version.sha: "0b4fe31a9033cdf46083971f6d0124005a87f71f"`

#### 4.2 Smoke Tests
Run critical user flows (see TESTING_CHECKLIST.md):
- [ ] User login
- [ ] Document upload
- [ ] Document processing
- [ ] Audit results display
- [ ] Data export

#### 4.3 Monitor for Errors
```bash
# Watch logs for 10 minutes
az containerapp logs show \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --follow \
  --tail 50
```

**Red Flags**:
- Foreign key constraint violations
- 500 errors
- Database connection errors
- Performance degradation

---

### Phase 5: Post-Deployment (T+30 minutes)

#### 5.1 Disable Maintenance Mode
```bash
az containerapp update \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --remove-env-vars MAINTENANCE_MODE
```

#### 5.2 Capture Post-Deployment Metrics
```bash
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz \
  | jq '{sha, dbLatency: .checks.database.latencyMs, timestamp: .timestamp}' \
  > post_deployment_metrics.json

# Compare
echo "=== Database Latency Comparison ==="
echo -n "Before: " && jq -r '.dbLatency' pre_deployment_metrics.json
echo -n "After:  " && jq -r '.dbLatency' post_deployment_metrics.json
```

#### 5.3 Update Documentation
- [ ] Update deployment log
- [ ] Document any issues encountered
- [ ] Update runbook with lessons learned
- [ ] Notify stakeholders of completion

---

## 🚨 Rollback Procedure

### When to Rollback
- Critical errors in production logs
- Database integrity issues
- Application unavailability > 5 minutes
- Data corruption detected

### Rollback Steps

#### Option A: Revert to Previous Container Image
```bash
# Get previous revision
az containerapp revision list \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --query "[?properties.active==true].name" -o tsv

# Switch traffic to previous revision
PREVIOUS_REVISION="<revision-name>"
az containerapp ingress traffic set \
  --name jobsheet-qa-production \
  --resource-group plantex-assist \
  --revision-weight $PREVIOUS_REVISION=100
```

**Duration**: 2-3 minutes  
**Impact**: Immediate revert to old code

#### Option B: Revert Database Migrations
```bash
# Restore from backup
mysql -h ai-scheduler-mysql-prod.mysql.database.azure.com \
      -u jobsheet_prod \
      -p jobsheet_qa_production \
      --ssl-mode=REQUIRED < backup_TIMESTAMP.sql
```

**Duration**: 5-10 minutes (depends on backup size)  
**Impact**: Complete data rollback

⚠️ **WARNING**: Database rollback loses all data changes since backup

---

## 📊 Success Metrics

### Deployment Success
- ✅ Zero downtime achieved
- ✅ All health checks green within 5 minutes
- ✅ No critical errors in first 30 minutes
- ✅ Database latency < 50ms
- ✅ All smoke tests passing

### Feature Validation
- ✅ Object-level authorization working
- ✅ File upload validation active
- ✅ No foreign key violations
- ✅ Performance improvement visible (query times)
- ✅ New batch operations accessible to QA leads

---

## 🔍 Monitoring Plan

### First 1 Hour (Active Monitoring)
- Watch application logs continuously
- Monitor error rates every 5 minutes
- Check database performance metrics
- Run smoke tests every 15 minutes

### First 24 Hours (Passive Monitoring)
- Check error rates every hour
- Review slow query log
- Monitor foreign key violation attempts
- Track authorization denials (should see activity)

### First Week
- Daily health check review
- Performance comparison reports
- User feedback collection
- Database index usage analysis

---

## 📞 Contact Information

**Deployment Lead**: [TBD]  
**Database Admin**: [TBD]  
**On-Call Engineer**: [TBD]  
**Escalation Path**: [TBD]

---

## 📝 Deployment Checklist Summary

**Pre-Deployment** (60 min before):
- [ ] Database backup completed
- [ ] Staging fully validated
- [ ] Team notified
- [ ] Monitoring ready

**Deployment** (15 min):
- [ ] GitHub Actions triggered
- [ ] Build successful
- [ ] Container deployed
- [ ] Health checks passing

**Migrations** (5 min):
- [ ] Foreign keys applied
- [ ] Indexes created
- [ ] Verification complete

**Verification** (30 min):
- [ ] Smoke tests passed
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] Metrics captured

**Post-Deployment**:
- [ ] Maintenance mode disabled
- [ ] Documentation updated
- [ ] Stakeholders notified
- [ ] Monitoring scheduled

---

**Prepared by**: Cursor Cloud Agent  
**Last Updated**: 2026-07-12  
**Deployment Target**: Production (jobsheet-qa-production)  
**Estimated Total Time**: 90 minutes
