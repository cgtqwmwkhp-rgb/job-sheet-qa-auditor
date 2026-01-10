# Template Selection Policy

## Overview

This document defines the rules governing automatic template selection for job sheet processing.

## Confidence Bands

| Band | Score Range | Auto-Processing | Notes |
|------|-------------|-----------------|-------|
| **HIGH** | ≥ 80 | ✅ Allowed | Proceed with selected template |
| **MEDIUM** | 50 – 79 | Conditional | Only if gap ≥ 10 from runner-up |
| **LOW** | < 50 | ❌ Blocked | Must go to REVIEW_QUEUE |

## Selection Rules

### Rule 1: LOW Confidence → REVIEW_QUEUE
- If `topScore < 50`, selection is **BLOCKED**
- Job sheet is routed to REVIEW_QUEUE with reason code `CONFLICT`
- Selection trace is recorded for audit
- **NO automatic processing occurs**

### Rule 2: MEDIUM Confidence with Ambiguity → REVIEW_QUEUE
- If `50 ≤ topScore < 80` AND `scoreGap < 10`:
  - Selection is **BLOCKED**
  - Ambiguity between templates requires human review
  - Reason: Runner-up template is too close in score

### Rule 3: HIGH Confidence → Auto-Process
- If `topScore ≥ 80`, auto-processing is **ALLOWED**
- Selected template version's `specJson` is used for validation
- Selection trace is recorded for audit

### Rule 4: MEDIUM Confidence with Clear Leader → Auto-Process
- If `50 ≤ topScore < 80` AND `scoreGap ≥ 10`:
  - Auto-processing is **ALLOWED**
  - The gap indicates a clear preference despite lower confidence

## Scoring Algorithm

### Token Matching
1. **requiredTokensAll**: All must be present (+10 points each)
2. **requiredTokensAny**: At least one must be present (+5 points)
3. **formCodeRegex**: Regex pattern match (+15 points)
4. **optionalTokens**: Boost score if present (+2 points each)

### Penalties
- Missing any token from `requiredTokensAll`: -50 points
- No match from `requiredTokensAny`: -30 points

### Metadata Boosting
- Client match: +10 points
- Asset type match: +5 points
- Work type match: +5 points

## Determinism Requirements

### Candidate Ordering
Candidates are sorted deterministically:
1. Primary: Score descending (highest first)
2. Secondary: Template ID (slug) ascending (alphabetical)

This ensures identical inputs always produce identical selection results.

### Hash Verification
Each template version has a SHA-256 hash computed from:
- `specJson` content
- `selectionConfigJson` content

This hash is used to verify version integrity and prevent unauthorized changes.

## Selection Trace

Every selection attempt produces a trace record containing:
- Job sheet ID
- Selected template/version (if any)
- Confidence band
- All candidate scores
- Matched tokens
- Block reason (if blocked)

## Backward Compatibility

If no templates are configured or active:
- The legacy `goldSpecId` path is used
- Existing hardcoded specs continue to work
- No selection trace is created

This ensures the system remains operational during template migration.

## Audit Trail

All selection decisions are:
1. Logged to `selection_traces` table
2. Included in audit result artifacts
3. Available for compliance review

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No active templates | Block with reason, use legacy path if available |
| Template version missing specJson | Skip template in selection |
| Invalid selectionConfig | Skip template, log warning |
| Score calculation error | Block with PIPELINE_ERROR reason |
