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

**Status:** Pending creation after first parity run

**Metrics:**
- Pass Rate: TBD
- Total Fields: TBD
- Dataset Version: TBD

**Severity Distribution:**
- S0 (Critical): TBD
- S1 (Major): TBD
- S2 (Minor): TBD
- S3 (Info): TBD

**Changes:**
- Initial baseline establishment
- 9-document golden dataset coverage
- Full severity tier coverage (S0, S1, S2, S3)

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

## Canonical Severity Codes

All baseline files and reports MUST use canonical severity codes:
- `S0` (not "critical")
- `S1` (not "high" or "major")
- `S2` (not "medium" or "minor")
- `S3` (not "low" or "info")

Any legacy references to non-canonical severity names should be migrated.
