# ROI Reason Code Mapping

## PR-M: Canonical Reason Code Alignment

This document describes how ROI processing reason codes map to canonical reason codes.

## Canonical Reason Codes (Source of Truth)

From `parity/runner/types.ts`:

| Code | Description |
|------|-------------|
| `VALID` | Field/document is valid |
| `MISSING_FIELD` | Required field is missing or unextractable |
| `INVALID_FORMAT` | Field format is incorrect |
| `OUT_OF_POLICY` | Value is out of acceptable policy range |
| `LOW_CONFIDENCE` | Extraction/validation confidence is below threshold |
| `CONFLICT` | Conflicting information detected |

## ROI Processing Mapping

| Internal Concept | Canonical Code | Rationale |
|-----------------|----------------|-----------|
| Missing Critical ROI | `MISSING_FIELD` | If the ROI for a required field is not defined, we cannot extract that field's data - equivalent to missing field |
| Image QA Failed | `LOW_CONFIDENCE` | Image QA failure means we cannot confidently verify visual elements (signatures, tickboxes) |
| Low Extraction Confidence | `LOW_CONFIDENCE` | Direct mapping - extraction confidence below threshold |

## Implementation

### roiExtractionService.ts

```typescript
export const CANONICAL_REASON_CODE_MAP = {
  MISSING_CRITICAL_ROI: 'MISSING_FIELD',
  IMAGE_QA_FAILED: 'LOW_CONFIDENCE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
} as const;
```

### requiresReviewQueue()

Returns only canonical reason codes:
- `MISSING_FIELD`: Critical ROI is missing (cannot extract required field)
- `LOW_CONFIDENCE`: Extraction confidence too low OR image QA failed

### Determinism

Reason codes are returned as a **sorted array** to ensure deterministic output ordering.

## Activation Policy Codes (Separate Concern)

Note: Activation policy uses internal violation codes like `MISSING_CRITICAL_ROIS`, `MISSING_FIXTURE_PACK`, etc. These are **template governance codes**, not document processing reason codes. They are used internally for activation decisions and are not exposed in document processing outputs.

## Guard Tests

Contract tests in `roiProcessor.contract.test.ts` include guards that:
1. Verify only canonical reason codes are returned
2. Verify non-canonical codes like `MISSING_CRITICAL_ROI` and `IMAGE_QA_FAILED` are never returned
3. Verify reason codes are sorted for determinism
