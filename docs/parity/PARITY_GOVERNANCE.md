# Parity Governance v2

This document describes the parity testing governance model for the Job Sheet QA Auditor system.

## Overview

Parity testing ensures that changes to the document validation pipeline do not introduce regressions. The system uses a **two-suite model** to provide strong regression detection while maintaining clear expectations.

## Suite Architecture

### Positive Suite (`golden-positive.json`)

The positive suite contains documents that are expected to **pass all validations**. This suite enforces strict thresholds:

| Threshold | Value | Description |
|-----------|-------|-------------|
| Overall Pass Rate | 100% | All fields in all documents must pass |
| S0 Pass Rate | 100% | All critical fields must pass |
| S1 Pass Rate | 100% | All major fields must pass |
| Max Worse Documents | 0 | No regressions allowed |
| Max Worse Fields | 0 | No field regressions allowed |

**Documents in Positive Suite:**
- `doc-001`: Standard Job Sheet - Complete
- `doc-003`: Job Sheet - Low Confidence OCR
- `doc-009`: Job Sheet - Table Heavy

### Negative Suite (`golden-negative.json`)

The negative suite contains documents that are expected to **fail with specific reason codes**. This suite validates that the system correctly detects defects.

**Validation Criteria:**
- Each document specifies `expectedFailures` with exact `ruleId`, `field`, and `reasonCode`
- The system must detect all expected failures
- Unexpected failures are flagged but may be acceptable in some cases

**Documents in Negative Suite:**

| Doc ID | Name | Expected Failures |
|--------|------|-------------------|
| doc-002 | Missing Signature | R006/customerSignature: MISSING_FIELD |
| doc-004 | Invalid Format | R001/jobNumber: INVALID_FORMAT |
| doc-005 | Out of Range | R008/laborHours: OUT_OF_POLICY |
| doc-006 | Out of Policy | R003/serviceDate: OUT_OF_POLICY |
| doc-007 | Conflicting Values | R004/technicianId: CONFLICT |
| doc-008 | Multiple Failures | R001, R002, R006: Various |

## Canonical Reason Codes

The system uses a fixed set of canonical reason codes. Legacy codes are automatically mapped:

| Canonical Code | Description | Legacy Mappings |
|----------------|-------------|-----------------|
| `VALID` | Field passed validation | - |
| `MISSING_FIELD` | Required field is missing | - |
| `INVALID_FORMAT` | Field value format is invalid | - |
| `OUT_OF_POLICY` | Value violates business policy or range | `OUT_OF_RANGE`, `RANGE_ERROR` |
| `LOW_CONFIDENCE` | Extraction confidence below threshold | - |
| `CONFLICT` | Conflicting values detected | - |

**Important:** The `OUT_OF_RANGE` code has been deprecated and mapped to `OUT_OF_POLICY`.

## CI Integration

### PR Checks (Subset Mode)

On pull requests, a subset of documents is tested for fast feedback:
- Runs positive suite with first document
- Runs negative suite with first document
- Fails if any regression detected

### Nightly Full Suite

The full suite runs nightly and includes:
- All positive suite documents (strict thresholds)
- All negative suite documents (expected failure validation)
- Full parity report artifact uploaded

## Running Parity Tests

```bash
# Run full combined suite
pnpm test:parity:full

# Run positive suite only
npx tsx parity/runner/cli.ts --mode positive

# Run negative suite only
npx tsx parity/runner/cli.ts --mode negative

# Run subset (for PRs)
npx tsx parity/runner/cli.ts --mode subset
```

## Report Structure

### Combined Report (`latest.json`)

```json
{
  "version": "2.0.0",
  "status": "pass|fail",
  "positive": {
    "suiteType": "positive",
    "status": "pass|fail",
    "summary": { ... },
    "violations": [ ... ]
  },
  "negative": {
    "suiteType": "negative",
    "status": "pass|fail",
    "summary": { ... },
    "violations": [ ... ]
  },
  "violations": [ ... ]
}
```

## Governance Rules

1. **No Threshold Weakening:** Thresholds cannot be lowered without explicit approval from `@qa-team` and `@tech-lead`.

2. **Reason Code Discipline:** Only canonical reason codes are allowed. Adding new codes requires ADR approval.

3. **Dataset Changes:** Changes to golden datasets require:
   - Justification in PR description
   - Review by QA team
   - Updated documentation

4. **Regression Response:**
   - Positive suite failure: Block merge, fix required
   - Negative suite failure: Block merge, investigate expected failure detection

## Troubleshooting

### "Positive suite failed"

1. Check which document/field regressed
2. Review recent changes to validation logic
3. If intentional change, update golden-positive.json with new expected values

### "Negative suite failed - expected failure not detected"

1. Check which expected failure was not detected
2. Verify the validation rule is still active
3. If rule was intentionally removed, update golden-negative.json

### "Non-canonical reason code"

1. Map the legacy code to a canonical code
2. Update the source of the non-canonical code
3. Use `mapToCanonicalReasonCode()` utility if needed

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01-05 | Split into positive/negative suites, canonical reason codes |
| 1.0.0 | 2026-01-04 | Initial parity governance |
