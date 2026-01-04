# ADR-002: Release Governance

## Status

Accepted

## Date

2026-01-04

## Context

The Job Sheet QA Auditor project requires a robust release process that:

1. Prevents accidental releases of broken code
2. Ensures all quality gates pass before release
3. Provides audit trail for compliance
4. Supports rollback in case of issues
5. Validates branch protection is properly configured

Without formal release governance, there's risk of:
- Releasing untested code
- Missing required approvals
- Inconsistent release artifacts
- Difficulty in auditing release history

## Decision

We will implement a **release-governance.yml** workflow with two jobs:

### 1. release-rehearsal

A dry-run of the release process that:
- Validates version consistency across package.json files
- Checks changelog format and completeness
- Runs the full test suite (unit, integration, E2E)
- Builds production artifacts
- Validates artifact integrity (checksums)
- Does NOT publish or deploy

This runs on:
- Every push to main
- Every PR targeting main
- Manual dispatch for release candidates

### 2. branch-protection-proof

Validates that branch protection rules are enforced:
- Required status checks are configured
- PR reviews are required
- Direct pushes to main are blocked
- Force pushes are disabled

This runs on:
- Schedule (daily)
- Manual dispatch

## Consequences

### Positive

- **Confidence**: Every commit to main has passed release-rehearsal
- **Auditability**: Clear record of what was validated
- **Consistency**: Same process for every release
- **Early Detection**: Issues caught before release attempt
- **Compliance**: Demonstrates governance controls

### Negative

- **CI Time**: Additional ~3-5 minutes per PR
- **Complexity**: More workflow files to maintain
- **False Positives**: Branch protection check may fail if rules change

### Mitigations

- release-rehearsal runs in parallel with other CI jobs
- Branch protection check is non-blocking (warning only)
- Clear documentation for troubleshooting

## Alternatives Considered

### 1. Manual Release Checklist

Rejected: Too error-prone, no enforcement

### 2. Release Branch Strategy

Rejected: Adds complexity without clear benefit for this project size

### 3. Tag-Based Releases Only

Rejected: Doesn't validate before tagging

## Implementation

1. Create `.github/workflows/release-governance.yml`
2. Add release-rehearsal job with full validation
3. Add branch-protection-proof job with API checks
4. Document in `docs/RELEASE_CHECKLIST.md`
5. Update CI documentation

## References

- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
