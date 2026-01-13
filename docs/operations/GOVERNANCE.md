# Operations Governance

**Last Updated:** 2026-01-13  
**Owner:** Release Governor

---

## Overview

This document defines governance policies for operations documentation, evidence handling, and release processes in the Job Sheet QA Auditor project.

---

## Evidence Handling Policy

### Rule 1: Evidence Updates via PR

> ⚠️ **All evidence pack updates MUST go through a Pull Request.**

**Rationale:**
- Provides audit trail for compliance
- Enables peer review of evidence accuracy
- Prevents accidental overwrites or data loss
- Maintains traceability between evidence and releases

**Process:**
1. Create a feature branch: `ai/<topic>` or `docs/<topic>`
2. Capture evidence using standardized templates
3. Commit evidence files with clear commit messages
4. Open PR with evidence summary
5. Merge after CI passes (or with bypass approval for docs-only)

**Exceptions:**
- Emergency hotfix evidence may be committed directly with immediate follow-up PR
- Must document bypass reason in commit message

---

### Rule 2: Evidence Timestamps

All evidence documents MUST include:
- ISO 8601 timestamp (UTC): `2026-01-13T14:38:53Z`
- Environment URL
- Deployed SHA
- Operator name/role

---

### Rule 3: Evidence Immutability

Once evidence is merged:
- Do NOT edit past timestamps or results
- Append new evidence sections with new timestamps
- Mark obsolete sections with `[OBSOLETE]` prefix

---

## Branch Protection Recommendations

### Current State

| Setting | Value | Notes |
|---------|-------|-------|
| Require PR before merge | ❌ Not enforced | Docs bypass allowed |
| Require status checks | ⚠️ Partial | Some checks skippable |
| Require linear history | ❌ No | Squash merges used |
| Restrict pushes | ❌ No | Admins can push |

### Proposed Changes

| Setting | Proposed | Rationale |
|---------|----------|-----------|
| Require PR for `docs/operations/*` | ✅ Yes | Evidence audit trail |
| Require at least 1 approval | ✅ Yes | Peer review |
| Dismiss stale reviews on push | ✅ Yes | Prevent outdated approvals |
| Include administrators | ⚠️ Consider | Prevent admin bypass |

### Implementation

To enable branch protection for evidence files:

```bash
# Using GitHub CLI
gh api repos/{owner}/{repo}/rulesets -X POST -f name="evidence-protection" \
  -f target="branch" \
  -f enforcement="active" \
  -f conditions='{"ref_name":{"include":["~DEFAULT_BRANCH"]}}' \
  -f rules='[{"type":"pull_request","parameters":{"required_approving_review_count":1}}]' \
  -f bypass_actors='[]'
```

Or via GitHub UI:
1. Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. ☑️ Require a pull request before merging
4. ☑️ Require approvals (1)
5. Save changes

---

## Release Process

### Pre-Release Checklist

- [ ] All PRs merged via squash
- [ ] CI green on main
- [ ] Staging verification passed
- [ ] Evidence captured in `docs/operations/`
- [ ] RELEASE_CLOSEOUT.md updated

### Post-Release Checklist

- [ ] Production deployment triggered
- [ ] Production spot check completed
- [ ] Evidence pack updated (via PR)
- [ ] Outstanding items documented

---

## Document Templates

### Spot Check Template

```markdown
# [Environment] Spot Check

**Timestamp:** [ISO 8601]
**Operator:** [Name]
**SHA:** [Deployed SHA]

## Checks

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| /readyz | 200 | | |
| PDF Proxy | 401 | | |
| ... | | | |
```

### Evidence Pack Update Template

```markdown
## [Date] Update

**SHA:** [New SHA]
**Changes:** [Brief description]

### Verification

| Check | Result |
|-------|--------|
| ... | |
```

---

## Escalation Path

| Severity | Action | Contact |
|----------|--------|---------|
| P0 - Production down | Immediate hotfix, bypass allowed | On-call |
| P1 - Feature broken | Same-day PR | Engineering lead |
| P2 - Documentation | Next business day | Release Governor |

---

## Compliance Notes

- All evidence files are retained in git history
- PRs provide merge author and timestamp
- CI runs provide automated verification records
- Spot checks provide point-in-time state capture

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `DEPLOYMENT_FLYWHEEL_EVIDENCE_PACK.md` | Current release evidence |
| `PRODUCTION_SPOT_CHECK.md` | Production verification |
| `RELEASE_CLOSEOUT.md` | Release summary |
| `PERFORMANCE_BUDGETS.md` | Performance thresholds |
