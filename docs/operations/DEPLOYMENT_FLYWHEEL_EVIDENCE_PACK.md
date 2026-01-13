# Deployment Flywheel Evidence Pack

**Last Updated:** 2026-01-13T14:38:53Z  
**Release Governor:** AI Agent  
**Status:** ✅ Staging Verified | ⚠️ Production Behind

---

## Current State

| Environment | SHA | Status |
|-------------|-----|--------|
| **Main Branch** | `70f7a08` | Latest (evidence commit) |
| **Staging** | `62a557c4c24c2f8e047c8e004a76f829f4a53dce` | ✅ Deployed |
| **Production** | `c3bb5439897c5818c5d23d18f7dc72acee8eaa6f` | ⚠️ Behind by 2 PRs |

### Environment URLs

| Environment | URL |
|-------------|-----|
| Staging | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| Production | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io |

---

## PRs Merged (This Release Cycle)

| PR | Title | SHA | Status |
|----|-------|-----|--------|
| #102 | perf: lazy PDF loading, auth resilience, blob URL guard | `c3bb543...` | ✅ Merged |
| #103 | ci: add PDF proxy gate + stable core workflow E2E smoke test | `2d5d1df9509ba7f19970d02ef22afe3e02d3176f` | ✅ Merged |
| #104 | docs: add performance budgets and 30-day plan | `88b45b96bf2f26821e5716e39d3b426eafac61d4` | ✅ Merged |
| #105 | fix: smoke-check.sh get_time_ms undefined | `62a557c4c24c2f8e047c8e004a76f829f4a53dce` | ✅ Merged |

---

## CI Workflow Runs

### Successful Runs (Latest)

| Workflow | Run ID | SHA | Status | Link |
|----------|--------|-----|--------|------|
| Azure Deploy | 20959501045 | `62a557c` | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501045) |
| CI | 20959501080 | `62a557c` | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501080) |
| Release Governance | 20959501037 | `62a557c` | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501037) |

### Failed Runs (Resolved)

| Workflow | Run ID | SHA | Issue | Resolution |
|----------|--------|-----|-------|------------|
| Azure Deploy | 20958784492 | `2d5d1df` | `get_time_ms` undefined | Fixed in PR #105 |
| Parity Check | 20958784486 | `2d5d1df` | 82.8% pass rate | Pre-existing (not blocking) |

---

## Staging Verification

**Timestamp:** 2026-01-13T14:12:46Z  
**SHA Verified:** `62a557c4c24c2f8e047c8e004a76f829f4a53dce`

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `/readyz` | 200 + ok | 200 + ok | ✅ |
| Database latency | <50ms | 9ms | ✅ |
| Storage status | ok | ok | ✅ |
| PDF Proxy Auth | 401 | 401 | ✅ |
| Audit Detail Auth | 401 | 401 | ✅ |
| SHA Match | `62a557c` | `62a557c` | ✅ |

---

## Production Verification

**Timestamp:** 2026-01-13T14:38:53Z  
**SHA Verified:** `c3bb5439897c5818c5d23d18f7dc72acee8eaa6f`

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `/readyz` | 200 + ok | 200 + ok | ✅ |
| Database latency | <50ms | 8ms | ✅ |
| Storage status | ok | ok | ✅ |
| PDF Proxy Auth | 401 | 401 | ✅ |
| Audit Detail Auth | 401 | 401 | ✅ |
| SHA Current | `62a557c` | `c3bb543` | ⚠️ Behind |

**Note:** Production is behind staging. PRs #104 and #105 not yet deployed to production.

---

## Gates Verified

| Gate | Location | Status |
|------|----------|--------|
| smoke-check.sh Check 5 (PDF Proxy) | `scripts/release/smoke-check.sh` | ✅ Executing |
| core-workflow-smoke.spec.ts | `e2e/core-workflow-smoke.spec.ts` | ✅ Present |
| Version SHA match | Staging verification | ✅ Passing |
| Performance budgets | `docs/operations/PERFORMANCE_BUDGETS.md` | ✅ Documented |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `PRODUCTION_SPOT_CHECK.md` | Full production curl evidence |
| `PERFORMANCE_BUDGETS.md` | API and frontend performance thresholds |
| `NEXT_30_DAYS_PLAN.md` | Templates, scorecards, drift detection roadmap |
| `RELEASE_CLOSEOUT.md` | Final release summary with incident notes |

---

## Next Actions

1. **Deploy to Production:** Trigger production deployment workflow to update from `c3bb543` to `62a557c`
2. **Re-verify Production:** Run spot check post-deployment
3. **Update This Document:** Record final production SHA after deployment

---

## Governance Note

> ⚠️ **Evidence updates must go via PR.** Direct commits to main for evidence packs are discouraged. Create a branch, capture evidence, and submit PR for review.

See `docs/operations/GOVERNANCE.md` for branch protection and evidence handling policies.
