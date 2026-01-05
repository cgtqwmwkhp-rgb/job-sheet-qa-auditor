# Sandbox Test Data Pack

This directory contains minimal, non-PII fixture files for manual UI testing in a sandbox environment.

## Fixture Files

| File | Purpose | Expected Outcome |
|------|---------|------------------|
| `fixture_pass.json` | Fully compliant job sheet | All checks pass, 0 issues |
| `fixture_fail_missing_field.json` | Missing customer signature | 1 issue: `MISSING_FIELD` |
| `fixture_fail_invalid_date.json` | Invalid date format | 1 issue: `INVALID_FORMAT` |

## Canonical Reason Codes

All fixtures use canonical reason codes as defined in `server/services/analyzer.ts`:

| Code | Description |
|------|-------------|
| `VALID` | Field passed validation |
| `MISSING_FIELD` | Required field is missing or empty |
| `INVALID_FORMAT` | Field value does not match expected format |
| `OUT_OF_POLICY` | Field value is outside acceptable policy range |
| `LOW_CONFIDENCE` | OCR confidence below threshold |
| `UNREADABLE_FIELD` | Field could not be read from document |
| `CONFLICT` | Multiple conflicting values found |
| `INCOMPLETE_EVIDENCE` | Insufficient evidence to validate |
| `OCR_FAILURE` | OCR processing failed for this field |
| `PIPELINE_ERROR` | Internal processing error |
| `SPEC_GAP` | Specification does not cover this case |
| `SECURITY_RISK` | Potential security issue detected |

## Severity Levels

| Level | Description |
|-------|-------------|
| `S0` | Critical - Must be resolved before approval |
| `S1` | High - Should be resolved, may block approval |
| `S2` | Medium - Should be reviewed |
| `S3` | Low - Informational only |

## How to Use

### Option 1: Fixture Upload Mode (Sandbox Only)

When running in sandbox mode (`NODE_ENV=development`), the application supports direct JSON fixture upload:

```bash
# Load a fixture into the database for UI testing
pnpm exec tsx scripts/load-fixture.ts docs/testing/sandbox-fixtures/fixture_pass.json
```

### Option 2: Use Existing Parity Fixtures

The parity suite contains additional well-structured test data:

- **Positive Cases:** `parity/fixtures/golden-positive.json`
- **Negative Cases:** `parity/fixtures/golden-negative.json`

### Option 3: Use Demo Mode

Navigate to `/demo` in your browser to use mock data without file uploads.

## Data Schema

Each fixture follows this structure:

```json
{
  "id": "sandbox-xxx-001",
  "name": "Fixture Name",
  "description": "What this fixture tests",
  "expectedResult": "pass | fail",
  "schemaVersion": "1.0.0",
  "extractedFields": {
    "jobNumber": "JS-2026-xxx",
    "customerName": "CUSTOMER_NAME",
    "serviceDate": "YYYY-MM-DD",
    "technicianId": "TECH-xxx",
    "workDescription": "Description text",
    "partsUsed": ["PART-xxx"],
    "laborHours": 0.0,
    "totalCost": 0.00,
    "customerSignature": true | false,
    "technicianSignature": true | false
  },
  "validatedFields": [
    {
      "ruleId": "Rxxx",
      "field": "fieldName",
      "status": "passed | failed",
      "value": "extracted value",
      "confidence": 0.0-1.0,
      "pageNumber": 1,
      "severity": "S0 | S1 | S2 | S3",
      "reasonCode": "VALID | MISSING_FIELD | INVALID_FORMAT | ..."
    }
  ],
  "findings": [
    {
      "ruleId": "Rxxx",
      "field": "fieldName",
      "severity": "S0 | S1 | S2 | S3",
      "message": "Human-readable description",
      "reasonCode": "MISSING_FIELD | INVALID_FORMAT | ...",
      "pageNumber": 1
    }
  ]
}
```

## Non-PII Guarantee

All fixture data uses:
- Synthetic customer names (e.g., "SANDBOX_CUSTOMER")
- Synthetic job numbers (e.g., "JS-2026-SANDBOX-001")
- Synthetic technician IDs (e.g., "TECH-SANDBOX-01")
- No real addresses, phone numbers, or personal information
