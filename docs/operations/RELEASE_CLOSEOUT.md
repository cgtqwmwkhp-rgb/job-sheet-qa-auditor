# Release Closeout: PR #102–#105

**Date:** 2026-01-13  
**Release Governor:** AI Agent  
**Status:** ✅ Staging Complete | ⚠️ Production Pending

---

## Executive Summary

This release cycle addressed critical production issues with PDF viewing, auth resilience, and deployment verification gates. A hotfix (PR #105) was required to resolve a script error introduced in PR #103.

---

## Incident Timeline

| Time (UTC) | Event |
|------------|-------|
| 13:38:21 | PR #103 merged to main |
| 13:46:37 | Azure Deploy fails: `get_time_ms: command not found` |
| 13:53:xx | Root cause identified (smoke-check.sh line 258) |
| 14:01:06 | PR #105 (hotfix) merged to main |
| 14:08:xx | Azure Deploy succeeds, staging verified |
| 14:12:46 | Staging spot check passed |
| 14:13:xx | PR #104 (docs) merged |
| 14:38:53 | Production spot check completed |

---

## PRs in This Release

### PR #102: Performance & Auth Resilience

**SHA:** `c3bb5439897c5818c5d23d18f7dc72acee8eaa6f`  
**Status:** ✅ Deployed to Production

**Changes:**
- Lazy PDF loading (deferred until user clicks "View PDF")
- Auth resilience (no React crash on 401)
- Blob URL guard (prevents direct Azure Blob URLs in viewer)
- Performance instrumentation (`perf.ts`)
- Split audit endpoints (summary vs findings)

---

### PR #103: CI Gates

**SHA:** `2d5d1df9509ba7f19970d02ef22afe3e02d3176f`  
**Status:** ✅ Merged (contained bug)

**Changes:**
- smoke-check.sh Check 5: PDF Proxy Auth verification
- core-workflow-smoke.spec.ts: E2E smoke test
- PERF_BASELINE_AFTER.md: Production timings

**Issue:** Introduced `get_time_ms` function call that didn't exist.

---

### PR #104: Documentation

**SHA:** `88b45b96bf2f26821e5716e39d3b426eafac61d4`  
**Status:** ✅ Merged (staging only)

**Changes:**
- PERFORMANCE_BUDGETS.md: API and frontend thresholds
- NEXT_30_DAYS_PLAN.md: Templates, scorecards, drift detection roadmap

---

### PR #105: Hotfix

**SHA:** `62a557c4c24c2f8e047c8e004a76f829f4a53dce`  
**Status:** ✅ Merged (staging deployed)

**Changes:**
- Fixed smoke-check.sh: replaced `get_time_ms` with `date +%s%N`

---

## CI Workflow Evidence

### Successful Runs

| Workflow | Run ID | Link |
|----------|--------|------|
| Azure Deploy | 20959501045 | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501045) |
| CI | 20959501080 | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501080) |
| Release Governance | 20959501037 | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20959501037) |

### Failed Runs (Before Hotfix)

| Workflow | Run ID | Failure | Link |
|----------|--------|---------|------|
| Azure Deploy | 20958784492 | `get_time_ms: command not found` | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20958784492) |

---

## Verification Evidence

### Staging (2026-01-13T14:12:46Z)

| Check | Result |
|-------|--------|
| `/readyz` | ✅ 200 (9ms DB latency) |
| `system.version` SHA | ✅ `62a557c` |
| PDF Proxy Auth | ✅ 401 |
| Audit Detail Auth | ✅ 401 |

### Production (2026-01-13T14:38:53Z)

| Check | Result |
|-------|--------|
| `/readyz` | ✅ 200 (8ms DB latency) |
| `readyz` SHA | ⚠️ `c3bb543` (behind) |
| PDF Proxy Auth | ✅ 401 |
| Audit Detail Auth | ✅ 401 |

---

## Root Cause Analysis

### Incident: Azure Deploy Failure

**Symptom:** `smoke-check.sh: line 258: get_time_ms: command not found`

**Root Cause:** PR #103 added a new PDF Proxy Auth check (Check 5) that called `get_time_ms` function, which was never defined. The existing timing logic used `date +%s%N` inline.

**Fix:** PR #105 replaced `get_time_ms` calls with inline `date +%s%N` pattern matching the existing `measure_request` function.

**Prevention:**
1. Smoke-check script should have unit tests
2. Consider shellcheck linting in CI
3. Add script syntax validation step

---

## Outstanding Items

| Item | Status | Owner |
|------|--------|-------|
| Deploy to Production | ⚠️ Pending | Ops |
| Production SHA verification | ⚠️ Pending | Ops |
| Client-side perf metrics | ⚠️ Pending | Eng |
| E2E test stabilization | ⚠️ Ongoing | Eng |

---

## Lessons Learned

1. **Test shell scripts:** New shell script functions should be tested before merge.
2. **Hotfix process works:** PR #105 was created, reviewed, and merged within 15 minutes.
3. **Evidence via PR:** Direct-to-main evidence commits should be avoided; use PRs for audit trail.
4. **Staging-first deployment:** Staging verification caught the issue before production impact.

---

## Sign-Off

| Role | Name | Approval |
|------|------|----------|
| Release Governor | AI Agent | ✅ |
| Engineering | TBD | Pending |
| Operations | TBD | Pending |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-13 | AI Agent | Initial release closeout |
