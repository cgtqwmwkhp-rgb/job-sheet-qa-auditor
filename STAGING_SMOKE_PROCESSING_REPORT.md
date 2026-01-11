# Staging Smoke Processing Report

## Stage C — Staging Smoke Processing (Realistic)

**Date**: 2026-01-11  
**Head SHA**: `3b0c06b58564652180636a74f86a2c062bfcb446`  
**Environment**: Staging

---

## Prerequisites

Before running smoke processing:
- [ ] Stage B verification completed (all endpoints green)
- [ ] SSOT strict mode confirmed active
- [ ] Staging URL accessible

```bash
export STAGING_URL="https://your-staging-app.azurecontainerapps.io"
```

---

## C1: Processing Runs (Minimum 3)

### Run 1: Template A (e.g., Standard Invoice)

**Document**: `fixture-invoice-001.pdf` or equivalent  
**Timestamp**: ____-__-__ __:__:__

| Metric | Value |
|--------|-------|
| Selected Template | |
| Template Version | |
| Confidence Band | |
| Runner-up Delta | |
| Processing Time | |

**Selection Trace Path**: `____`

**Selection Trace Evidence**:
```json
// PASTE selection_trace.json content here
// Must include signal weights:
// {
//   "signals": {
//     "layoutScore": { "value": ___, "weight": 0.4 },
//     "fieldMatchScore": { "value": ___, "weight": 0.3 },
//     "headerPatternScore": { "value": ___, "weight": 0.2 },
//     "dateFormatScore": { "value": ___, "weight": 0.1 }
//   }
// }
```

**Validation Trace Exists**: [ ] Yes / [ ] No

---

### Run 2: Template B (e.g., Service Report)

**Document**: `fixture-service-002.pdf` or equivalent  
**Timestamp**: ____-__-__ __:__:__

| Metric | Value |
|--------|-------|
| Selected Template | |
| Template Version | |
| Confidence Band | |
| Runner-up Delta | |
| Processing Time | |

**Selection Trace Path**: `____`

**Selection Trace Evidence**:
```json
// PASTE selection_trace.json content here
```

**Validation Trace Exists**: [ ] Yes / [ ] No

---

### Run 3: Redacted Real Document (or Template C)

**Document**: `redacted-real-001.pdf` or equivalent  
**Timestamp**: ____-__-__ __:__:__

| Metric | Value |
|--------|-------|
| Selected Template | |
| Template Version | |
| Confidence Band | |
| Runner-up Delta | |
| Processing Time | |

**Selection Trace Path**: `____`

**Selection Trace Evidence**:
```json
// PASTE selection_trace.json content here
```

**Validation Trace Exists**: [ ] Yes / [ ] No

---

## C2: ROI/Image QA Fusion Evidence (If Applicable)

If documents contain tickboxes or signatures:

### Tickbox Detection

| Document | Field | Detected Value | Confidence | Fusion Method |
|----------|-------|----------------|------------|---------------|
| | | | | |

### Signature Detection

| Document | Field | Detected | Confidence | Bounding Box |
|----------|-------|----------|------------|--------------|
| | | | | |

---

## C3: Guardrail Verification

### Ambiguity Block Test

**Test Case**: Submit a document with ambiguous template match (runner-up delta < 0.1)

| Metric | Expected | Actual |
|--------|----------|--------|
| Auto-process | ❌ Blocked | |
| Reason | Ambiguous template | |
| User intervention required | ✅ Yes | |

**Evidence**:
```
// PASTE guardrail trigger log or response here
```

---

### Critical Field Calibration Test

**Test Case**: Process document with known critical fields

| Field | Expected Outcome | Actual Outcome | Deterministic? |
|-------|------------------|----------------|----------------|
| | | | |

---

## Smoke Processing Summary

| Check | Status | Evidence |
|-------|--------|----------|
| 3+ processing runs completed | ⬜ | |
| Selection traces include weights | ⬜ | |
| Validation traces exist | ⬜ | |
| Ambiguity blocks auto-process | ⬜ | |
| Critical field calibration deterministic | ⬜ | |

---

## Stage C Conclusion

- [ ] All smoke processing runs successful
- [ ] Selection traces verified with signal weights
- [ ] Guardrails functioning correctly
- [ ] Ready to proceed to Stage D (Watch Window)

**Signed Off By**: ____________________  
**Date**: ____-__-__
