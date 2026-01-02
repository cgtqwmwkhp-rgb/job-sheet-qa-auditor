# Operational Runbook

## Job Sheet QA Auditor - Operations Guide

This runbook provides procedures for common operational tasks and incident response.

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Incident Response](#incident-response)
3. [Common Issues & Resolutions](#common-issues--resolutions)
4. [Maintenance Procedures](#maintenance-procedures)
5. [Escalation Matrix](#escalation-matrix)

---

## Daily Operations

### Morning Health Check

1. **Verify System Status**
   - Check dashboard loads correctly
   - Verify recent audit results are processing
   - Check for any stuck jobs in queue

2. **Review Error Logs**
   - Check for recurring errors
   - Note any new error patterns
   - Clear transient errors from DLQ

3. **Monitor Queue Depth**
   - Processing queue should be < 100 items
   - If > 100, investigate bottleneck

### End of Day Tasks

1. Review daily processing statistics
2. Check for unresolved disputes
3. Verify backup completed successfully
4. Note any issues for next shift

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P1 | System Down | 15 minutes | Complete outage |
| P2 | Major Feature Broken | 1 hour | OCR not working |
| P3 | Minor Feature Issue | 4 hours | UI glitch |
| P4 | Cosmetic/Low Impact | 24 hours | Typo in UI |

### P1 Incident Procedure

1. **Acknowledge** (0-5 min)
   - Confirm incident
   - Notify stakeholders
   - Start incident channel

2. **Assess** (5-15 min)
   - Identify affected components
   - Check recent deployments
   - Review error logs

3. **Mitigate** (15-30 min)
   - Rollback if deployment-related
   - Restart services if needed
   - Enable maintenance mode if required

4. **Resolve** (30+ min)
   - Implement fix
   - Verify resolution
   - Monitor for recurrence

5. **Post-Incident**
   - Document timeline
   - Conduct blameless retrospective
   - Create follow-up tickets

---

## Common Issues & Resolutions

### Issue: OCR Processing Stuck

**Symptoms:**
- Documents stuck in "Processing" state
- Queue depth increasing

**Resolution:**
1. Check Mistral API status
2. Verify API key is valid
3. Check rate limits
4. Restart processing worker:
   ```bash
   # Restart the server
   pnpm dev
   ```
5. Retry failed jobs from DLQ

### Issue: Database Connection Errors

**Symptoms:**
- "Connection refused" errors
- Slow page loads
- Timeouts

**Resolution:**
1. Verify database server is running
2. Check connection pool limits
3. Review active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```
4. Kill idle connections if needed
5. Restart application if pool exhausted

### Issue: File Upload Failures

**Symptoms:**
- Upload button unresponsive
- "Upload failed" errors
- Files not appearing in list

**Resolution:**
1. Check S3 bucket permissions
2. Verify S3 credentials
3. Check file size (max 50MB)
4. Verify file type (PDF, PNG, JPG)
5. Check browser console for errors

### Issue: Authentication Failures

**Symptoms:**
- Users cannot log in
- "Invalid token" errors
- Session expires immediately

**Resolution:**
1. Verify JWT_SECRET is set
2. Check OAuth server status
3. Clear browser cookies
4. Verify clock sync between servers
5. Check token expiration settings

### Issue: Slow Performance

**Symptoms:**
- Page loads > 3 seconds
- API responses > 1 second
- UI feels sluggish

**Resolution:**
1. Check database query performance
2. Review N+1 query issues
3. Check memory usage
4. Verify CDN is working
5. Review recent code changes

---

## Maintenance Procedures

### Database Maintenance

**Weekly:**
```sql
-- Analyze tables for query optimization
ANALYZE;

-- Check for bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename))
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

**Monthly:**
```sql
-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Reindex if needed
REINDEX DATABASE your_database;
```

### Log Rotation

Logs are automatically rotated. Manual cleanup:
```bash
# Remove logs older than 30 days
find /var/log/app -name "*.log" -mtime +30 -delete
```

### Backup Verification

Weekly backup verification:
1. Download latest backup
2. Restore to test environment
3. Verify data integrity
4. Document results

---

## Escalation Matrix

| Issue Type | First Contact | Escalation |
|------------|---------------|------------|
| Application Bug | Dev Team | Tech Lead |
| Infrastructure | DevOps | Platform Team |
| Security | Security Team | CISO |
| Data Issue | DBA | Data Lead |
| Business Logic | Product Owner | Product Manager |

### Contact Information

- **On-Call Engineer**: Check PagerDuty
- **Tech Lead**: [Contact Info]
- **DevOps**: [Contact Info]
- **Security**: [Contact Info]

---

## Appendix

### Useful Commands

```bash
# Check application status
pnpm dev

# Run tests
pnpm test

# Check database connection
pnpm db:push --dry-run

# View recent logs
tail -f /var/log/app/app.log

# Check disk space
df -h

# Check memory usage
free -m

# Check running processes
ps aux | grep node
```

### Environment Variables Reference

See `DEPLOYMENT.md` for complete list.

### API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/trpc/*` | POST | tRPC endpoints |
| `/api/upload` | POST | File upload |

---

*Last Updated: January 2026*
