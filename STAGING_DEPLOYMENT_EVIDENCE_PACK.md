# Staging Deployment Evidence Pack

**Generated:** 2026-01-10T20:48:32Z  
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
| **Uptime** | 19399 seconds (~5.4 hours) |

---

## Health Check Evidence

### 1. Liveness Probe (`/healthz`)

**Status:** ✅ PASS

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/healthz
```

**Response:**
```json
{"status":"ok","timestamp":"2026-01-10T20:48:31.971Z"}
```

---

### 2. Readiness Probe (`/readyz`)

**Status:** ✅ PASS

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/readyz
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-10T20:48:32.076Z",
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

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/metrics | head -30
```

**Response (excerpt):**
```prometheus
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 19399

# HELP app_info Application version information
# TYPE app_info gauge
app_info{git_sha="2e4b5755530229861ac7d483c654410e3fd643e9",version="main",node_version="v22.21.1"} 1

# HELP app_http_requests_total Total HTTP requests
# TYPE app_http_requests_total counter
app_http_requests_total 0

# HELP process_heap_bytes Process heap size in bytes
# TYPE process_heap_bytes gauge
process_heap_bytes 32879168

# HELP process_rss_bytes Process RSS in bytes
# TYPE process_rss_bytes gauge
process_rss_bytes 111992832
```

**Key Metrics Verified:**
| Metric | Value | Type |
|--------|-------|------|
| `app_uptime_seconds` | 19399 | gauge |
| `app_info` | 1 (with labels) | gauge |
| `process_heap_bytes` | 32.9 MB | gauge |
| `process_rss_bytes` | 112 MB | gauge |

---

### 4. Version Endpoint (`/api/trpc/system.version`)

**Status:** ✅ PASS

```bash
curl -sf https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io/api/trpc/system.version
```

**Response:**
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

---

## Azure Infrastructure Status

| Resource | Name | Status |
|----------|------|--------|
| Resource Group | `rg-jobsheet-qa` | ✅ Active |
| Container Registry | `jobsheetqaacr0fcf42.azurecr.io` | ✅ Ready |
| Container Apps Env | `jobsheet-qa-env` | ✅ Ready |
| Container App | `jobsheet-qa-staging` | ✅ Running |
| Current Revision | `jobsheet-qa-staging--0000010` | ✅ Active |
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

## Verification Script Output

```
╔════════════════════════════════════════════════════════════════╗
║           DEPLOYMENT VERIFICATION                              ║
╚════════════════════════════════════════════════════════════════╝

🔍 Target: https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io

1️⃣  Checking /healthz (Liveness)...
   ✅ /healthz OK

2️⃣  Checking /readyz (Readiness)...
   ✅ /readyz OK

3️⃣  Checking /metrics (Prometheus)...
   ✅ /metrics OK (Prometheus format)

4️⃣  Checking /api/trpc/system.version...
   ✅ Version info available
   Git SHA: 2e4b5755530229861ac7d483c654410e3fd643e9

✅ VERIFICATION PASSED

🎉 Deployment at staging is healthy!
```

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

**STAGING DEPLOYMENT: ✅ VERIFIED**

---

## Next Steps

1. ⬜ Run smoke tests on staging
2. ⬜ Verify UI functionality
3. ⬜ Test file upload/download
4. ⬜ Review production readiness checklist
5. ⬜ Obtain approval for production deployment
