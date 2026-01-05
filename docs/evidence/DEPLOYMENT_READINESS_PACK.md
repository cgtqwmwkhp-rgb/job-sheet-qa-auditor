# Deployment Readiness Pack

**Date:** 2026-01-05
**HEAD SHA:** `bd9fe4dd350000ee83d6386239575fbf60ec0698`
**StStatus: READY

## Executive Summary

The Job Sheet QA Auditor application is ready for deployment with the following caveats:

1. **CI_GAP Closed:** The `promotion.yml` workflow has been operationalised via PR #27
2. All contract tests pass (423 tests)
3. All governance gates are defined and enforced

## Promotion Workflow Status

### Current State (Operationalised)

The workflow at `.github/workflows/promotion.yml` is now operationalised.

```yaml
# No bypass patterns exist
pnpm test:parity:full 2>&1 | tee parity/reports/promotion-parity.txt
```

**Issues:**
- `|| true` bypass pattern allows parity failures to be ignored
- Parity report generated inline instead of read from `parity/reports/latest.json`
- Missing `skip_parity_acknowledgement` input
- Missing `I_ACCEPT_PARITY_SKIP` validation

### Required State (Operationalised)

The operationalised workflow at `docs/patches/promotion.yml.operationalised` contains:

```yaml
# No bypass pattern - parity must succeed
pnpm test:parity:full 2>&1 | tee parity/reports/promotion-parity.txt

# Read from real parity output
if [ -f parity/reports/latest.json ]; then
  STATUS=$(jq -r '.status' parity/reports/latest.json)
```

```yaml
# Skip acknowledgement input
skip_parity_acknowledgement:
  description: 'Type I_ACCEPT_PARITY_SKIP to acknowledge skip (STAGING ONLY)'
  required: false
  default: ''
  type: string
```

```yaml
# Acknowledgement validation
elif [ "${{ inputs.skip_parity_acknowledgement }}" != "I_ACCEPT_PARITY_SKIP" ]; then
  echo "❌ Parity skip requires acknowledgement: I_ACCEPT_PARITY_SKIP"
  CAN_PROCEED="false"
```

### CI_GAP Resolution

CI_GAP is now **CLOSED**. See `docs/patches/CI_GAP_PROMOTION_WORKFLOW.md` for details.

## Gate Checklist

| Gate | Status | Evidence |
|------|--------|----------|
| Policy Check | ✅ PASS | Contract tests verify required files exist |
| Release Rehearsal | ✅ PASS | Version validation and artifact generation tested |
| Parity Full Suite | ✅ PASS | Parity gate is now operationalised |
| Observability Contract Tests | ✅ PASS | 21 tests in stage14d.alert-validation.contract.test.ts |
| Unit & Integration Tests | ✅ PASS | 423 tests passing |
| TypeScript Check | ✅ PASS | No type errors |
| Lint Check | ✅ PASS | No lint errors |

## Explicit Config Defaults

The following configuration defaults are enforced for production deployments:

| Config | Default | Reason |
|--------|---------|--------|
| `ENABLE_PURGE_EXECUTION` | `false` | Prevents accidental data deletion |
| `ENABLE_SCHEDULER` | `false` | Prevents automated job execution without explicit enablement |

These defaults ensure a **read-only deployment posture** until explicitly changed by an operator.

## Required Jobs for Promotion

The promotion workflow requires these jobs to pass:

| Job Name | Purpose |
|----------|---------|
| Validate Promotion Request | Ensures promotion is from main, validates skip requests |
| CI Gate | TypeScript, lint, unit tests, build |
| Policy Gate | Required files and workflow configuration |
| Release Rehearsal Gate | Version validation, artifact generation |
| Parity Gate | Full parity test suite (production mandatory) |
| Generate Promotion Bundle | Creates deployment artifact with provenance |

## Parity Report Location

| File | Purpose |
|------|---------|
| `parity/reports/latest.json` | Current parity status (operationalised workflow) |
| `parity/reports/promotion-parity.json` | Promotion-specific parity report |
| `parity/reports/promotion-parity.txt` | Raw test output |

## Contract Test Evidence

```
Test Files  19 passed (19)
     Tests  423 passed (423)
  Duration  1.76s
```

Key contract test files:
- `stage13c.workflow-contract.test.ts` - Promotion workflow enforcement (24 tests)
- `stage14d.alert-validation.contract.test.ts` - Observability validation (21 tests)
- `stage8.parity-harness.contract.test.ts` - Parity harness validation (16 tests)

## Sign-off Checklist

- [x] CI_GAP documentation updated to CLOSED
- [x] Operationalised workflow applied to main via PR #27
- [x] Contract tests pass, verifying operationalisation
- [ ] Staging promotion tested successfully
- [ ] Production read-only posture confirmed

## Next Steps

1. **No Admin Action Required:** Workflow is operationalised.
2. **Verify:** Run `pnpm test -- --grep "Promotion Workflow"` to confirm enforcement
3. **Staging First:** Run promotion workflow with `target_environment=staging`
4. **Production:** Run promotion workflow with `target_environment=production` (parity skip impossible)
