# Branch Protection Assumptions

This document declares the assumed branch protection configuration for the `main` branch. It serves as the source of truth for required status checks and review requirements.

## Purpose

GitHub branch protection rules are configured via the repository settings UI or API. This document:

1. **Declares** the expected configuration
2. **Documents** the rationale for each requirement
3. **Enables** the `branch-protection-proof` job to verify configuration
4. **Provides** audit evidence for governance compliance

## Required Status Checks

The following CI jobs MUST pass before merging to `main`:

### CI Workflow (`ci.yml`)

| Job Name | Type | Purpose |
|----------|------|---------|
| **Lint Check** | Blocking | Ensures code style and catches lint errors |
| **TypeScript Check** | Blocking | Validates type safety |
| **Unit & Integration Tests** | Blocking | Validates business logic |
| **E2E Tests (Functional)** | Blocking | Validates end-to-end functionality |
| Load Test (Smoke) | Non-blocking | Performance baseline (informational) |

### Policy Check Workflow (`policy-check.yml`)

| Job Name | Type | Purpose |
|----------|------|---------|
| **Policy Consistency Check** | Blocking | Validates governance docs are present |

### Release Governance Workflow (`release-governance.yml`)

| Job Name | Type | Purpose |
|----------|------|---------|
| **Release Rehearsal** | Blocking | Validates release readiness |
| Branch Protection Proof | Non-blocking | Verifies protection rules (informational) |

## Review Requirements

### Assumed Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Required approvals | 1 | Ensures peer review |
| Dismiss stale reviews | Yes | Re-review after changes |
| Require review from CODEOWNERS | Yes | Domain expertise |
| Restrict dismissals | Yes | Prevent review bypass |

### CODEOWNERS Coverage

The `.github/CODEOWNERS` file defines ownership for:

- `.github/workflows/` - CI/CD infrastructure
- `server/` - Backend code
- `client/` - Frontend code
- `drizzle/` - Database schema
- `docs/evidence/` - Audit documentation

## Merge Restrictions

### Assumed Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Require branches up to date | Yes | Prevent merge conflicts |
| Require linear history | No | Allow merge commits |
| Allow force pushes | No | Preserve history |
| Allow deletions | No | Protect main branch |

## Branch Protection Proof

The `branch-protection-proof` job in `release-governance.yml` provides informational verification of branch protection status. It:

1. Queries the GitHub API for protection rules
2. Reports current configuration
3. Compares against this document's assumptions
4. Uploads evidence artifacts

**Note:** This job is non-blocking because:
- API access may be limited
- Protection rules may be legitimately different in some environments
- The job serves as a reminder/audit tool, not enforcement

## Verification Commands

To manually verify branch protection:

```bash
# Using GitHub CLI
gh api repos/{owner}/{repo}/branches/main/protection

# Check required status checks
gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks
```

## Change Process

To modify branch protection requirements:

1. Update this document with proposed changes
2. Create ADR documenting the decision
3. Get approval from CODEOWNERS
4. Update GitHub repository settings
5. Verify with `branch-protection-proof` job

## Audit Evidence

This document, combined with:
- `branch-protection-proof` job artifacts
- GitHub audit logs
- PR merge history

Provides evidence of governance controls for compliance purposes.

## Related Documents

- [ADR-002: Release Governance](../adr/ADR-002-release-governance.md)
- [CODEOWNERS](../../.github/CODEOWNERS)
- [SECURITY.md](../../SECURITY.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
