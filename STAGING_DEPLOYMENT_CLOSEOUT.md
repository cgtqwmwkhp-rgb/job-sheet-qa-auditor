# Staging Deployment Closeout Pack

**Deployment Date:** 2026-01-10  
**Verified By:** Release Governor  
**Status:** ✅ VERIFIED

---

## Deployment Summary

| Item | Value |
|------|-------|
| **STAGING_URL** | https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io |
| **Deployed SHA** | `a5e2403fdec6f31c4d056b7924696328ef73e174` |
| **Short SHA** | `a5e2403` |
| **Platform Version** | `main` |
| **Build Time** | 2026-01-10T21:09:52Z |
| **Environment** | `staging` ✅ |

---

## Health Endpoint Evidence

### /healthz (Liveness)

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/healthz
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:16:03.482Z"
}
```

### /readyz (Readiness)

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/readyz
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T21:16:05.163Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 3
    },
    "storage": {
      "status": "ok"
    }
  },
  "version": {
    "sha": "a5e2403fdec6f31c4d056b7924696328ef73e174",
    "platform": "main",
    "buildTime": "2026-01-10T21:09:52Z"
  }
}
```

### /metrics (Prometheus)

```prometheus
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 1123

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
  "buildTime": "2026-01-10T21:09:52Z",
  "environment": "staging"
}
```

---

## Safety Configuration

| Setting | Value | Status |
|---------|-------|--------|
| `NODE_ENV` | `production` | ✅ |
| `APP_ENV` | `staging` | ✅ |
| `ENABLE_PURGE_EXECUTION` | `false` | ✅ |
| `ENABLE_SCHEDULER` | `false` | ✅ |
| `STORAGE_PROVIDER` | `azure` | ✅ |

---

## Watch Window Summary

| Time | Status | Uptime | Errors |
|------|--------|--------|--------|
| T+0 | ✅ OK | 125s | 0 |
| T+5m | ✅ OK | 425s | 0 |
| T+10m | ✅ OK | 735s | 0 |
| T+15m+ | ✅ OK | 1123s+ | 0 |

---

## Workflow Evidence

- **GitHub Actions URL:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions
- **Merge Commit:** `a5e2403`
- **Trigger:** Push to main (auto-deploy)

---

## Sign-Off

| Check | Status |
|-------|--------|
| SHA matches expected | ✅ |
| Environment = staging | ✅ |
| Database connectivity | ✅ |
| Storage connectivity | ✅ |
| Metrics in Prometheus format | ✅ |
| Zero errors during watch | ✅ |
| Safety flags enforced | ✅ |

**STAGING: ✅ DEPLOYMENT COMPLETE**
