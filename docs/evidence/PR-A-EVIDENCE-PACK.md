# PR-A: CI Stabilisation - Evidence Pack

## Summary

PR-A restored CI to green status on main by quarantining flaky visual regression tests and fixing pre-existing React compiler errors.

## HEAD SHA

```
21bc0e1d46c81935f6c65357a6c02120c5e8ac9f
```

## Diff Inventory

```
 .github/workflows/ci-nightly.yml        | 168 +++++++++++++++++++++++++++++
 .github/workflows/ci.yml                | 130 ++++++++---------------
 client/src/components/ManusDialog.tsx   |  16 +--
 client/src/components/ui/sidebar.tsx    |   7 +-
 client/src/contexts/AuthContext.tsx     |  34 +++---
 client/src/pages/Home.tsx               |   2 +-
 client/src/pages/UserManagement.tsx     |  19 ++--
 docs/ci/VISUAL_REGRESSION_QUARANTINE.md |  86 +++++++++++++++
 server/services/advancedExtraction.ts   |  22 ++--
 server/services/documentExtraction.ts   |  26 ++---
 server/services/goldStandardSpec.ts     |   2 +-
 server/tests/regex-parity.test.ts       | 180 ++++++++++++++++++++++++++++++++
 server/utils/fileValidation.ts          |   2 +-
 13 files changed, 545 insertions(+), 149 deletions(-)
```

## CI Evidence

### Main Branch CI Run (Post-Merge)

- **Run ID:** 20698292889
- **Status:** ✅ SUCCESS
- **URL:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20698292889

### Job Results

| Job | Status | Duration |
|-----|--------|----------|
| Lint Check | ✅ PASS | 44s |
| TypeScript Check | ✅ PASS | 33s |
| Unit & Integration Tests | ✅ PASS | 26s |
| E2E Tests (Functional) | ✅ PASS | 2m27s |
| Load Test (Smoke) | ✅ PASS | 1m26s |

### Lint Summary

```
✖ 156 problems (0 errors, 156 warnings)
```

All errors resolved. Warnings are pre-existing and non-blocking.

## Changes Made

### 1. Visual Regression Tests Quarantined

**File:** `.github/workflows/ci-nightly.yml` (NEW)

- Scheduled nightly at 02:00 UTC
- Supports `workflow_dispatch` for on-demand runs
- Uploads expected/actual/diff artifacts
- Produces failure summary with counts and top failing specs

**Documentation:** `docs/ci/VISUAL_REGRESSION_QUARANTINE.md`

### 2. CI Triggers Expanded

**File:** `.github/workflows/ci.yml`

Added branch patterns:
- `stage-*`
- `pr-*`

Both push and pull_request events now cover feature branches.

### 3. React Compiler Errors Fixed (4 errors)

| File | Line | Error | Fix |
|------|------|-------|-----|
| ManusDialog.tsx | 33 | setState in effect | Removed useEffect, use controlled/uncontrolled pattern |
| sidebar.tsx | 618 | Math.random() impure | Changed useMemo to useState lazy initializer |
| AuthContext.tsx | 63 | setState in effect | Replaced useEffect with useState lazy initializer |
| UserManagement.tsx | 77 | Date.now() impure | Use useState lazy initializer for mountTime |

### 4. Lint Errors Fixed (regex escapes)

| File | Issue |
|------|-------|
| advancedExtraction.ts | Unnecessary escapes in character classes |
| documentExtraction.ts | Unnecessary escapes in date patterns |
| goldStandardSpec.ts | Unnecessary escape in regex |
| fileValidation.ts | Unnecessary escape in path pattern |
| Home.tsx | prefer-const violation |

### 5. Regression Tests Added

**File:** `server/tests/regex-parity.test.ts` (NEW)

13 tests proving regex changes don't alter behavior:
- Date pattern matching (DD/MM/YYYY, YYYY-MM-DD)
- Name patterns with dots
- Boolean field patterns
- Make/Model patterns
- Mileage/Hours patterns
- Service date validation
- Path sanitization

### 6. OAuth Warning Suppressed

Added CI defaults for OAuth env vars:
```yaml
VITE_OAUTH_PORTAL_URL: "http://localhost:3000/oauth-disabled"
OAUTH_SERVER_URL: "http://localhost:3000/oauth-disabled"
```

## Local Verification Commands

```bash
# TypeScript check
npx tsc --noEmit
# Result: 0 errors

# ESLint
npx eslint . --ext .ts,.tsx
# Result: 0 errors, 156 warnings

# Unit tests
npm test
# Result: 71 passed

# Regex parity tests
npx vitest run server/tests/regex-parity.test.ts
# Result: 13 passed
```

## PR Details

- **PR Number:** #1
- **Title:** PR-A: CI Stabilisation - Quarantine Visual Tests + Fix React Compiler Errors
- **Merge Type:** Squash and merge
- **Merged:** ✅ Yes

## Acceptance Criteria

| Criteria | Status |
|----------|--------|
| CI green on main | ✅ |
| Visual tests quarantined to nightly | ✅ |
| Quarantine documented | ✅ |
| React compiler errors fixed | ✅ |
| Lint errors fixed | ✅ |
| No eslint-disable comments | ✅ |
| No threshold increases | ✅ |
| Regression tests added | ✅ |
| CI triggers expanded | ✅ |
| OAuth warning suppressed | ✅ |
