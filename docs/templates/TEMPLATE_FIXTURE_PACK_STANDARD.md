# Template Fixture Pack Standard

Version: 1.0.0
Last Updated: 2024-01-01

## Overview

This document defines the canonical standard for template fixture packs. Every template version MUST have a passing fixture pack before activation. This ensures deterministic behavior and prevents regressions when scaling to 20–30 templates.

## Fixture Pack Requirements

### Mandatory Cases

Every fixture pack MUST include:

| Case Type | Minimum Count | Purpose |
|-----------|---------------|---------|
| PASS variants | ≥2 | Verify template matches expected documents |
| FAIL variants | ≥1 | Verify invalid documents are rejected |
| REVIEW_QUEUE variants | ≥1 | Verify edge cases route to review |

### Case Structure

```json
{
  "caseId": "PASS-001",
  "description": "Standard job sheet with all required fields",
  "inputText": "Job Reference: JOB-12345\nAsset ID: ASSET-001...",
  "expectedOutcome": "pass",
  "expectedReasonCodes": [],
  "expectedFields": {
    "jobReference": "JOB-12345",
    "assetId": "ASSET-001"
  },
  "required": true
}
```

### Case ID Conventions

| Prefix | Outcome | Example |
|--------|---------|---------|
| `PASS-` | Document passes validation | `PASS-001` |
| `FAIL-` | Document fails validation | `FAIL-001` |
| `REVIEW-` | Document routes to review queue | `REVIEW-001` |
| `EDGE-` | Edge case (may pass or fail) | `EDGE-001` |

### Required vs Optional Cases

- `required: true` - Case MUST pass for activation
- `required: false` - Informational, does not block activation

## Canonical Reason Codes

All fixture packs MUST use these canonical reason codes:

### Extraction Codes
| Code | Description |
|------|-------------|
| `MISSING_FIELD` | Required field not found in document |
| `INVALID_FORMAT` | Field value does not match expected format |
| `OUT_OF_RANGE` | Numeric/date value outside acceptable range |
| `EXTRACTION_FAILED` | OCR could not extract field reliably |

### Validation Codes
| Code | Description |
|------|-------------|
| `CRITICAL_MISSING` | Critical required field is missing |
| `SIGNATURE_MISSING` | Required signature not present |
| `TICKBOX_INCOMPLETE` | Compliance tickboxes not all checked |
| `DATE_EXPIRED` | Expiry date has passed |
| `DATE_FUTURE` | Date is in the future (invalid) |

### Selection Codes
| Code | Description |
|------|-------------|
| `LOW_CONFIDENCE` | Selection confidence below threshold |
| `TEMPLATE_MISMATCH` | Document does not match template fingerprint |
| `AMBIGUOUS_SELECTION` | Multiple templates match with similar scores |
| `CONFLICT` | Selection ambiguity requires manual resolution |

## Ordering Requirements

1. **Case Ordering**: Cases MUST be sorted by `caseId` ascending
2. **Reason Codes**: When multiple codes apply, sort alphabetically
3. **Field Ordering**: Expected fields in deterministic key order

## PII Guidelines

⚠️ **CRITICAL**: Fixture packs MUST NOT contain:
- Real customer names
- Real addresses or contact details
- Real asset serial numbers
- Real employee names
- Any data that could identify individuals

Use synthetic data following these patterns:
- Names: `Test Customer Ltd`, `Demo Corp`
- Addresses: `123 Test Street, Testville, TS1 2AB`
- Asset IDs: `ASSET-001`, `ASSET-TEST-001`
- Job References: `JOB-TEST-12345`

## Fixture Pack Validation

Before import, fixture packs are validated for:
1. Required case types present
2. Valid reason codes (canonical only)
3. No PII patterns detected
4. Deterministic ordering

## Example Complete Fixture Pack

```json
{
  "packVersion": "1.0.0",
  "templateVersionId": 1,
  "cases": [
    {
      "caseId": "PASS-001",
      "description": "Complete job sheet with all fields",
      "inputText": "Job Reference: JOB-TEST-001\nAsset ID: ASSET-001\nDate: 2024-01-15\nEngineer Sign Off: Completed\nCustomer: Test Corp",
      "expectedOutcome": "pass",
      "required": true
    },
    {
      "caseId": "PASS-002",
      "description": "Minimal valid job sheet",
      "inputText": "Job Reference JOB-TEST-002 Asset ID ASSET-002 Date 2024-01-16 Engineer Sign Off Yes",
      "expectedOutcome": "pass",
      "required": true
    },
    {
      "caseId": "FAIL-001",
      "description": "Missing critical fields",
      "inputText": "Some random document without job sheet markers",
      "expectedOutcome": "fail",
      "expectedReasonCodes": ["CRITICAL_MISSING", "MISSING_FIELD"],
      "required": true
    },
    {
      "caseId": "REVIEW-001",
      "description": "Partial fields - needs manual review",
      "inputText": "Job Reference: JOB-TEST-003 partial content without signature",
      "expectedOutcome": "review_queue",
      "expectedReasonCodes": ["SIGNATURE_MISSING"],
      "required": true
    }
  ]
}
```

## Activation Gate

Template activation is blocked if:
1. No fixture pack exists
2. Any `required: true` case fails
3. Overall fixture run result is `FAIL`

## Integration with CI

Fixture packs are run automatically in CI via:
```bash
pnpm tsx scripts/templates/run-fixture-matrix.ts --versionId=<id>
```

Exit codes:
- `0` - All required cases pass
- `1` - One or more required cases fail
