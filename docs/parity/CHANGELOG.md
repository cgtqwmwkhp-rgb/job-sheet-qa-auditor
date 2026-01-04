# Parity Baseline Changelog

This document tracks all parity baselines and their associated changes.

## Baseline History

### v1.0.0 (Initial Baseline)

**Status:** Pending creation after first parity run

**Metrics:**
- Pass Rate: TBD
- Total Fields: TBD
- Dataset Version: TBD

**Changes:**
- Initial baseline establishment
- 9-document golden dataset coverage
- Full severity tier coverage (critical, high, medium, low)

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
- Overall pass rate minimum
- Per-severity pass rate minimums
- Maximum regression count per PR
