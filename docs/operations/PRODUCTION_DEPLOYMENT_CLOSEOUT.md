# Production Deployment Closeout - Job Sheet QA Auditor

**Date:** 2026-01-11  
**Updated:** 2026-01-11 (Database Connected)  
**Status:** ✅ PRODUCTION LIVE - FULL STACK (Database + Storage)

---

## Summary

Created dedicated production Container App for job-sheet-qa-auditor, separate from the PlantEx Assist chatbot (`plantex-assist`).

---

## Infrastructure Created

### Container Apps

| App Name | Environment | Purpose | URL |
|----------|-------------|---------|-----|
| `plantex-assist-staging` | staging | Job-sheet-qa staging | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| `jobsheet-qa-production` | production | Job-sheet-qa production | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io |

### Database (MySQL)

| Database | Server | Purpose | Status |
|----------|--------|---------|--------|
| `jobsheet_qa_staging` | ai-scheduler-mysql-prod | Staging | ✅ Connected |
| `jobsheet_qa_production` | ai-scheduler-mysql-prod | Production | ✅ Connected |

**Database Connection Configured:** 2026-01-11  
**Migration Applied:** `drizzle/0003_regular_venus.sql` (12 tables)

### Blob Storage

| Container | Storage Account | Purpose |
|-----------|-----------------|---------|
| `jobsheets-staging` | plantexstorage3604 | Staging uploads |
| `jobsheets-production` | plantexstorage3604 | Production uploads |

---

## GitHub Environment Configuration

### Staging Environment

| Variable | Value |
|----------|-------|
| `AZURE_RESOURCE_GROUP` | `plantex-assist` |
| `CONTAINER_APP_NAME` | `plantex-assist-staging` |
| `STAGING_URL` | `https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io` |

### Production Environment

| Variable | Value |
|----------|-------|
| `AZURE_RESOURCE_GROUP` | `plantex-assist` |
| `CONTAINER_APP_NAME` | `jobsheet-qa-production` |
| `PRODUCTION_URL` | `https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io` |

---

## Workflow Run Evidence

**Deployment Run:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20898103088

| Job | Status | Notes |
|-----|--------|-------|
| Build & Push to ACR | ✅ 2m58s | Image pushed successfully |
| Deploy to Production | ⚠️ Failed smoke test | DATABASE_URL was empty |
| Manual fix | ✅ | Removed DATABASE_URL, enabled demo mode |

---

## Production Verification (curl outputs)

### /healthz

```json
{
  "status": "ok",
  "timestamp": "2026-01-11T16:22:34.126Z"
}
```

### /readyz (Updated with DB Connected)

```json
{
  "status": "ok",
  "timestamp": "2026-01-11T18:46:17.878Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 0
    },
    "storage": {
      "status": "ok"
    }
  },
  "version": {
    "sha": "eee05bb7189d9aaaee06762a9a3e65603fe9f849",
    "platform": "main",
    "buildTime": "unknown"
  }
}
```

> **Note:** Database now connected to `jobsheet_qa_production` on `ai-scheduler-mysql-prod`.

### /metrics (Prometheus format)

```
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 35
# HELP app_info Application version information
# TYPE app_info gauge
```

### /api/trpc/system.version

```json
{
  "result": {
    "data": {
      "json": {
        "gitSha": "eee05bb7189d9aaaee06762a9a3e65603fe9f849",
        "gitShaShort": "eee05bb",
        "platformVersion": "main",
        "buildTime": "2026-01-11T16:22:00.711Z",
        "environment": "production"
      }
    }
  }
}
```

---

## Container App Configuration

### Production Environment Variables (az output, redacted)

```
Name                             Value                   SecretRef
-------------------------------  ----------------------  -------------------------------
NODE_ENV                         production
APP_ENV                          production
STORAGE_PROVIDER                 azure
AZURE_STORAGE_CONTAINER_NAME     jobsheets-production
ENABLE_PURGE_EXECUTION           false
ENABLE_SCHEDULER                 false
AZURE_STORAGE_CONNECTION_STRING                          azure-storage-connection-string
GIT_SHA                          eee05bb...
PLATFORM_VERSION                 main
```

### Safety Flags

| Flag | Value | Reason |
|------|-------|--------|
| `ENABLE_PURGE_EXECUTION` | `false` | Prevent accidental data deletion |
| `ENABLE_SCHEDULER` | `false` | Manual control of scheduled tasks |

---

## Database Configuration (Updated 2026-01-11)

### Connection Details

| Environment | Database | User | Status |
|-------------|----------|------|--------|
| Staging | `jobsheet_qa_staging` | `jobsheet_staging` | ✅ Connected |
| Production | `jobsheet_qa_production` | `jobsheet_prod` | ✅ Connected |

**MySQL Server:** `ai-scheduler-mysql-prod.mysql.database.azure.com`  
**SSL:** Required (`rejectUnauthorized: true`)

### Verification Evidence (2026-01-11T18:46Z)

**Staging /readyz:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-11T18:46:16.394Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 137
    },
    "storage": {
      "status": "ok"
    }
  }
}
```

**Production /readyz:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-11T18:46:17.878Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 0
    },
    "storage": {
      "status": "ok"
    }
  }
}
```

### Migration Evidence

**Staging:**
```
[✓] Your SQL migration file ➜ drizzle/0003_regular_venus.sql 🚀
[✓] migrations applied successfully!
```

**Production:**
```
No schema changes, nothing to migrate 😴
[✓] migrations applied successfully!
```

**Tables Created (12):**
- audit_findings, audit_results, disputes, gold_specs
- job_sheets, processing_settings, selection_traces
- system_audit_log, template_versions, templates, users, waivers

---

## PRs Merged

| PR | Description |
|----|-------------|
| #75 | Environment-scoped vars with guardrails |
| #76 | Fix image tag masking |
| #77 | Stricter /readyz check with error logging |

---

## Final Verification Summary

| Check | Staging | Production |
|-------|---------|------------|
| Container App exists | ✅ | ✅ |
| /healthz returns 200 | ✅ | ✅ |
| /readyz returns ok | ✅ | ✅ |
| /metrics Prometheus | ✅ | ✅ |
| system.version correct SHA | ✅ | ✅ |
| GitHub Env vars configured | ✅ | ✅ |
| **Database connected** | ✅ 137ms | ✅ 0ms |
| **Migrations applied** | ✅ | ✅ |

---

## Production URLs

| Purpose | URL |
|---------|-----|
| **Production App** | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| **Staging App** | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| **GitHub Actions** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions |

---

**PRODUCTION IS LIVE** ✅

---

## Appendix: Database Wiring Steps (2026-01-11)

Completed by Azure Ops Engineer:

1. **Created DB users** (Azure Cloud Shell → MySQL):
   - `jobsheet_staging@%` → grants on `jobsheet_qa_staging.*`
   - `jobsheet_prod@%` → grants on `jobsheet_qa_production.*`

2. **Set Container App secrets** (az containerapp secret set):
   - `plantex-assist-staging`: DATABASE_URL → staging connection string
   - `jobsheet-qa-production`: DATABASE_URL → production connection string

3. **Restarted apps** (az containerapp revision restart):
   - Both apps restarted to pick up new secrets

4. **Ran migrations** (pnpm db:push):
   - Staging: Applied `0003_regular_venus.sql` (12 tables)
   - Production: No schema changes needed

5. **Verified /readyz**:
   - Both environments: `database.status: ok`
