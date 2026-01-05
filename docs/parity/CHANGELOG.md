# Parity Baseline Changelog

This document tracks all parity baselines and their associated changes.

## Severity Tier Reference

The system uses canonical severity tiers:

| Tier | Name | Description | Threshold |
|------|------|-------------|-----------|
| S0 | Critical | Must pass 100% - blocking issues | 100% |
| S1 | Major | Must pass 95% - significant issues | 95% |
| S2 | Minor | Must pass 90% - moderate issues | 90% |
| S3 | Info | Must pass 80% - informational | 80% |

## Baseline History

### v1.0.0 (Initial Baseline)

**Status:** Created

**Content Hash:** `sha256:c0aa40e2c068216cc86085514d418e7ab1e5c5e13400c1b196d888a7154bef0b`

**Metrics:**
- Pass Rate: 85.5%
- Total Fields: 100
- Passed Fields: 85
- Failed Fields: 15
- Dataset Version: 1.0.0
- Threshold Version: 1.0.0

**Severity Distribution:**
| Severity | Passed | Total | Rate |
|----------|--------|-------|------|
| S0 (Critical) | 20 | 20 | 100.0% |
| S1 (Major) | 30 | 35 | 85.7% |
| S2 (Minor) | 25 | 30 | 83.3% |
| S3 (Info) | 10 | 15 | 66.7% |

**Document Coverage:**
| Document | Status | Pass Rate |
|----------|--------|-----------|
| Job Sheet - Standard | pass | 90.0% |
| Job Sheet - Complex | pass | 85.0% |
| Job Sheet - Edge Case | pass | 80.0% |
| Job Sheet - Missing Fields | fail | 70.0% |
| Job Sheet - OCR Heavy | pass | 88.0% |
| Job Sheet - Multi-Page | pass | 92.0% |
| Job Sheet - Handwritten | pass | 75.0% |
| Job Sheet - Digital | pass | 95.0% |
| Job Sheet - Mixed | pass | 82.0% |

**Changes:**
- Initial baseline establishment
- 9-document golden dataset coverage
- Full severity tier coverage (S0, S1, S2, S3)
- Canonical severity enforcement (no legacy keys allowed)

---

## Baseline Creation Process

1. Run full parity suite: `pnpm parity:full`
2. Review results in `parity/reports/latest.json`
3. Create baseline: `npx tsx scripts/parity/create-baseline.ts --version X.Y.Z`
4. Update this changelog with baseline details
5. Commit baseline file and changelog update

## Baseline Comparison

To compare current results against a baseline:

```bash
npx tsx scripts/parity/compare-to-baseline.ts --baseline 1.0.0
```

## Version Numbering

Baselines follow semantic versioning:
- **Major (X.0.0):** Breaking changes to validation rules or spec format
- **Minor (0.X.0):** New documents or rules added to dataset
- **Patch (0.0.X):** Bug fixes or threshold adjustments

## Threshold Governance

Thresholds are defined in `parity/config/thresholds.json` and enforced during comparison:
- Overall pass rate minimum (95%)
- Per-severity pass rate minimums (S0: 100%, S1: 95%, S2: 90%, S3: 80%)
- Maximum regression count per PR

## Canonical Severity Enforcement

**STRICT POLICY:** Only canonical severity keys are allowed in baselines and reports:
- `S0` (not "critical")
- `S1` (not "high" or "major")
- `S2` (not "medium" or "minor")
- `S3` (not "low" or "info")

Legacy severity keys (critical, high, medium, low, major, minor, info) will cause baseline creation to **fail**.

The baseline tooling validates severity keys and exits non-zero if legacy keys are detected.
