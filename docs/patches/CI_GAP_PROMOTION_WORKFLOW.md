# CI_GAP: Promotion Workflow Operationalisation

**Status:** CLOSED
**Date:** 2026-01-05

## Summary

This CI_GAP has been closed by PR #27, which operationalised the `promotion.yml` workflow.

**Changes:**
- Removed `|| true` bypass pattern
- Added `skip_parity_acknowledgement` input
- Enforced real parity report source (`parity/reports/latest.json`)
- Blocked production parity skip

## Verification

Contract tests in `stage13c.workflow-contract.test.ts` now pass without CI_GAP fallback, verifying that the workflow is operationalised.

