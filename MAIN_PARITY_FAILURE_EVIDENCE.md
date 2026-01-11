# Main Branch Parity Failure Evidence

## Phase A: Evidence Capture

**Date**: 2026-01-11  
**Main HEAD SHA**: `7f1b1e8`  
**Command Run**: `pnpm run test:parity:subset`

### Failure Summary

```
═══════════════════════════════════════════
Status: FAIL
Documents: 3 same, 0 improved, 6 worse
Fields: 21 same, 0 improved, 43 worse
═══════════════════════════════════════════

❌ Violations:
   - Worse documents (6) exceeds threshold (0)
   - Worse fields (43) exceeds threshold (0)
   - Same percentage (32.8%) below threshold (100%)
```

### Document Status Breakdown

| Document ID | Status | Expected | Actual | Field Status |
|-------------|--------|----------|--------|--------------|
| doc-001 | same | pass | pass | 7 same |
| doc-002 | same | fail | fail | 7 same |
| doc-003 | same | pass | pass | 7 same |
| doc-004 | **missing** | fail | None | 7 missing |
| doc-005 | **missing** | fail | None | 8 missing |
| doc-006 | **missing** | fail | None | 7 missing |
| doc-007 | **missing** | fail | None | 7 missing |
| doc-008 | **missing** | fail | None | 7 missing |
| doc-009 | **missing** | pass | None | 7 missing |

### Which Suite Failed

- **Positive suite**: doc-009 (pass expected) - MISSING
- **Negative suite**: doc-004 through doc-008 (fail expected) - ALL MISSING

## Phase B: Root Cause Analysis

### Root Cause: **Category 2 - Expected Behavior Change (Baseline Update Required)**

The parity runner CLI has a bug in **subset mode**:

1. `cli.ts` line 127: `runner.loadGoldenDataset(LEGACY_FIXTURES_PATH)` loads ALL 9 documents
2. `cli.ts` line 129: `const subsetDocs = legacy.documents.slice(0, 3)` - only takes first 3
3. `cli.ts` line 130: `generateMockActualResults(subsetDocs)` - only generates 3 actual results
4. `cli.ts` line 132: `runner.runParity(actualResults)` - compares ALL 9 expected vs 3 actual

**Result**: 6 documents have no actual results → marked as "missing" → counted as "worse"

### Configuration Evidence

From `thresholds.json`:
```json
"prSubsetDocIds": ["doc-001", "doc-002", "doc-004"]
```

But the code ignores this and uses `legacy.documents.slice(0, 3)` which returns:
- doc-001, doc-002, doc-003 (NOT doc-004)

### Why This Is Category 2 (Not Category 1)

- This is NOT a bug in the extractor/selector/calibration code
- This is a bug in the **parity test runner itself**
- The fix requires updating the test runner to:
  1. Use `prSubsetDocIds` from thresholds.json
  2. Only load subset documents as expected (not all)
  3. Generate actual results for only the subset

## Recommended Fix

Modify `parity/runner/cli.ts` subset mode to:
1. Read `prSubsetDocIds` from thresholds.json
2. Filter both expected AND actual documents to only include subset IDs
3. Run parity comparison on matched subset only
