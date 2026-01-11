# Staging Deployment Evidence Pack

## Stage B — Deploy to Staging + Verify Endpoints + SSOT

**Date**: 2026-01-11  
**Head SHA**: `3b0c06b58564652180636a74f86a2c062bfcb446`  
**Verified by**: Cursor (Release Governor)

---

## B1: Staging Deploy Workflow

### Deployment Status

| Step | Status | Details |
|------|--------|---------|
| Build & Push to ACR | ✅ PASS | 2m59s |
| Deploy to Staging | ✅ PASS | 4m0s |
| Verify Staging | ⚠️ INCOMPLETE | Missing STAGING_URL secret |

**Workflow Run**: [Azure Deploy #20893211741](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20893211741)

### Deploy Job Evidence

```
Deploy to Staging (ID 60027595267)
  ✓ Set up job
  ✓ Login to Azure
  ✓ Configure ACR credentials on Container App
  ✓ Deploy to Container App (Staging)
  ✓ Set environment variables
  ✓ Set secrets as environment variables
  ✓ Get staging URL
  ✓ Wait for deployment
  ✓ Smoke test staging
```

**Note**: Container image deployed successfully to Azure Container Apps staging environment.

---

## B2: Endpoint Verification (Manual Completion Required)

### Prerequisite

Set the staging URL environment variable:
```bash
export STAGING_URL="https://your-staging-app.azurecontainerapps.io"
```

### Verification Commands

Run these commands and paste outputs below:

#### /healthz

```bash
curl -sf "${STAGING_URL}/healthz" && echo "✅ OK"
```

**Output**:
```
# PASTE OUTPUT HERE
```

---

#### /readyz

```bash
curl -sf "${STAGING_URL}/readyz" | jq .
```

**Output**:
```json
# PASTE OUTPUT HERE - Expected:
# {
#   "status": "ready",
#   "environment": "staging",
#   "version": "3b0c06b",
#   "checks": {
#     "database": "ok",
#     "storage": "ok"
#   }
# }
```

---

#### /metrics (Must be Prometheus format)

```bash
curl -sf "${STAGING_URL}/metrics" | head -20
```

**Output**:
```
# PASTE OUTPUT HERE - Expected Prometheus format:
# # HELP process_cpu_seconds_total Total user and system CPU time spent in seconds.
# # TYPE process_cpu_seconds_total counter
# process_cpu_seconds_total 0.123456
# ...
```

**Verification**: Output MUST start with `# HELP` or `# TYPE` (Prometheus format), NOT HTML.

---

#### /api/trpc/system.version

```bash
curl -sf "${STAGING_URL}/api/trpc/system.version" | jq .
```

**Output**:
```json
# PASTE OUTPUT HERE - Expected:
# {
#   "result": {
#     "data": {
#       "json": {
#         "version": "1.0.0",
#         "gitSha": "3b0c06b58564652180636a74f86a2c062bfcb446",
#         "environment": "staging",
#         "nodeVersion": "22.x.x"
#       }
#     }
#   }
# }
```

**Verification**: `gitSha` MUST match HEAD (`3b0c06b...`) and `environment` MUST be `staging`.

---

## B3: SSOT Strict Mode Verification

### Check SSOT Enforcement

Verify that SSOT strict mode is active by confirming:

1. **No hybrid spec paths**: Check logs for absence of `legacyGoldSpec` or `hybridSpec` entries
2. **Selection trace includes weights**: Verify `selection_trace.json` contains signal weights

#### Option A: Check via system endpoint

```bash
curl -sf "${STAGING_URL}/api/trpc/system.platformConfig" | jq '.result.data.json.ssotMode'
```

**Expected Output**: `"strict"` or `true`

---

#### Option B: Process a document and check trace

After processing a document, check:

```bash
# Get latest selection trace (path depends on storage configuration)
# Expected content includes:
# {
#   "signals": {
#     "layoutScore": { "value": 0.85, "weight": 0.4 },
#     "fieldMatchScore": { "value": 0.9, "weight": 0.3 },
#     ...
#   },
#   "selectedTemplate": "template-xyz",
#   "confidence": 0.87,
#   "runnerUpDelta": 0.15
# }
```

---

## Staging Verification Summary

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| Deployment succeeded | ✅ | CI | 2026-01-11 |
| /healthz returns 200 | ⬜ | | |
| /readyz returns ready | ⬜ | | |
| /metrics is Prometheus format | ⬜ | | |
| system.version shows correct SHA | ⬜ | | |
| SSOT strict mode active | ⬜ | | |
| Selection trace includes weights | ⬜ | | |

---

## Action Required

1. Obtain the staging URL from Azure Container Apps
2. Configure `STAGING_URL` secret in GitHub repository settings
3. Run the verification commands above
4. Update this document with actual outputs
5. Proceed to Stage C (Staging Smoke Processing) only after all checks pass
