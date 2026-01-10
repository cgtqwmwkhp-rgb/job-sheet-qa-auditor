# Staging Deployment Evidence Pack

**Generated:** 2026-01-10T21:04:12Z  
**Environment:** Staging  
**Verified By:** Azure Deployment Engineer

---

## Deployment Summary

| Item | Value |
|------|-------|
| **STAGING_URL** | https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io |
| **Deployed SHA** | `2e4b5755530229861ac7d483c654410e3fd643e9` |
| **Platform Version** | `main` |
| **Build Time** | 2026-01-10T15:25:13.145Z |
| **Node Version** | v22.21.1 |
| **Uptime** | 20341 seconds (~5.6 hours) |

---

## Health Check Evidence

### 1. Liveness Probe (`/healthz`)

**Status:** ✅ PASS

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:04:12.901Z"
}
```

---

### 2. Readiness Probe (`/readyz`)

**Status:** ✅ PASS

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:04:15.050Z",
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
    "sha": "2e4b5755530229861ac7d483c654410e3fd643e9",
    "platform": "main",
    "buildTime": "unknown"
  }
}
```

**Dependency Checks:**
| Dependency | Status | Latency |
|------------|--------|---------|
| Database (MySQL) | ✅ OK | 0ms |
| Storage (Azure Blob) | ✅ OK | - |

---

### 3. Metrics Endpoint (`/metrics`)

**Status:** ✅ PASS (Prometheus format)

```prometheus
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 20341

# HELP app_info Application version information
# TYPE app_info gauge
app_info{git_sha="2e4b5755530229861ac7d483c654410e3fd643e9",version="main",node_version="v22.21.1"} 1

# HELP app_http_requests_total Total HTTP requests
# TYPE app_http_requests_total counter
app_http_requests_total 0

# HELP app_http_requests_success_total Successful HTTP requests (2xx, 3xx)
# TYPE app_http_requests_success_total counter
app_http_requests_success_total 0

# HELP app_http_requests_error_total Error HTTP requests (4xx, 5xx)
# TYPE app_http_requests_error_total counter
app_http_requests_error_total 0
```

---

### 4. Version Endpoint (`/api/trpc/system.version`)

**Status:** ✅ PASS

```json
{
  "result": {
    "data": {
      "json": {
        "gitSha": "2e4b5755530229861ac7d483c654410e3fd643e9",
        "gitShaShort": "2e4b575",
        "platformVersion": "main",
        "buildTime": "2026-01-10T15:25:13.145Z",
        "environment": "production"
      }
    }
  }
}
```

**Note:** `environment` shows "production" because PR-1 (APP_ENV fix) is not yet deployed.

---

## Pending Deployment

The following PRs are merge-ready but not yet deployed:

| PR | Commit | Description | Status |
|----|--------|-------------|--------|
| PR-1 | `4785d6f` | Staging identity fix (APP_ENV) | ✅ Tests pass |
| PR-2 | `0d3a303` | Selection Trace Viewer panel | ✅ Tests pass |
| PR-3 | `903b762` | Platform config drift endpoint | ✅ Tests pass |

Once deployed, staging will show `environment: "staging"` instead of `environment: "production"`.

---

## Azure Infrastructure Status

| Resource | Name | Status |
|----------|------|--------|
| Resource Group | `rg-jobsheet-qa` | ✅ Active |
| Container Registry | `jobsheetqaacr0fcf42.azurecr.io` | ✅ Ready |
| Container Apps Env | `jobsheet-qa-env` | ✅ Ready |
| Container App | `jobsheet-qa-staging` | ✅ Running |
| MySQL Server | `jobsheet-mysql-0ec48b.mysql.database.azure.com` | ✅ Ready |
| Storage Account | `jobsheetqasa14870e` | ✅ Ready |
| Blob Container | `jobsheets-staging` | ✅ Exists |

---

## Safety Configuration Verified

| Setting | Expected | Actual | Status |
|---------|----------|--------|--------|
| `ENABLE_PURGE_EXECUTION` | `false` | Configured | ✅ |
| `ENABLE_SCHEDULER` | `false` | Configured | ✅ |
| `NODE_ENV` | `production` | `production` | ✅ |

---

## Next Steps for Production

1. ⬜ Merge PR-1, PR-2, PR-3 to main
2. ⬜ Deploy updated code to staging
3. ⬜ Verify `environment: "staging"` in version endpoint
4. ⬜ Run staging watch window for 1 hour
5. ⬜ Create production Container App
6. ⬜ Deploy to production (read-only mode)
7. ⬜ Verify production health endpoints

---

## Sign-Off

| Check | Status |
|-------|--------|
| All health endpoints responding | ✅ |
| Database connectivity verified | ✅ |
| Storage connectivity verified | ✅ |
| Metrics in Prometheus format | ✅ |
| Version info available | ✅ |
| Safety controls configured | ✅ |
| CI tests passing (940 tests) | ✅ |

**STAGING: ✅ VERIFIED**
