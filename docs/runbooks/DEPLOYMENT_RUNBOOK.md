# Deployment Runbook

**Version:** 1.1.0
**Last Updated:** 2026-01-05

## 1. Overview

This runbook provides instructions for deploying the Job Sheet QA Auditor application to staging and production environments. It covers the promotion workflow, manual overrides, and troubleshooting common issues.

## 2. Promotion Workflow

The promotion process is governed by the `promotion.yml` GitHub Actions workflow. This workflow enforces a series of gates to ensure that only high-quality, well-tested code is deployed.

### 2.1. Workflow Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `target_environment` | choice | Yes | Target environment: `staging` or `production` |
| `use_nightly_parity` | boolean | No | Use latest nightly parity results (default: false) |
| `skip_parity` | boolean | No | Skip parity check - STAGING ONLY (default: false) |
| `skip_parity_acknowledgement` | string | No | Must be `I_ACCEPT_PARITY_SKIP` to acknowledge skip |

### 2.2. Triggering a Deployment

Deployments are triggered manually via the GitHub Actions UI.

1. Navigate to the **Actions** tab of the repository.
2. Select the **Deployment Promotion** workflow.
3. Click **Run workflow**.
4. Select the **target_environment** (staging or production).
5. (Staging only) If skipping parity:
   - Set `skip_parity` to `true`
   - Enter `I_ACCEPT_PARITY_SKIP` in `skip_parity_acknowledgement`
6. Click **Run workflow**.

### 2.3. Promotion Gates

The workflow enforces the following gates:

| Gate | Description |
|------|-------------|
| **Validate Request** | Ensures promotion is from `main` branch; blocks production parity skip |
| **CI Gate** | TypeScript check, lint, unit tests, build |
| **Policy Gate** | Verifies required files and workflow configurations |
| **Rehearsal Gate** | Version validation, artifact generation, checksums |
| **Parity Gate** | Full parity test suite - **MANDATORY for production** |

### 2.4. Manual Overrides (Staging Only)

For staging deployments, the parity check can be skipped if necessary. This requires **both**:

1. Set `skip_parity` to `true`
2. Enter exactly `I_ACCEPT_PARITY_SKIP` in `skip_parity_acknowledgement`

**WARNING:** Skipping the parity check should only be done in exceptional circumstances.

**PRODUCTION:** Parity skip is **impossible**. The workflow will fail validation.

## 3. Staging First Promotion Sequence

Always deploy to staging before production.

### 3.1. Staging Deployment

```
1. Trigger promotion workflow
   - target_environment: staging
   - skip_parity: false (recommended)
   
2. Wait for all gates to pass
   - CI Gate
   - Policy Gate
   - Rehearsal Gate
   - Parity Gate
   
3. Verify staging deployment
   - Check application health
   - Run smoke tests
   - Verify key functionality
   
4. Document staging verification
```

### 3.2. Production Deployment

```
1. Confirm staging verification is complete
   
2. Trigger promotion workflow
   - target_environment: production
   - skip_parity: false (cannot be true for production)
   
3. Wait for all gates to pass
   - Parity Gate MUST pass (no skip allowed)
   
4. Verify production deployment
   - Check application health
   - Monitor error rates
   - Verify read-only posture
```

## 4. Production Read-Only Deployment Posture

Production deployments use a read-only posture by default.

### 4.1. Default Configuration

| Config | Default | Purpose |
|--------|---------|---------|
| `ENABLE_PURGE_EXECUTION` | `false` | Prevents data deletion |
| `ENABLE_SCHEDULER` | `false` | Prevents automated jobs |

### 4.2. Read-Only Posture Checklist

Before production deployment, verify:

- [ ] `ENABLE_PURGE_EXECUTION` is `false` or unset
- [ ] `ENABLE_SCHEDULER` is `false` or unset
- [ ] Database connection is read-only (if applicable)
- [ ] No destructive operations are scheduled
- [ ] Monitoring alerts are configured

### 4.3. Enabling Write Operations

To enable write operations in production:

1. Create a change request documenting the need
2. Update environment variables explicitly
3. Monitor closely during the write window
4. Revert to read-only posture after completion

## 5. Troubleshooting

### 5.1. Workflow Permission Restrictions (CLOSED)

**Issue:** The `promotion.yml` workflow could not be updated by the GitHub App.

**Resolution:** This CI_GAP is now **CLOSED**. The workflow was operationalised via PR #27 using a temporary GitHub token. No further action is required.

**Verification after manual application:**

```bash
# Check no bypass patterns
grep -n "|| true" .github/workflows/promotion.yml
# Expected: NO OUTPUT

# Check acknowledgement exists
grep -n "I_ACCEPT_PARITY_SKIP" .github/workflows/promotion.yml
# Expected: Lines with acknowledgement check

# Check parity report source
grep -n "parity/reports/latest.json" .github/workflows/promotion.yml
# Expected: Lines reading from latest.json
```

### 5.2. Parity Failures

**Issue:** The Parity Gate fails.

**Symptom:** Workflow fails at **Parity Gate** step.

**Resolution:**

1. Download the `promotion-parity-report` artifact
2. Review `parity/reports/latest.json` for violations
3. Check threshold configuration in `parity/config/thresholds.json`
4. Address regressions in a new PR
5. Re-run promotion workflow

### 5.3. Missing Secrets

**Issue:** Application fails due to missing API keys.

**Symptom:** Errors related to `MISTRAL_API_KEY` or `GEMINI_API_KEY`.

**Resolution:**

1. Verify secrets are configured in GitHub Actions Secrets
2. Required secrets:
   - `MISTRAL_API_KEY` - OCR service
   - `GEMINI_API_KEY` - AI validation
3. For local development, use `.env` file (not committed)

### 5.4. Parity Skip Rejected

**Issue:** Staging parity skip is rejected.

**Symptom:** Workflow fails with "Missing skip acknowledgement" error.

**Resolution:**

1. Ensure `skip_parity_acknowledgement` is exactly `I_ACCEPT_PARITY_SKIP`
2. No extra spaces or characters
3. Case-sensitive match required

### 5.5. Production Parity Skip Attempted

**Issue:** Attempting to skip parity for production.

**Symptom:** Workflow fails with "Cannot skip parity for production" error.

**Resolution:**

1. Production parity skip is **impossible by design**
2. Fix the parity failures instead
3. If urgent, deploy to staging first with skip, then fix before production

## 6. Evidence and Documentation

### 6.1. Deployment Readiness Pack

See `docs/evidence/DEPLOYMENT_READINESS_PACK.md` for:
- Current HEAD SHA
- Gate checklist status
- Config defaults
- Sign-off requirements

### 6.2. CI_GAP Documentation (CLOSED)

See `docs/patches/CI_GAP_PROMOTION_WORKFLOW.md` for the closure notice.

### 6.3. Operationalised Workflow

See `docs/patches/promotion.yml.operationalised` for:
- Complete operationalised workflow
- No bypass patterns
- Real parity report source
- Skip acknowledgement controls
