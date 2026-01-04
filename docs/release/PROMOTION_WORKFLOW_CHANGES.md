# Promotion Workflow Changes (PR-13b)

This document contains the required changes to `.github/workflows/promotion.yml` that need to be applied manually due to GitHub App workflow permission restrictions.

## Summary of Changes

1. **Parity gate is now REAL** - Removed `|| true` from parity execution
2. **Production parity skip is IMPOSSIBLE** - Non-negotiable enforcement
3. **Staging parity skip requires acknowledgement** - Must type `I_ACCEPT_PARITY_SKIP`
4. **Skip acknowledgement is logged** - Recorded in promotion manifest
5. **Policy gate enhanced** - Validates thresholds.json schema and golden-dataset

## Required Workflow Input Changes

Add new input for acknowledgement:

```yaml
skip_parity_acknowledgement:
  description: 'Type "I_ACCEPT_PARITY_SKIP" to confirm parity skip (staging only)'
  required: false
  default: ''
  type: string
```

## Application Instructions

1. A user with `workflows` permission should apply these changes
2. Or, update repository settings to grant the GitHub App `workflows` permission
3. Then re-run the PR-13b changes
