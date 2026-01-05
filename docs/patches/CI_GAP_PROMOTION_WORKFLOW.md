# CI_GAP: Promotion Workflow Operationalisation

**Status:** BLOCKED - Requires manual admin action
**Date:** 2026-01-05
**Blocker:** GitHub App does not have `workflows` permission

## Issue Summary

The `promotion.yml` workflow on main is **NOT operationalised**. The following issues exist:

| Issue | Current State | Required State |
|-------|---------------|----------------|
| Bypass pattern | Line 265: `\|\| true` | No bypass patterns |
| Parity report source | Generated inline | Read from `parity/reports/latest.json` |
| Skip acknowledgement input | Missing | `skip_parity_acknowledgement` input |
| Skip acknowledgement check | Missing | Require `I_ACCEPT_PARITY_SKIP` |
| Staging-only skip | Not enforced | Only staging can skip with acknowledgement |

## Root Cause

The GitHub App used for CI automation does not have `workflows` permission. This is a GitHub security restriction that prevents automated tools from modifying workflow files.

## Resolution Options

### Option 1: Manual Admin Application (Recommended)

A repository administrator must manually replace `.github/workflows/promotion.yml` with the operationalised version.

**Steps:**

1. Copy the contents of `docs/patches/promotion.yml.operationalised`
2. Replace `.github/workflows/promotion.yml` with the copied contents
3. Commit directly to main or via PR with admin merge

**Verification:**

```bash
# After applying, run these checks:
grep -n "|| true" .github/workflows/promotion.yml
# Expected: NO OUTPUT (no bypass patterns)

grep -n "I_ACCEPT_PARITY_SKIP" .github/workflows/promotion.yml
# Expected: Line with acknowledgement check

grep -n "parity/reports/latest.json" .github/workflows/promotion.yml
# Expected: Lines reading from latest.json
```

### Option 2: Update GitHub App Permissions

Update the GitHub App to include the `workflows` scope, then re-run the automation.

**Steps:**

1. Go to GitHub App settings
2. Add `workflows` permission (read and write)
3. Re-run the deployment readiness automation

## Patch File Location

The operationalised workflow is available at:

```
docs/patches/promotion.yml.operationalised
```

## Key Changes in Patch

### 1. New Input: skip_parity_acknowledgement

```yaml
skip_parity_acknowledgement:
  description: 'Type I_ACCEPT_PARITY_SKIP to acknowledge skip (STAGING ONLY)'
  required: false
  default: ''
  type: string
```

### 2. Acknowledgement Validation

```yaml
# STAGING: Requires explicit acknowledgement
elif [ "${{ inputs.skip_parity_acknowledgement }}" != "I_ACCEPT_PARITY_SKIP" ]; then
  echo "❌ Parity skip requires acknowledgement: I_ACCEPT_PARITY_SKIP"
  CAN_PROCEED="false"
```

### 3. No Bypass Pattern

```yaml
# Run parity tests - MUST succeed (no bypass allowed)
pnpm test:parity:full 2>&1 | tee parity/reports/promotion-parity.txt
```

### 4. Read from Real Parity Output

```yaml
# Read from real parity output
if [ -f parity/reports/latest.json ]; then
  STATUS=$(jq -r '.status' parity/reports/latest.json)
```

### 5. Bundle Generation Condition

```yaml
(needs.parity-gate.result == 'success' || (inputs.skip_parity == 'true' && inputs.target_environment == 'staging' && inputs.skip_parity_acknowledgement == 'I_ACCEPT_PARITY_SKIP'))
```

## Contract Test Verification

After applying the patch, the contract tests will verify:

1. No `|| true` bypass patterns exist
2. No `continue-on-error` on parity steps
3. Production parity skip is blocked
4. `skip_parity_acknowledgement` input exists
5. `I_ACCEPT_PARITY_SKIP` check exists
6. Parity report is read from `parity/reports/latest.json`

Run verification:

```bash
pnpm test -- --grep "Promotion Workflow Contract"
```

## Sign-off Required

This CI_GAP requires sign-off from a repository administrator before deployment can proceed.

- [ ] Admin has reviewed the patch
- [ ] Admin has applied the patch to main
- [ ] Contract tests pass after application
- [ ] Promotion workflow tested with staging deployment
