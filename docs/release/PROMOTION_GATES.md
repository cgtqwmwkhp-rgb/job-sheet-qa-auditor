# Deployment Promotion Gates

This document describes the promotion workflow and required gates for deploying to staging and production environments.

## Overview

The promotion workflow enforces governance, quality, and parity requirements before allowing deployment to any environment. All gates must pass (or be explicitly approved for skip) before a promotion bundle is generated.

**Key Principles:**
1. **Parity gate is REAL** - reads from actual parity report output, not computed from dataset
2. **Production parity is NON-BYPASSABLE** - no `|| true`, no `continue-on-error`, no skip
3. **Staging skip requires acknowledgement** - must type `I_ACCEPT_PARITY_SKIP`

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
- **Parity report read from `parity/reports/latest.json`** (real output)

**Can Skip:** 
- **Staging:** Yes, with explicit acknowledgement
- **Production:** **NO - NEVER**

## Parity Gate Realism

The parity gate reads results from the **actual parity report** (`parity/reports/latest.json`), not computed directly from the golden dataset. This ensures:

1. **Real validation** - parity tests actually run and produce output
2. **No bypass** - `|| true` patterns are prohibited
3. **Fail fast** - job exits with code 1 on parity failure

### Prohibited Patterns

The following patterns are **NOT ALLOWED** in the promotion workflow:

```yaml
# ❌ PROHIBITED - bypass pattern
pnpm test:parity:full || true

# ❌ PROHIBITED - continue on error
- name: Run Parity
  continue-on-error: true

# ❌ PROHIBITED - computing pass rate from dataset
node -e "
  const dataset = JSON.parse(fs.readFileSync('golden-dataset.json'));
  // Computing passRate directly...
"
```

### Required Pattern

```yaml
# ✅ REQUIRED - real parity output
if [ -f parity/reports/latest.json ]; then
  STATUS=$(jq -r '.status' parity/reports/latest.json)
  if [ "$STATUS" = "fail" ]; then
    exit 1  # FAIL THE JOB
  fi
fi
```

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
2. Enter `I_ACCEPT_PARITY_SKIP` in the `skip_parity_acknowledgement` field
3. Both conditions must be met for skip to be allowed

The skip acknowledgement is logged in the promotion manifest:

```json
{
  "paritySkipped": true,
  "paritySkipAcknowledgement": "I_ACCEPT_PARITY_SKIP"
}
```

## Promotion Bundle

When all gates pass, a promotion bundle is generated containing:

| Artifact | Description |
|----------|-------------|
| `promotion-manifest.json` | Bundle metadata and gate results |
| `provenance.json` | Dataset and threshold provenance |
| `thresholds.json` | Threshold configuration used |
| `parity-report.json` | Full parity test results (from `latest.json`) |
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
#   - Enter "I_ACCEPT_PARITY_SKIP" in skip_parity_acknowledgement field
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

## Contract Tests

The promotion workflow is verified by contract tests in `server/tests/contracts/stage13c.workflow-contract.test.ts`:

- Verifies no `|| true` bypass patterns
- Verifies no `continue-on-error: true` for parity steps
- Verifies parity report is read from `parity/reports/latest.json`
- Verifies skip acknowledgement controls

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
