# Production Deployment Evidence Pack

## Stage E — Production Deploy (Read-Only) + Verification

**Date**: 2026-01-11  
**Head SHA**: `3b0c06b58564652180636a74f86a2c062bfcb446`  
**Environment**: Production (READ-ONLY)  
**Status**: ⏳ PENDING (Manual trigger required)

---

## Prerequisites

Before production deployment:
- [x] Stage B (Staging Deploy) completed
- [x] Stage C (Smoke Processing) - skipped (staging database pending)
- [x] Stage D (Watch Window) - skipped (staging database pending)
- [ ] Production URL configured in GitHub Environment

```bash
export PRODUCTION_URL="https://your-production-app.azurecontainerapps.io"
```

---

## E1: Production Configuration Verification

### Safety Flags (NON-NEGOTIABLE)

Before triggering production deploy, verify these flags are set:

| Flag | Required Value | Actual Value | Status |
|------|----------------|--------------|--------|
| ENABLE_PURGE_EXECUTION | `false` | | ⬜ |
| ENABLE_SCHEDULER | `false` | | ⬜ |
| APP_ENV | `production` | | ⬜ |

**Verification Method**:
1. Check GitHub Environment "production" settings
2. Or verify via Azure Container App environment variables

```bash
# If using Azure CLI:
az containerapp show --name <app-name> --resource-group <rg> --query "properties.template.containers[0].env"
```

**Evidence**:
```
// PASTE configuration verification output here
```

---

## E2: Production Deploy Trigger

### Manual Dispatch

Production deployment requires manual workflow dispatch:

```bash
gh workflow run azure-deploy.yml \
  --field environment=production \
  --ref main
```

Or trigger via GitHub UI:
1. Go to Actions → Azure Deploy
2. Click "Run workflow"
3. Select `production` environment
4. Confirm HEAD SHA matches: `3b0c06b58564652180636a74f86a2c062bfcb446`

### Deployment Run

| Field | Value |
|-------|-------|
| Workflow Run ID | |
| Workflow Run URL | |
| Triggered At | |
| Completed At | |
| Status | |

---

## E3: Endpoint Verification

### /healthz

```bash
curl -sf "${PRODUCTION_URL}/healthz" && echo "✅ OK"
```

**Output**:
```
// PASTE OUTPUT HERE
```

---

### /readyz

```bash
curl -sf "${PRODUCTION_URL}/readyz" | jq .
```

**Output**:
```json
// PASTE OUTPUT HERE - Expected:
// {
//   "status": "ready",
//   "environment": "production",
//   "version": "3b0c06b",
//   "checks": {
//     "database": "ok",
//     "storage": "ok"
//   }
// }
```

**Verification**:
- [ ] `environment` = `production`
- [ ] `version` matches HEAD SHA

---

### /metrics (Prometheus Format)

```bash
curl -sf "${PRODUCTION_URL}/metrics" | head -20
```

**Output**:
```
// PASTE OUTPUT HERE - MUST be Prometheus format, NOT HTML
```

**Verification**: Output starts with `# HELP` or `# TYPE` (Prometheus format)

- [ ] Prometheus format confirmed

---

### /api/trpc/system.version

```bash
curl -sf "${PRODUCTION_URL}/api/trpc/system.version" | jq .
```

**Output**:
```json
// PASTE OUTPUT HERE - Expected:
// {
//   "result": {
//     "data": {
//       "json": {
//         "version": "1.0.0",
//         "gitSha": "3b0c06b58564652180636a74f86a2c062bfcb446",
//         "environment": "production",
//         "nodeVersion": "22.x.x"
//       }
//     }
//   }
// }
```

**Verification**:
- [ ] `gitSha` = `3b0c06b58564652180636a74f86a2c062bfcb446`
- [ ] `environment` = `production`

---

## E4: Safety Flag Runtime Verification

After deployment, verify safety flags are active:

```bash
curl -sf "${PRODUCTION_URL}/api/trpc/system.platformConfig" | jq '{
  purgeEnabled: .result.data.json.enablePurgeExecution,
  schedulerEnabled: .result.data.json.enableScheduler,
  environment: .result.data.json.environment
}'
```

**Expected Output**:
```json
{
  "purgeEnabled": false,
  "schedulerEnabled": false,
  "environment": "production"
}
```

**Actual Output**:
```json
// PASTE OUTPUT HERE
```

**Verification**:
- [ ] `purgeEnabled` = `false`
- [ ] `schedulerEnabled` = `false`

---

## Production Verification Summary

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| ENABLE_PURGE_EXECUTION=false | ⬜ | | |
| ENABLE_SCHEDULER=false | ⬜ | | |
| Deployment succeeded | ⬜ | | |
| /healthz returns 200 | ⬜ | | |
| /readyz returns ready | ⬜ | | |
| /metrics is Prometheus format | ⬜ | | |
| system.version shows correct SHA | ⬜ | | |
| Runtime safety flags confirmed | ⬜ | | |

---

## Rollback Plan

If issues detected, rollback using:

```bash
# Option 1: Redeploy previous version
gh workflow run azure-deploy.yml \
  --field environment=production \
  --ref <previous-stable-sha>

# Option 2: Azure CLI rollback
az containerapp revision list --name <app> --resource-group <rg> --query "[].name"
az containerapp update --name <app> --resource-group <rg> --revision <previous-revision>
```

---

## Stage E Conclusion

- [ ] Production deployed with correct SHA
- [ ] All safety flags verified (read-only mode)
- [ ] All endpoints healthy and correct format
- [ ] Ready for production monitoring

**Signed Off By**: ____________________  
**Date**: ____-__-__
