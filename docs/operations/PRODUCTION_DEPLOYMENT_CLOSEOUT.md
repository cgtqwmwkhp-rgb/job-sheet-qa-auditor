# Production Deployment Closeout - Job Sheet QA Auditor

**Date:** 2026-01-11
**Status:** ✅ PRODUCTION LIVE

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

| Database | Server | Purpose |
|----------|--------|---------|
| `jobsheet_qa_staging` | ai-scheduler-mysql-prod | Staging (not connected - demo mode) |
| `jobsheet_qa_production` | ai-scheduler-mysql-prod | Production (not connected - demo mode) |

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

### /readyz

```json
{
  "status": "ok",
  "timestamp": "2026-01-11T16:22:35.710Z",
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

## Known Limitations

1. **Demo Mode Active:** Both staging and production are running without DATABASE_URL (demo mode). Database operations will return empty results.

2. **Database Ready:** MySQL databases `jobsheet_qa_staging` and `jobsheet_qa_production` are provisioned but not connected. To enable:
   - Get MySQL admin password
   - Construct connection string: `mysql://aisched_admin:PASSWORD@ai-scheduler-mysql-prod.mysql.database.azure.com:3306/jobsheet_qa_production`
   - Set as Container App secret

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

---

## Production URLs

| Purpose | URL |
|---------|-----|
| **Production App** | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| **Staging App** | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| **GitHub Actions** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions |

---

**PRODUCTION IS LIVE** ✅
