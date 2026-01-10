# PR-5, PR-6, PR-7 Deployment Guide

## Summary of Changes

### PR-5: Semantic Alignment + Drift Guard
- Replaced "VALID" outcome with `status: 'PASS'`
- Ensured `reasonCode` is never "VALID" (null when status is PASS)
- Added drift guard contract test to fail if `reasonCode="VALID"` is emitted
- Updated golden dataset and all fixture files
- Updated canonical reason codes in parity config

### PR-6: Pipeline Wiring with Feature Flags
- Created `pipelineIntegration` module
- Wired `criticalFieldExtractor` in extraction path
- Wired `imageQaFusion` for tickboxes/signature outputs
- Wired `deterministicCache` around fileHash+templateHash boundary
- Added comprehensive contract tests

### PR-7: Deploy + Verify (This Document)

---

## Deployment Steps

### Step 1: Merge to Main

```bash
# Ensure you're on the feature branch
git checkout ai/pr-1234-enhancements

# Push the branch (if not already pushed)
git push origin ai/pr-1234-enhancements

# Create a PR and merge, or merge directly:
git checkout main
git pull origin main
git merge ai/pr-1234-enhancements
git push origin main
```

### Step 2: Deploy to Staging

Trigger the GitHub Actions workflow:

```bash
# Via GitHub CLI
gh workflow run azure-deploy.yml -f environment=staging -f ref=main

# Or navigate to GitHub Actions UI and manually trigger
```

### Step 3: Verify Staging Endpoints

After deployment completes (wait ~3-5 minutes), run verification:

```bash
STAGING_URL="https://<your-staging-url>"

# Health check
curl -s "$STAGING_URL/healthz"
# Expected: {"ok":true}

# Readiness check
curl -s "$STAGING_URL/readyz"
# Expected: {"ok":true,"database":"connected","storage":"connected"}

# Metrics (Prometheus format)
curl -s "$STAGING_URL/metrics" | head -20
# Expected: Prometheus format metrics

# System version
curl -s "$STAGING_URL/api/trpc/system.version"
# Expected: {"environment":"staging","gitSha":"<deployed-sha>","..."}
```

### Step 4: Fixture-Based Smoke Test (Optional)

If you have fixture data available:

```bash
# Run fixture smoke test
pnpm run fixture:smoke --url "$STAGING_URL"
```

### Step 5: Deploy to Production (Read-Only)

After staging verification passes:

```bash
# Trigger production deployment
gh workflow run azure-deploy.yml -f environment=production -f ref=main
```

### Step 6: Verify Production Endpoints

```bash
PRODUCTION_URL="https://<your-production-url>"

# Same verification as staging
curl -s "$PRODUCTION_URL/healthz"
curl -s "$PRODUCTION_URL/readyz"
curl -s "$PRODUCTION_URL/metrics" | head -20
curl -s "$PRODUCTION_URL/api/trpc/system.version"
# Expected: {"environment":"production","gitSha":"<deployed-sha>","..."}
```

---

## Feature Flags

The new modules can be enabled via environment variables:

| Flag | Description | Default |
|------|-------------|---------|
| `FEATURE_CRITICAL_FIELD_EXTRACTOR` | Enable critical field extraction engine | `false` |
| `FEATURE_IMAGE_QA_FUSION` | Enable OCR + Image QA fusion | `false` |
| `FEATURE_DETERMINISTIC_CACHE` | Enable deterministic caching | `false` |
| `FEATURE_ENGINEER_FEEDBACK` | Enable engineer feedback generation | `false` |

To enable in staging:
```bash
az containerapp update \
  --name <app-name> \
  --resource-group <rg-name> \
  --set-env-vars \
    FEATURE_CRITICAL_FIELD_EXTRACTOR=true \
    FEATURE_DETERMINISTIC_CACHE=true
```

---

## Rollback Plan

If issues occur after deployment:

1. **Quick Rollback**: Disable feature flags
   ```bash
   az containerapp update --name <app-name> --resource-group <rg-name> \
     --set-env-vars FEATURE_CRITICAL_FIELD_EXTRACTOR=false
   ```

2. **Full Rollback**: Redeploy previous version
   ```bash
   gh workflow run azure-deploy.yml -f environment=staging -f ref=<previous-sha>
   ```

---

## Evidence Pack Template

After successful deployment, document evidence:

```markdown
## Deployment Evidence Pack

**Date**: YYYY-MM-DD
**Deployed SHA**: <git-sha>
**Environment**: staging / production

### Endpoint Verification

| Endpoint | Status | Response Time |
|----------|--------|---------------|
| /healthz | ✅ 200 | XXms |
| /readyz | ✅ 200 | XXms |
| /metrics | ✅ 200 | XXms |
| /api/trpc/system.version | ✅ 200 | XXms |

### system.version Response
\`\`\`json
{
  "gitSha": "<sha>",
  "environment": "<env>",
  "platformVersion": "<version>"
}
\`\`\`

### Feature Flags Active
- FEATURE_CRITICAL_FIELD_EXTRACTOR: true/false
- FEATURE_DETERMINISTIC_CACHE: true/false

### Watch Window
- Start: HH:MM
- End: HH:MM
- Errors observed: 0
- Status: PASS
```
