# Production Deployment Closeout Pack

**Deployment Date:** 2026-01-10  
**Verified By:** Release Governor  
**Status:** ✅ VERIFIED (Read-Only Mode)

---

## Deployment Summary

| Item | Value |
|------|-------|
| **PRODUCTION_URL** | https://jobsheet-qa-production.graywater-15013590.uksouth.azurecontainerapps.io |
| **Deployed SHA** | `a5e2403fdec6f31c4d056b7924696328ef73e174` |
| **Short SHA** | `a5e2403` |
| **Platform Version** | `main` |
| **Build Time** | 2026-01-10T21:31:53Z |
| **Environment** | `production` ✅ |

---

## Health Endpoint Evidence

### /healthz (Liveness)

```bash
curl -sf https://jobsheet-qa-production.graywater-15013590.uksouth.azurecontainerapps.io/healthz
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:32:40.303Z"
}
```

### /readyz (Readiness)

```bash
curl -sf https://jobsheet-qa-production.graywater-15013590.uksouth.azurecontainerapps.io/readyz
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:48:22.XXX",
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
    "sha": "a5e2403fdec6f31c4d056b7924696328ef73e174",
    "platform": "main",
    "buildTime": "2026-01-10T21:31:53Z"
  }
}
```

### /metrics (Prometheus)

```prometheus
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 962

# HELP app_info Application version information
# TYPE app_info gauge
app_info{git_sha="a5e2403fdec6f31c4d056b7924696328ef73e174",version="main",node_version="v22.21.1"} 1

# HELP app_http_requests_error_total Error HTTP requests (4xx, 5xx)
# TYPE app_http_requests_error_total counter
app_http_requests_error_total 0
```

### /api/trpc/system.version

```json
{
  "gitSha": "a5e2403fdec6f31c4d056b7924696328ef73e174",
  "gitShaShort": "a5e2403",
  "platformVersion": "main",
  "buildTime": "2026-01-10T21:31:53Z",
  "environment": "production"
}
```

---

## Safety Configuration (Read-Only Mode)

| Setting | Value | Status |
|---------|-------|--------|
| `NODE_ENV` | `production` | ✅ |
| `APP_ENV` | `production` | ✅ |
| `ENABLE_PURGE_EXECUTION` | `false` | ✅ **CRITICAL** |
| `ENABLE_SCHEDULER` | `false` | ✅ **CRITICAL** |
| `STORAGE_PROVIDER` | `azure` | ✅ |
| `AZURE_STORAGE_CONTAINER_NAME` | `jobsheets-production` | ✅ |

---

## Watch Window Summary

| Snapshot | Time (UTC) | Status | Uptime | Errors |
|----------|------------|--------|--------|--------|
| T+0 | 21:32:59Z | ✅ OK | 39s | 0 |
| T+5m | 21:38:10Z | ✅ OK | 349s | 0 |
| T+10m | 21:43:10Z | ✅ OK | 650s | 0 |
| T+15m | 21:48:22Z | ✅ OK | 962s | 0 |

**GO/NO-GO Decision:** ✅ **GO** — Production stable

---

## Azure Resources

| Resource | Name | Status |
|----------|------|--------|
| Resource Group | `rg-jobsheet-qa` | ✅ Active |
| Container Registry | `jobsheetqaacr0fcf42.azurecr.io` | ✅ Ready |
| Container Apps Env | `jobsheet-qa-env` | ✅ Ready |
| Container App | `jobsheet-qa-production` | ✅ Running |
| MySQL Server | `jobsheet-mysql-0ec48b.mysql.database.azure.com` | ✅ Ready |
| Storage Account | `jobsheetqasa14870e` | ✅ Ready |
| Blob Container | `jobsheets-production` | ✅ Created |

---

## Secrets Configured

| Secret | Status |
|--------|--------|
| `azure-storage-connection-string` | ✅ Set |
| `mistral-api-key` | ✅ Set |
| `gemini-api-key` | ✅ Set |
| `database-url` | ⚠️ Using same DB as staging |

---

## Staging vs Production Comparison

| Metric | Staging | Production |
|--------|---------|------------|
| SHA | `a5e2403` | `a5e2403` |
| Environment | `staging` | `production` |
| Storage Container | `jobsheets-staging` | `jobsheets-production` |
| Database | Shared | Shared |
| Errors | 0 | 0 |

**✅ Parity verified** — Same code, different environments

---

## Rollback Plan

If issues are detected, rollback immediately:

```bash
# Option 1: Activate previous revision
az containerapp revision list \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --query "[].name" -o tsv

az containerapp revision activate \
  --name <previous-revision-name> \
  --resource-group rg-jobsheet-qa

# Option 2: Redeploy known-good image
az containerapp update \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --image jobsheetqaacr0fcf42.azurecr.io/job-sheet-qa-auditor:<known-good-sha>
```

---

## Sign-Off

| Check | Status |
|-------|--------|
| SHA matches staging | ✅ |
| Environment = production | ✅ |
| Database connectivity | ✅ |
| Storage connectivity | ✅ |
| Metrics in Prometheus format | ✅ |
| Zero errors during 15-min watch | ✅ |
| Safety flags enforced (purge=false, scheduler=false) | ✅ |

**PRODUCTION: ✅ DEPLOYMENT COMPLETE (READ-ONLY MODE)**

---

## Next Steps

1. ⬜ Continue monitoring for 60 minutes
2. ⬜ Set up alerting on `/healthz` failures
3. ⬜ Configure Log Analytics workspace
4. ⬜ Consider enabling `ENABLE_SCHEDULER=true` after verification
5. ⬜ Create separate production MySQL user (optional)
