# Deployment Promotion Gates

This document describes the promotion workflow and required gates for deploying to staging and production environments.

## Overview

The promotion workflow enforces governance, quality, and parity requirements before allowing deployment to any environment. All gates must pass (or be explicitly approved for skip) before a promotion bundle is generated.

## Required Gates

### 1. CI Gate

**Purpose:** Ensure code quality and test coverage.

**Requirements:**
- TypeScript check passes
- Lint check passes
- All unit tests pass
- Production build succeeds

**Can Skip:** No

### 2. Policy Gate

**Purpose:** Ensure governance policies are followed.

**Requirements:**
- All required workflow files exist
- Threshold configuration is valid
- Golden dataset is present and valid

**Can Skip:** No

### 3. Release Rehearsal Gate

**Purpose:** Validate release readiness.

**Requirements:**
- Version follows semver
- Production build succeeds
- Artifact checksums generated

**Can Skip:** No

### 4. Parity Gate

**Purpose:** Ensure validation quality meets thresholds.

**Requirements:**
- Dataset hash verification passes
- Provenance generated
- Full parity suite passes all thresholds

**Can Skip:** Yes (staging only, requires approval)

## Environment Rules

### Staging

- All gates required
- Parity can be skipped with explicit approval
- Used for pre-production validation

### Production

- All gates required
- Parity **cannot** be skipped
- Requires successful staging deployment first (recommended)

## Promotion Bundle

When all gates pass, a promotion bundle is generated containing:

| Artifact | Description |
|----------|-------------|
| `promotion-manifest.json` | Bundle metadata and gate results |
| `provenance.json` | Dataset and threshold provenance |
| `thresholds.json` | Threshold configuration used |
| `parity-report.json` | Full parity test results |
| `dataset-reference.json` | Golden dataset hash reference |
| `checksums.txt` | SHA-256 checksums of all artifacts |

### Bundle Hash

The bundle hash is computed deterministically from artifact hashes:
1. Collect all artifact hashes
2. Sort alphabetically
3. Concatenate with `:` separator
4. Compute SHA-256

This ensures the same artifacts always produce the same bundle hash, regardless of generation order or timing.

## Workflow Usage

### Manual Promotion

```bash
# Trigger via GitHub Actions UI
# Select "Deployment Promotion" workflow
# Choose target environment
# Optionally enable parity skip (staging only)
```

### Programmatic Promotion

```bash
# Via GitHub CLI
gh workflow run promotion.yml \
  -f target_environment=staging \
  -f use_nightly_parity=false \
  -f skip_parity=false
```

## Gate Failure Handling

| Gate | Failure Action |
|------|----------------|
| CI | Fix code issues, re-run |
| Policy | Fix policy violations, re-run |
| Rehearsal | Fix version/build issues, re-run |
| Parity | Fix validation issues or request skip approval |

## Audit Trail

All promotions are logged with:
- Triggering user
- Target environment
- Gate results
- Bundle hash
- Timestamp

Artifacts are retained for 90 days.

## Related Documentation

- [Parity Harness](../parity/PARITY_HARNESS.md)
- [Threshold Governance](../parity/THRESHOLD_GOVERNANCE.md)
- [Release Governance](./RELEASE_GOVERNANCE.md)
