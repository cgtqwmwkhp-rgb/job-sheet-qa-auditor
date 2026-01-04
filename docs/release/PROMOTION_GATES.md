# Deployment Promotion Gates

This document describes the promotion workflow and required gates for deploying to staging and production environments.

## Overview

The promotion workflow enforces governance, quality, and parity requirements before allowing deployment to any environment. All gates must pass (or be explicitly approved for skip) before a promotion bundle is generated.

**Key Principle:** Parity gate is REAL and NON-BYPASSABLE for production.

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
- Threshold configuration is valid (has `thresholds.overall.minPassRate`)
- Golden dataset is present and has documents

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

**Can Skip:** 
- **Staging:** Yes, with explicit acknowledgement
- **Production:** **NO - NEVER**

## Environment Rules

### Staging

- All gates required
- Parity can be skipped with explicit acknowledgement (`I_ACCEPT_PARITY_SKIP`)
- Skip acknowledgement is logged in the promotion manifest
- Used for pre-production validation

### Production

- All gates required
- Parity **CANNOT** be skipped under any circumstances
- This is a non-negotiable rule enforced at workflow level
- Requires successful staging deployment first (recommended)

## Parity Skip Controls

For staging environments only:

1. Set `skip_parity` to `true`
2. Enter `I_ACCEPT_PARITY_SKIP` in the acknowledgement field
3. Both conditions must be met for skip to be allowed

The skip acknowledgement is logged in the promotion manifest:

```json
{
  "paritySkipped": true,
  "paritySkipAcknowledgement": {
    "acknowledged": true,
    "acknowledgementText": "I_ACCEPT_PARITY_SKIP",
    "acknowledgedBy": "username",
    "acknowledgedAt": "2025-01-04T10:00:00.000Z"
  }
}
```

## Promotion Bundle

When all gates pass, a promotion bundle is generated containing:

| Artifact | Description |
|----------|-------------|
| `promotion-manifest.json` | Bundle metadata and gate results |
| `provenance.json` | Dataset and threshold provenance |
| `thresholds.json` | Threshold configuration used |
| `parity-report.json` | Full parity test results |
| `dataset-reference.json` | Golden dataset hash reference |
| `baseline-comparison.json` | Baseline comparison (if available) |
| `checksums.txt` | SHA-256 checksums of all artifacts |

### Bundle Hash Determinism

The bundle hash is computed deterministically from artifact hashes **ONLY**:

1. Collect all artifact hashes
2. Sort alphabetically
3. Concatenate with `:` separator
4. Compute SHA-256

**Important:** The bundle hash does NOT include:
- Timestamps
- Actor/user who triggered
- Run ID
- Any other non-content metadata

This ensures the same artifacts always produce the same bundle hash, regardless of when or by whom the bundle was generated.

## Workflow Usage

### Manual Promotion

```bash
# Trigger via GitHub Actions UI
# Select "Deployment Promotion" workflow
# Choose target environment
# For staging with parity skip:
#   - Set skip_parity to true
#   - Enter "I_ACCEPT_PARITY_SKIP" in acknowledgement field
```

### Programmatic Promotion

```bash
# Via GitHub CLI - staging with parity
gh workflow run promotion.yml \
  -f target_environment=staging \
  -f use_nightly_parity=false \
  -f skip_parity=false

# Via GitHub CLI - staging with parity skip (requires acknowledgement)
gh workflow run promotion.yml \
  -f target_environment=staging \
  -f skip_parity=true \
  -f skip_parity_acknowledgement=I_ACCEPT_PARITY_SKIP

# Via GitHub CLI - production (parity skip NOT allowed)
gh workflow run promotion.yml \
  -f target_environment=production \
  -f use_nightly_parity=false \
  -f skip_parity=false
```

## Gate Failure Handling

| Gate | Failure Action |
|------|----------------|
| CI | Fix code issues, re-run |
| Policy | Fix policy violations, re-run |
| Rehearsal | Fix version/build issues, re-run |
| Parity (staging) | Fix validation issues OR request skip with acknowledgement |
| Parity (production) | Fix validation issues - skip is NOT an option |

## Audit Trail

All promotions are logged with:
- Triggering user
- Target environment
- Gate results
- Bundle hash
- Timestamp
- Skip acknowledgement (if applicable)

Artifacts are retained for 90 days.

## Required CI Checks

The following checks must be referenced in branch protection:

| Check Name | Description |
|------------|-------------|
| `CI/Unit & Integration Tests` | Core test suite |
| `CI/TypeScript Check` | Type safety |
| `CI/Lint Check` | Code quality |
| `Policy Check/Policy Consistency Check` | Governance |
| `Parity Check/Parity Subset` | PR parity validation |

## Related Documentation

- [Parity Harness](../parity/PARITY_HARNESS.md)
- [Threshold Governance](../parity/THRESHOLD_GOVERNANCE.md)
- [Release Governance](./RELEASE_GOVERNANCE.md)
- [Baseline Management](../parity/CHANGELOG.md)
