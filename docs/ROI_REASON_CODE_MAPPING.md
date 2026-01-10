# ROI Reason Code Mapping

## PR-P: Semantic Correction for Analytics

This document describes how ROI processing reason codes map to canonical reason codes with semantic correctness for analytics.

## Why Semantic Correctness Matters

Analytics must correctly attribute issues:
- **Document issues** → attributed to document/engineer
- **System/Config issues** → attributed to system, not document/engineer

Using `MISSING_FIELD` for a missing ROI configuration would incorrectly penalize documents/engineers for what is actually a template configuration problem.

## Canonical Reason Codes (Source of Truth)

From `parity/runner/types.ts`:

### Document-Level Codes (Attributed to Document/Engineer)

| Code | Description | Example |
|------|-------------|---------|
| `VALID` | Field/document passed validation | Field extracted correctly |
| `MISSING_FIELD` | Required field not present **in document** | Engineer didn't fill in a field |
| `INVALID_FORMAT` | Field format is incorrect | Date in wrong format |
| `OUT_OF_POLICY` | Value outside acceptable range | Expiry date too far in future |
| `LOW_CONFIDENCE` | Extraction confidence below threshold | Handwriting unclear |
| `CONFLICT` | Conflicting information detected | Mismatch between fields |

### System/Config-Level Codes (Attributed to System, NOT Document)

| Code | Description | Example |
|------|-------------|---------|
| `SPEC_GAP` | Template spec or ROI incomplete | No ROI defined for signature |
| `OCR_FAILURE` | OCR/image QA processing failed | Image quality check failed |
| `PIPELINE_ERROR` | System/infrastructure error | Service timeout, processing crash |

## ROI Processing Mapping

| Internal Concept | Canonical Code | Attribution | Rationale |
|-----------------|----------------|-------------|-----------|
| Missing Critical ROI | `SPEC_GAP` | System | ROI not defined in template config |
| Image QA Failed | `OCR_FAILURE` | System | Processing pipeline failure |
| Low Extraction Confidence | `LOW_CONFIDENCE` | Document | Document quality/readability issue |

## Implementation

### roiExtractionService.ts

```typescript
export const CANONICAL_REASON_CODE_MAP = {
  MISSING_CRITICAL_ROI: 'SPEC_GAP',    // Config issue - ROI not defined
  IMAGE_QA_FAILED: 'OCR_FAILURE',       // Processing failure - image QA failed
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',     // Document issue - extraction uncertain
} as const;
```

### requiresReviewQueue()

Returns semantically correct canonical reason codes:
- `SPEC_GAP`: Template ROI configuration incomplete (system issue)
- `OCR_FAILURE`: Image QA processing failed (system issue)
- `LOW_CONFIDENCE`: Extraction confidence too low (document issue)

### Determinism

Reason codes are returned as a **sorted array** to ensure deterministic output ordering.

## Analytics Impact

With this mapping:

1. **Template issues** are tracked under `SPEC_GAP`
   - Allows template authors to see which templates need ROI configuration
   - Does NOT penalize documents or engineers

2. **Processing failures** are tracked under `OCR_FAILURE`
   - Allows ops to monitor system health
   - Does NOT penalize documents or engineers

3. **Document quality issues** remain under `LOW_CONFIDENCE`
   - Correctly attributed to document readability
   - Can be used for engineer training/feedback

## Migration Notes

PR-P changed the following mappings:
- `MISSING_CRITICAL_ROI` → was `MISSING_FIELD`, now `SPEC_GAP`
- `IMAGE_QA_FAILED` → was `LOW_CONFIDENCE`, now `OCR_FAILURE`

Existing analytics dashboards should be updated to use the new codes.
