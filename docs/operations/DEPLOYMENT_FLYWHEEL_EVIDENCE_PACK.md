# Deployment Flywheel Evidence Pack

**Version:** 1.0.0  
**Date:** 2026-01-11  
**Context:** Accuracy Flywheel deployment (PRs #64 + #68)

---

## 1. Deployed SHA

| Item | Value |
|------|-------|
| **Main Branch SHA** | `c909e29497bebe5c3e5a99636bf52a0f9f4f65b9` |
| **PR #64** | Evaluation Harness (merged) |
| **PR #68** | Drift Detection + Interpreter Router + Feedback Cadence (merged) |
| **Node Version** | v24.3.0 |
| **PNPM Version** | 10.4.1 |

---

## 2. Staging Deployment

### Deployment Workflow

| Item | Value |
|------|-------|
| **Workflow Run URL** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20894189958 |
| **Build & Push Job** | ✅ SUCCESS |
| **Deploy to Staging Job** | ✅ SUCCESS |
| **Verify Staging Job** | ❌ FAIL (missing STAGING_URL secret) |

### Staging Verification (Manual Operator Action Required)

> **Note:** The automated verification failed because `STAGING_URL` is not configured in GitHub Environment 'staging'. The deployment itself succeeded. Please configure the URL and run manual verification.

**Staging URL:** `[INSERT_STAGING_URL_HERE]`

#### `/healthz`

```bash
curl -s "[STAGING_URL]/healthz"
```

**Expected Output:**
```json
{ "status": "healthy" }
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/readyz`

```bash
curl -s "[STAGING_URL]/readyz"
```

**Expected Output:**
```json
{ "ready": true, "checks": { "database": true, "storage": true } }
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/metrics` (Prometheus Format)

```bash
curl -s "[STAGING_URL]/metrics" | head -30
```

**Expected:** Prometheus format metrics including flywheel metrics:
- `eval_selection_accuracy`
- `eval_field_accuracy`
- `drift_alerts_total`
- `interpreter_requests_total`

**Actual Output:**
```
[INSERT_OUTPUT_HERE - should NOT be HTML]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/api/trpc/system.version`

```bash
curl -s "[STAGING_URL]/api/trpc/system.version" | jq .
```

**Expected Output:**
```json
{
  "result": {
    "data": {
      "version": "1.0.0",
      "gitSha": "c909e29497bebe5c3e5a99636bf52a0f9f4f65b9",
      "environment": "staging",
      "scheduler": false,
      "purge": false
    }
  }
}
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Verification:**
- [ ] SHA matches `c909e29497bebe5c3e5a99636bf52a0f9f4f65b9`
- [ ] Environment is `staging`
- [ ] `scheduler: false`
- [ ] `purge: false`

**Status:** [✅ PASS / ❌ FAIL]

---

## 3. Production Deployment

### Pre-Deployment Checklist

- [ ] Staging verification completed
- [ ] All staging endpoints healthy
- [ ] Safety flags confirmed (scheduler=false, purge=false)
- [ ] Manual approval obtained

### Deployment Workflow

| Item | Value |
|------|-------|
| **Workflow Run URL** | `[INSERT_URL_AFTER_MANUAL_TRIGGER]` |
| **Deploy to Production Job** | [PENDING / ✅ SUCCESS / ❌ FAIL] |

### Production Configuration Verification

**Production URL:** `[INSERT_PRODUCTION_URL_HERE]`

#### Environment Variables

| Variable | Expected | Actual | Status |
|----------|----------|--------|--------|
| `ENABLE_PURGE_EXECUTION` | `false` | `[VERIFY]` | [✅/❌] |
| `ENABLE_SCHEDULER` | `false` | `[VERIFY]` | [✅/❌] |
| `APP_ENV` | `production` | `[VERIFY]` | [✅/❌] |

---

#### `/healthz`

```bash
curl -s "[PRODUCTION_URL]/healthz"
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/readyz`

```bash
curl -s "[PRODUCTION_URL]/readyz"
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/metrics` (Prometheus Format)

```bash
curl -s "[PRODUCTION_URL]/metrics" | head -30
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE - must be Prometheus format]
```

**Status:** [✅ PASS / ❌ FAIL]

---

#### `/api/trpc/system.version`

```bash
curl -s "[PRODUCTION_URL]/api/trpc/system.version" | jq .
```

**Actual Output:**
```
[INSERT_OUTPUT_HERE]
```

**Verification:**
- [ ] SHA matches `c909e29497bebe5c3e5a99636bf52a0f9f4f65b9`
- [ ] Environment is `production`
- [ ] `scheduler: false`
- [ ] `purge: false`

**Status:** [✅ PASS / ❌ FAIL]

---

## 4. Flywheel Components Deployed

| Component | Location | Status |
|-----------|----------|--------|
| Evaluation Harness | `scripts/eval/` | ✅ Deployed |
| Drift Detection | `scripts/drift/` | ✅ Deployed |
| Interpreter Router | `server/services/interpreter/` | ✅ Deployed |
| Feedback Generator | `server/services/feedback/` | ✅ Deployed |
| Feedback Cockpit UI | `client/src/components/FeedbackCockpit.tsx` | ✅ Deployed |

---

## 5. New Metrics Available

| Metric | Type | Description |
|--------|------|-------------|
| `eval_selection_accuracy` | Gauge | Template selection accuracy |
| `eval_field_accuracy` | Gauge | Critical field extraction accuracy |
| `eval_fusion_agreement` | Gauge | OCR + Image QA agreement rate |
| `eval_pass2_rate` | Gauge | Interpreter escalation rate |
| `drift_alerts_total` | Counter | Total drift alerts by severity |
| `interpreter_requests_total` | Counter | Interpreter requests by provider |
| `interpreter_escalations_total` | Counter | Escalations by reason |
| `interpreter_cost_usd` | Counter | Estimated interpreter cost |
| `feedback_scorecards_generated` | Counter | Scorecards generated by period |
| `feedback_fixpacks_created` | Counter | Fix packs created |

---

## 6. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Release Governor | | | |
| Ops Engineer | | | |
| QA Lead | | | |

---

## 7. Rollback Plan

If issues are detected:

1. **Immediate:** Disable flywheel features via feature flags (if available)
2. **Short-term:** Revert to previous SHA: `6d90e3b` (pre-flywheel)
3. **Command:**
   ```bash
   gh workflow run azure-deploy.yml \
     -f environment=production \
     -f sha=6d90e3b
   ```

---

**Document Status:** Template - requires operator completion with actual curl outputs
