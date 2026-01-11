# Deployment Verification Checklist

## Ultimate Order Pipeline Deployment

**Branch**: `ai/ultimate-order-pipeline`  
**Date**: 2026-01-11

---

## PRE-DEPLOYMENT CHECKS

### 1. Local Verification

```bash
# Run type check
pnpm run check
# Expected: No errors

# Run all tests
pnpm run test
# Expected: All tests pass (1190+ tests)
```

### 2. Branch Status

```bash
git log --oneline -5
# Verify commits:
# - PR-4: Critical-field calibration + guardrails
# - PR-3: Selection fixtures expansion
# - PR-2: Multi-signal template recognition
# - PR-1: SSOT enforcement
# - Hardening: Fail-closed + versioned weights + S0-S3 severity
```

---

## STAGING DEPLOYMENT

### Step 1: Merge to Main (or deploy branch)

```bash
git checkout main
git merge ai/ultimate-order-pipeline
git push origin main
```

### Step 2: Deploy to Staging

```bash
# Via GitHub Actions or manual trigger
# Ensure APP_ENV=staging is set
```

### Step 3: Staging Verification

#### 3.1 Health Checks

```bash
# Liveness
curl -s https://staging.jobsheetqa.example.com/healthz | jq
# Expected: {"status":"ok"}

# Readiness
curl -s https://staging.jobsheetqa.example.com/readyz | jq
# Expected: {"ready":true,"checks":{"database":{"status":"ok"}}}

# Metrics
curl -s https://staging.jobsheetqa.example.com/metrics | head -10
# Expected: Prometheus format metrics
```

#### 3.2 Version Verification

```bash
curl -s https://staging.jobsheetqa.example.com/api/trpc/system.version | jq
# Expected:
# {
#   "environment": "staging",  <-- MUST be staging
#   "gitSha": "<deployed-sha>",
#   ...
# }
```

#### 3.3 SSOT Enforcement Verification

```bash
# Verify SSOT mode is strict (from logs or config endpoint)
curl -s https://staging.jobsheetqa.example.com/api/trpc/system.platformConfig \
  -H "Authorization: Bearer <admin-token>" | jq
# Check: No permissive mode indicators
```

#### 3.4 Selection Trace Verification

Process a test document and verify selection trace includes:
- [ ] `weightsUsed.version` (should be "1.0.0")
- [ ] `weightsUsed.effectiveAt` (ISO timestamp)
- [ ] `signalBreakdown` with all 4 signal types
- [ ] Explicit block reason if not auto-processed

#### 3.5 Guardrail Verification

Check guardrail results include:
- [ ] `severity` (S0, S1, S2, or S3)
- [ ] `stopBehavior` (STOP_IMMEDIATELY, REVIEW_QUEUE, etc.)
- [ ] `legacySeverity` (blocking/warning)

### Staging Checklist

| Check | Status | Notes |
|-------|--------|-------|
| /healthz returns ok | ☐ | |
| /readyz returns ready | ☐ | |
| /metrics returns Prometheus format | ☐ | |
| system.version shows staging | ☐ | |
| Deployed SHA matches | ☐ | |
| SSOT mode is strict | ☐ | |
| Selection traces include weights | ☐ | |
| Guardrails have S0-S3 severity | ☐ | |
| Test document processed | ☐ | |
| 1-hour stability observed | ☐ | |

---

## PRODUCTION DEPLOYMENT

### Prerequisites

- [ ] Staging verification complete
- [ ] 1-hour staging watch window passed
- [ ] No critical issues in staging
- [ ] Stakeholder approval (if required)

### Step 1: Deploy to Production

```bash
# Via GitHub Actions (workflow_dispatch) or approved CI pipeline
# Ensure APP_ENV=production is set
# Ensure ENABLE_PURGE_EXECUTION=false
# Ensure ENABLE_SCHEDULER=false
```

### Step 2: Production Verification

#### 2.1 Health Checks

```bash
# Liveness
curl -s https://jobsheetqa.example.com/healthz | jq
# Expected: {"status":"ok"}

# Readiness
curl -s https://jobsheetqa.example.com/readyz | jq
# Expected: {"ready":true,"checks":{"database":{"status":"ok"}}}

# Metrics
curl -s https://jobsheetqa.example.com/metrics | head -10
# Expected: Prometheus format metrics
```

#### 2.2 Version Verification

```bash
curl -s https://jobsheetqa.example.com/api/trpc/system.version | jq
# Expected:
# {
#   "environment": "production",  <-- MUST be production
#   "gitSha": "<deployed-sha>",   <-- MUST match staging
#   ...
# }
```

#### 2.3 SSOT Enforcement Confirmation

```bash
# Confirm SSOT is enforced (cannot be overridden)
# Check application logs for:
# "[SSOT] WARNING: TEMPLATE_SSOT_MODE=permissive ignored in production"
# (This line appears if someone tried to set permissive - should NOT appear normally)
```

### Production Checklist

| Check | Status | Notes |
|-------|--------|-------|
| /healthz returns ok | ☐ | |
| /readyz returns ready | ☐ | |
| /metrics returns Prometheus format | ☐ | |
| system.version shows production | ☐ | |
| Deployed SHA matches staging | ☐ | |
| SSOT mode is strict (enforced) | ☐ | |
| ENABLE_PURGE_EXECUTION=false | ☐ | |
| ENABLE_SCHEDULER=false | ☐ | |
| 60-minute stability observed | ☐ | |

---

## ROLLBACK PROCEDURE

If issues are detected:

### Quick Rollback

```bash
# Via Azure CLI
az containerapp revision list -n <app-name> -g <resource-group> -o table
# Note the previous stable revision

az containerapp revision activate -n <app-name> -g <resource-group> --revision <previous-revision>
```

### Full Rollback

```bash
# Revert main to previous SHA
git revert <merge-commit>
git push origin main

# Redeploy via CI/CD
```

---

## POST-DEPLOYMENT MONITORING

### Key Metrics to Watch

1. **Error Rate**: Should not increase
2. **Selection Accuracy**: Monitor HIGH/MEDIUM/LOW distribution
3. **Review Queue Volume**: May change with new guardrails
4. **Guardrail Trigger Rate**: Track G001-G004 failures

### Alerts to Configure

- [ ] SSOT violation errors (should be 0 in prod)
- [ ] S0 guardrail failures (STOP_IMMEDIATELY events)
- [ ] Unusual selection trace patterns

---

## EVIDENCE COLLECTION

After successful deployment, collect:

1. **Staging Evidence**
   - curl outputs for all endpoints
   - Sample selection trace with weights
   - Sample guardrail result with S0-S3

2. **Production Evidence**
   - curl outputs for all endpoints
   - Deployed SHA confirmation
   - 60-minute stability metrics

Store in: `docs/evidence/DEPLOY_<DATE>_EVIDENCE.md`
