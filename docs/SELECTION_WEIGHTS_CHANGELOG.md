# Selection Weights Changelog

This document tracks changes to the template selection signal weights.

## Version History

### v1.0.0 (2026-01-11)

**Initial Release**

| Signal Type | Weight | Description |
|-------------|--------|-------------|
| Token | 0.40 | Keyword matching (requiredTokensAll, requiredTokensAny, optionalTokens) |
| Layout | 0.20 | Page count, sections, form type matching |
| ROI | 0.25 | Expected regions present in document |
| Plausibility | 0.15 | Field patterns found in expected locations |

**Rationale:**
- Token matching is the primary signal (40%) as it directly identifies document type
- ROI matching (25%) provides strong structural validation
- Layout matching (20%) validates document format
- Plausibility (15%) provides additional confidence boosting

## Weight Governance

### How Weights Are Versioned

Each selection trace includes:
```json
{
  "weightsUsed": {
    "tokenWeight": 0.40,
    "layoutWeight": 0.20,
    "roiWeight": 0.25,
    "plausibilityWeight": 0.15,
    "version": "1.0.0",
    "effectiveAt": "2026-01-11T12:00:00.000Z"
  }
}
```

### When to Change Weights

Consider weight changes when:
1. Analysis shows a signal type is over/under-weighted
2. New document types require different emphasis
3. Accuracy metrics indicate systematic bias

### Process for Changing Weights

1. **Propose**: Document the proposed change and rationale
2. **Test**: Run selection fixtures with proposed weights
3. **Review**: Verify near-miss fixtures still block correctly
4. **Increment**: Update `SIGNAL_WEIGHTS_VERSION` in `signalExtractors.ts`
5. **Deploy**: Roll out with feature flag if significant change
6. **Monitor**: Watch selection accuracy metrics post-deploy

## Traceability

All weight changes are tracked in:
- This changelog
- Git history of `server/services/templateSelector/signalExtractors.ts`
- Selection traces stored with each processed document
