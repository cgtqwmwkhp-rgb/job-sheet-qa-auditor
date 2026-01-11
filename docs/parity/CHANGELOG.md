# Parity Framework Changelog

## [2.1.1] - 2026-01-11

### Fixed

- **Subset mode bug**: The parity runner subset mode was loading ALL documents from the golden dataset but only generating actual results for 3 documents. This caused 6 documents to be marked as "missing" (worse).
  
  **Root Cause**: `cli.ts` used `legacy.documents.slice(0, 3)` instead of filtering by `prSubsetDocIds` from thresholds.json.
  
  **Fix**: Updated subset mode to:
  1. Read `prSubsetDocIds` from `thresholds.json`
  2. Filter expected documents to only include subset IDs
  3. Generate actual results for only the subset
  4. Compare only subset documents

### Changed

- **Schema alignment with semantic rules**: Updated `golden-dataset.schema.json` to:
  - Make `reasonCode` optional (null when status=passed)
  - Remove `VALID` from required reasonCodes (VALID is a status, not a reason code)
  - Add `needs_review` to valid status values
  - Add `SPEC_GAP`, `OCR_FAILURE`, `PIPELINE_ERROR` to valid reason codes

- **Dataset update**: Updated `golden-dataset.json` to:
  - Set `reasonCode: null` for all passed fields
  - Remove `VALID` from reasonCodes definition

- **Validator update**: Updated `validate-golden-dataset.ts` to:
  - Allow `null` as a valid reasonCode (for passed fields)

### Evidence

Before fix (on main `7f1b1e8`):
```
Status: FAIL
Documents: 3 same, 0 improved, 6 worse
Fields: 21 same, 0 improved, 43 worse
```

After fix:
```
Status: PASS
Documents: 3 same, 0 improved, 0 worse
Fields: 21 same, 0 improved, 0 worse
```

### Governance

- No threshold relaxation
- Bug fix in test runner, not in extraction logic
- All validators pass: `validate:dataset`, `validate:pii`
- All unit tests pass: 1062 tests

---

## [2.1.0] - 2026-01-04

### Added

- Golden dataset expanded to 9 documents
- Positive and negative suite separation
- Canonical reason code validation
- Severity level S0-S3 standardization

## [2.0.0] - 2026-01-01

### Added

- Initial parity framework implementation
- Golden dataset with 3 documents
- Basic parity comparison
