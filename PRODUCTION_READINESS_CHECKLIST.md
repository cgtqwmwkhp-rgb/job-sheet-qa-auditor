# Production Readiness Checklist

**Status:** 🟡 Ready for Review  
**Last Updated:** 2026-01-10T21:04:00Z  
**Staging Verification:** ✅ PASSED  
**Branch:** `ai/pr-1-staging-identity-fix`  
**HEAD SHA:** `903b762`

---

## Production Resource Names (Proposed)

| Resource | Production Name |
|----------|-----------------|
| Container App | `jobsheet-qa-production` |
| MySQL Database | `jobsheet` (same server, different user recommended) |
| Blob Container | `jobsheets-production` |
| Revision Suffix | Based on Git SHA |

---

## Pre-Production Checklist

### 1. Staging Verification Gate

| Requirement | Status |
|-------------|--------|
| `/healthz` returns 200 | ✅ PASSED |
| `/readyz` returns 200 with DB + Storage OK | ✅ PASSED |
| `/metrics` returns Prometheus format | ✅ PASSED |
| Deployed SHA matches expected | ✅ `2e4b575` |
| No errors in staging logs for 1 hour | ⬜ Pending |

### 2. Production Secrets Required

| Secret | Source | Status |
|--------|--------|--------|
| `DATABASE_URL` | Different credentials for prod | ⬜ Create |
| `AZURE_STORAGE_CONNECTION_STRING` | Same account, different container | ⬜ Verify |
| `MISTRAL_API_KEY` | Same or separate prod key | ⬜ Decide |
| `GEMINI_API_KEY` | Same or separate prod key | ⬜ Decide |
| `JWT_SECRET` | **Must be different from staging** | ⬜ Generate |

### 3. Production Environment Variables

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `STORAGE_PROVIDER` | `azure` |
| `AZURE_STORAGE_CONTAINER_NAME` | `jobsheets-production` |
| `ENABLE_PURGE_EXECUTION` | `false` ⚠️ NEVER change |
| `ENABLE_SCHEDULER` | `false` (enable after verification) |

### 4. Infrastructure Preparation

- [ ] Create production blob container: `jobsheets-production`
- [ ] Create production Container App: `jobsheet-qa-production`
- [ ] Create separate MySQL user for production (optional but recommended)
- [ ] Configure production DNS/custom domain (if applicable)

---

## Deployment Procedure

### Option A: Via GitHub Actions (Recommended)

```bash
# 1. Ensure staging is green
./scripts/verify-deployment.sh https://jobsheet-qa-staging.graywater-15013590.uksouth.azurecontainerapps.io

# 2. Trigger production deployment
# Go to: Actions → Azure Deploy → Run workflow
# Select: environment = production
# Confirm: Manual approval (if configured)
```

### Option B: Direct Azure CLI

```bash
# 1. Build and push image (if not already in ACR)
az acr build \
  --registry jobsheetqaacr0fcf42 \
  --image job-sheet-qa-auditor:$(git rev-parse --short HEAD) \
  .

# 2. Create production container app
az containerapp create \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --environment jobsheet-qa-env \
  --image jobsheetqaacr0fcf42.azurecr.io/job-sheet-qa-auditor:latest \
  --registry-server jobsheetqaacr0fcf42.azurecr.io \
  --registry-username jobsheetqaacr0fcf42 \
  --registry-password "<ACR_PASSWORD>" \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    NODE_ENV=production \
    STORAGE_PROVIDER=azure \
    AZURE_STORAGE_CONTAINER_NAME=jobsheets-production \
    ENABLE_PURGE_EXECUTION=false \
    ENABLE_SCHEDULER=false

# 3. Set secrets
az containerapp secret set \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --secrets \
    database-url="<PROD_DATABASE_URL>" \
    storage-connection-string="<STORAGE_CONN>" \
    mistral-api-key="<KEY>" \
    jwt-secret="<PROD_JWT_SECRET>"

# 4. Link secrets to env vars
az containerapp update \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --set-env-vars \
    DATABASE_URL=secretref:database-url \
    AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection-string \
    MISTRAL_API_KEY=secretref:mistral-api-key \
    JWT_SECRET=secretref:jwt-secret
```

---

## Rollback Plan

### Immediate Rollback (< 5 minutes)

```bash
# 1. Get previous revision
az containerapp revision list \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --query "[].name" -o tsv

# 2. Activate previous revision
az containerapp revision activate \
  --name <previous-revision-name> \
  --resource-group rg-jobsheet-qa

# 3. Deactivate bad revision
az containerapp revision deactivate \
  --name <bad-revision-name> \
  --resource-group rg-jobsheet-qa
```

### Full Rollback (if immediate fails)

```bash
# 1. Update to known-good image tag
az containerapp update \
  --name jobsheet-qa-production \
  --resource-group rg-jobsheet-qa \
  --image jobsheetqaacr0fcf42.azurecr.io/job-sheet-qa-auditor:<known-good-sha>
```

---

## Promotion Gate

Production deployment is **BLOCKED** until:

1. ✅ Staging verification passes (`./scripts/verify-deployment.sh`)
2. ⬜ No P0/P1 bugs open
3. ⬜ Staging monitored for 1 hour with no errors
4. ⬜ Manual smoke test completed
5. ⬜ Product owner approval obtained

---

## Post-Deployment Verification

```bash
# Run verification against production
./scripts/verify-deployment.sh https://jobsheet-qa-production.graywater-15013590.uksouth.azurecontainerapps.io

# Expected output: All checks PASS
```

---

## Monitoring & Alerts

After production deployment:

1. [ ] Verify `/metrics` scraped by monitoring system
2. [ ] Set up alerts for:
   - [ ] `/healthz` failures
   - [ ] `/readyz` failures
   - [ ] Error rate > 1%
   - [ ] Response time p99 > 5s
3. [ ] Verify logs flowing to Log Analytics

---

## Sign-Off Required

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tech Lead | | | |
| QA Lead | | | |
| Product Owner | | | |

---

## Production NOT Deployed Yet

**Current Status:** Staging only  
**Production URL:** Not yet provisioned  
**Next Step:** Complete pre-production checklist above
