# Parity Fixture Rules

This document defines the rules and contracts for golden dataset fixtures used in parity testing.

## Canonical Severity Levels

All severities must use the S0-S3 scale:

| Level | Name | Description |
|-------|------|-------------|
| S0 | Critical | Blocks completion - must be resolved |
| S1 | Major | Requires attention - should be resolved |
| S2 | Minor | Should be addressed - can be deferred |
| S3 | Info | For reference only - no action required |

## Canonical Reason Codes

All reason codes must be from this list:

| Code | Description |
|------|-------------|
| VALID | Field passed validation |
| MISSING_FIELD | Required field is missing |
| INVALID_FORMAT | Field value does not match expected format |
| OUT_OF_RANGE | Field value is outside acceptable range |
| OUT_OF_POLICY | Field value violates business policy |
| CONFLICT | Conflicting values detected for field |
| LOW_CONFIDENCE | Extraction confidence below threshold |

## Evidence Structure

All validated fields and findings must include an evidence object:

```json
{
  "evidence": {
    "snippet": "Text snippet from document (may be empty string)",
    "boundingBox": null  // or { "x": 0, "y": 0, "width": 100, "height": 20 }
  }
}
```

The `snippet` field may be an empty string but must always be present. The `boundingBox` field is nullable.

## Deterministic Ordering

All arrays in the dataset must be deterministically ordered:

1. **Documents**: Sorted by `id` (doc-001, doc-002, ...)
2. **Rules**: Sorted by `ruleId` (R001, R002, ...)
3. **ValidatedFields**: Sorted by `ruleId` within each document
4. **Findings**: Sorted by `id` (F001, F002, ...) within each document

## ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| Document | `doc-NNN` | doc-001 |
| Rule | `RNNN` | R001 |
| Finding | `FNNN` | F001 |

## PII Safety

Fixtures must not contain personally identifiable information:

### Prohibited
- Real names (first + last name patterns)
- Real company names (Inc, LLC, Corp, Ltd, etc.)
- Email addresses
- Phone numbers
- Postal codes
- Street addresses

### Allowed Synthetic Placeholders
- `CUSTOMER_A`, `CUSTOMER_B`, etc.
- `VENDOR_X`, `PARTNER_Y`, etc.
- `TECH-NNN` for technician IDs
- `PART-XXXX` for part numbers
- `JS-YYYY-NNN` for job numbers

## Validation

Run validation before committing changes:

```bash
# Validate schema and ordering
pnpm validate:dataset

# Check for PII
pnpm validate:pii

# Run all validations
pnpm validate:all
```

## Schema

The dataset must conform to `parity/fixtures/golden-dataset.schema.json`. Key requirements:

1. Version fields are semver format
2. All documents have required fields
3. All validated fields have evidence objects
4. All findings have evidence objects
5. All severities are S0-S3
6. All reason codes are from canonical list

## Adding New Documents

When adding new documents to the golden dataset:

1. Use the next sequential document ID (doc-004, doc-005, etc.)
2. Include all 7 validated fields (R001-R007)
3. Add findings for any failed validations
4. Ensure deterministic ordering
5. Use synthetic placeholders for any names/companies
6. Run `pnpm validate:all` before committing
