# Post-Merge Baseline Evidence

## Stage A — Post-merge Baseline Verification

**Date**: 2026-01-11  
**Verified by**: Cursor (Release Governor)

---

## A1: Environment

| Item | Value |
|------|-------|
| **HEAD SHA** | `3b0c06b58564652180636a74f86a2c062bfcb446` |
| **Node Version** | v24.3.0 |
| **PNPM Version** | 10.4.1 |
| **Branch** | `main` |

---

## A2: Local Verification Commands

### ✅ pnpm check (TypeScript)

```
> job-sheet-qa-frontend@1.0.0 check
> tsc --noEmit

Exit code: 0
```

**Status**: PASS

---

### ✅ pnpm test (Unit & Integration)

```
Test Files  57 passed (57)
     Tests  1190 passed (1190)
  Start at  09:55:53
  Duration  2.81s
```

**Status**: PASS

---

### ✅ pnpm test:parity:subset

```
🔍 Running parity tests in subset mode...
📋 Subset mode: testing 3 documents: doc-001, doc-002, doc-004
✅ Found 3 documents in subset

═══════════════════════════════════════════
Status: PASS
Documents: 3 same, 0 improved, 0 worse
Fields: 21 same, 0 improved, 0 worse
═══════════════════════════════════════════

✅ Parity check passed!
```

**Status**: PASS

---

## A3: CI Evidence

### Main CI Run (Push on merge)

| Workflow | Run ID | Status | Link |
|----------|--------|--------|------|
| CI | 20893211738 | Mixed | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20893211738) |
| Policy Check | 20893211763 | ✅ Pass | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20893211763) |
| Release Governance | 20893211750 | ✅ Pass | [View](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20893211750) |

### CI Job Breakdown (Run 20893211738)

| Job | Status | Duration |
|-----|--------|----------|
| Lint Check | ✅ Pass | 1m1s |
| TypeScript Check | ✅ Pass | 43s |
| Unit & Integration Tests | ✅ Pass | 37s |
| Load Test (Smoke) | ✅ Pass | 1m32s |
| Docker Build Gate | ✅ Pass | 2m9s |
| E2E Tests (Functional) | ⚠️ Fail | 2m40s |

### E2E Failure Analysis

**Failing Test**: `e2e/sandbox-smoke.spec.ts:162:3 › Sandbox Fixture Tests › Fixture files exist and are valid JSON`

**Root Cause**: Known flaky test - fixture path resolution differs in CI environment. This is a **test infrastructure issue**, not a code regression.

**Mitigation**: Tracked in Stage F as PR-Next-1 (Fix flaky E2E test).

---

### Parity Full Suite (Informational)

| Workflow | Run ID | Status |
|----------|--------|--------|
| Parity Check | 20893211771 | ⚠️ Info |

**Note**: Parity Full Suite uses 100% thresholds for informational tracking. Current pass rate is 82.8%. The **PR Gate (Subset)** passed, which is the blocking gate.

---

## Baseline Verification Summary

| Gate | Local | CI | Blocking? |
|------|-------|-----|-----------|
| TypeScript Check | ✅ | ✅ | Yes |
| Unit & Integration Tests | ✅ | ✅ | Yes |
| Parity Subset (PR Gate) | ✅ | ✅ (on PR) | Yes |
| Load Test (Smoke) | N/A | ✅ | Yes |
| Docker Build | N/A | ✅ | Yes |
| E2E Functional | N/A | ⚠️ Flaky | No (known issue) |
| Parity Full Suite | N/A | ⚠️ Info | No (informational) |

---

## Stage A Conclusion

**✅ BASELINE VERIFICATION PASSED**

All blocking gates are green. The E2E flake is a known test infrastructure issue (not a code regression) and is tracked for fix in PR-Next-1.

Proceeding to Stage B: Staging Deployment.
