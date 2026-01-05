# Release Checklist

This document provides a step-by-step guide for releasing new versions of the Job Sheet QA Auditor.

## Evidence Policy (MANDATORY)

> **No simulated evidence:** All evidence in the release verification pack MUST be real outputs (CI run URLs, curl excerpts, log snippets). The word "SIMULATED" is forbidden in final evidence packs.

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

## Post-Release Verification

### Evidence Pack (REQUIRED)

Generate and validate the release evidence pack:

```bash
# Generate evidence pack template
npx tsx scripts/release/generate-evidence-pack.ts

# After filling in real evidence, validate
npx tsx scripts/release/validate-evidence-pack.ts
```

### Verification Checklist

- [ ] GitHub Release created successfully
- [ ] Release artifacts attached
- [ ] Deployment successful (if applicable)
- [ ] Smoke tests pass in production (real curl outputs)
- [ ] Monitoring shows no anomalies (real metrics)
- [ ] Evidence pack validated (no SIMULATED content)

### Required Evidence

| Item | Source | Format |
|------|--------|--------|
| Identity | `/api/trpc/system.version` | `git_sha` + `platform_version` |
| CI Evidence | GitHub Actions | Run URL + status |
| Smoke Checks | `scripts/release/smoke-check.sh` | HTTP status + response time |
| Monitoring | Platform metrics | 4xx/5xx rates, latency |
| Rollback Plan | Previous SHA | Git SHA + steps |

## Rollback Procedure

If issues are discovered after release:

### 1. Immediate Mitigation

```bash
# Revert to previous version
git revert HEAD
git push origin main
```

### 2. Create Hotfix

```bash
git checkout -b hotfix/v1.x.x
# Fix the issue
git commit -m "fix: description of fix"
git push origin hotfix/v1.x.x
gh pr create --base main
```

### 3. Document Incident

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

### Evidence Pack Validation Fails

1. Check for "SIMULATED" text in the evidence pack
2. Ensure all required sections are present
3. Verify identity fields contain real values
4. Run `npx tsx scripts/release/validate-evidence-pack.ts` for details

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
