# Release Checklist

This document provides a step-by-step guide for releasing new versions of the Job Sheet QA Auditor.

## Pre-Release Validation

### Automated Checks (CI)

The following are automatically validated by the `release-rehearsal` job:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] TypeScript compilation succeeds
- [ ] ESLint passes (0 errors)
- [ ] Version consistency validated
- [ ] Changelog updated
- [ ] Production build succeeds
- [ ] Artifact checksums generated

### Manual Checks

Before initiating a release:

- [ ] Review CHANGELOG.md for completeness
- [ ] Verify version number follows semver
- [ ] Confirm all PRs for this release are merged
- [ ] Review any open security advisories
- [ ] Notify stakeholders of upcoming release

## Release Execution

### 1. Create Release Branch (Optional)

For major releases, create a release branch:

```bash
git checkout main
git pull origin main
git checkout -b release/v1.x.x
```

### 2. Update Version

```bash
# Update version in package.json
npm version [major|minor|patch] --no-git-tag-version

# Update CHANGELOG.md with release date
```

### 3. Create Release PR

```bash
git add -A
git commit -m "chore(release): prepare v1.x.x"
git push origin release/v1.x.x
gh pr create --base main --title "Release v1.x.x"
```

### 4. Wait for CI

- [ ] release-rehearsal job passes
- [ ] All required status checks pass
- [ ] PR approved by required reviewers

### 5. Merge and Tag

```bash
gh pr merge --squash
git checkout main
git pull origin main
git tag v1.x.x
git push origin v1.x.x
```

### 6. Create GitHub Release

```bash
gh release create v1.x.x --title "v1.x.x" --notes-file CHANGELOG.md
```

## Post-Release Verification (MANDATORY)

> **CRITICAL:** Post-release verification MUST use the canonical `release-verification.yml` workflow.
> Evidence MUST be captured from the DEPLOYED environment, not simulated.

### Staging Verification

Run the release verification workflow for staging:

```bash
gh workflow run release-verification.yml \
  --field environment_name=staging \
  --field target_url=https://staging.example.com \
  --field expected_git_sha=$(git rev-parse HEAD) \
  --field mode=soft
```

**Required Evidence (from workflow artifacts):**

- [ ] `smoke/deployed_sha.txt` - Contains actual deployed SHA (NOT "MISSING_EVIDENCE")
- [ ] `smoke/summary.json` - All checks PASS
- [ ] `monitoring/summary.json` - evidenceType is "METRICS" or "HEALTH_ONLY"

### Production Verification

Run the release verification workflow for production (STRICT mode):

```bash
gh workflow run release-verification.yml \
  --field environment_name=production \
  --field target_url=https://production.example.com \
  --field expected_git_sha=$(git rev-parse HEAD) \
  --field mode=strict
```

**Required Evidence (from workflow artifacts):**

- [ ] `smoke/deployed_sha.txt` - Contains actual deployed SHA matching expected
- [ ] `smoke/summary.json` - All checks PASS, SHA match MATCH
- [ ] `monitoring/summary.json` - evidenceType is "METRICS" or "HEALTH_ONLY"

### Multi-Environment Orchestration (Recommended)

For coordinated staging→production verification:

```bash
gh workflow run release-verification.yml \
  --field verify_staging=true \
  --field verify_production=true \
  --field staging_url=https://staging.example.com \
  --field production_url=https://production.example.com \
  --field expected_git_sha=$(git rev-parse HEAD)
```

This will:
1. Run staging verification (soft mode)
2. Only proceed to production if staging passes
3. Run production verification (strict mode)
4. Generate combined summary

### Local Verification (Development Only)

For local testing before deployment:

```bash
# Smoke checks
./scripts/release/smoke-check.sh http://localhost:3000 $(git rev-parse HEAD) soft

# Monitoring snapshot
./scripts/release/monitor-snapshot.sh http://localhost:3000 soft
```

**Output files:**
- `logs/release/smoke/` - Smoke check results
- `logs/release/monitoring/` - Monitoring snapshot

## Evidence Pack Requirements

**NO SIMULATED EVIDENCE ALLOWED**

All evidence MUST be captured from real deployed environments:

| Evidence File | Required Content | Failure Marker |
|--------------|------------------|----------------|
| `deployed_sha.txt` | Full Git SHA | `MISSING_EVIDENCE:` |
| `smoke/summary.json` | `overallStatus: PASS` | `overallStatus: FAIL` |
| `monitoring/summary.json` | `evidenceType: METRICS` or `HEALTH_ONLY` | `evidenceType: NONE` |

If any evidence file contains `MISSING_EVIDENCE:` or `SIMULATED`, the release verification FAILS.

## Rollback Procedure

If issues are discovered after release:

### 1. Identify Rollback Target

```bash
# Get previous deployed SHA from promotion history
gh run list --workflow=promotion.yml --limit=5
```

### 2. Immediate Mitigation

```bash
# Revert to previous version
git revert HEAD
git push origin main
```

### 3. Create Hotfix

```bash
git checkout -b hotfix/v1.x.x
# Fix the issue
git commit -m "fix: description of fix"
git push origin hotfix/v1.x.x
gh pr create --base main
```

### 4. Document Incident

- Create incident report
- Update CHANGELOG with fix
- Notify stakeholders

## Troubleshooting

### release-rehearsal Fails

1. Check CI logs for specific failure
2. Run locally: `npm run build && npm test`
3. Verify version consistency: `npm run check:version`

### branch-protection-proof Fails

1. Check GitHub repository settings
2. Verify branch protection rules are enabled
3. Contact repository admin if rules need updating

### Artifact Checksum Mismatch

1. Re-run the build
2. Check for non-deterministic build outputs
3. Verify no local modifications

### Release Verification Fails

1. **deployed_sha.txt contains MISSING_EVIDENCE:**
   - Check if `/api/trpc/system.version` endpoint exists
   - Verify the endpoint returns `gitSha` field
   - Check network connectivity to target environment

2. **SHA Mismatch:**
   - Verify deployment completed successfully
   - Check if correct commit was deployed
   - Confirm no caching issues

3. **Monitoring shows HEALTH_ONLY:**
   - This is acceptable in soft mode
   - For strict mode, ensure metrics endpoint is available
   - Check `/metrics` or `/api/metrics` endpoint

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Changelog Format

Follow [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [1.x.x] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes
```
