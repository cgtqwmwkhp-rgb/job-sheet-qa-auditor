# Stage 1.3: CI Trigger Coverage + Policy Consistency Gate

## Overview

Stage 1.3 focuses on hardening CI trigger coverage and adding a policy consistency check as a blocking CI job.

## Prerequisites

| Prerequisite | Status | Evidence |
|--------------|--------|----------|
| PR-A: CI Stabilisation | ✅ Complete | [PR-A Evidence Pack](../evidence/PR-A-EVIDENCE-PACK.md) |
| PR-B: Stage 1.2 Governance | ✅ Complete | [Stage 1.2 Acceptance Pack](../evidence/STAGE1.2_ACCEPTANCE_PACK.md) |
| Main branch CI green | ✅ | Run ID: 20698292889 |
| release-rehearsal job passing | ✅ | Run ID: 20698364031 |
| branch-protection-proof job passing | ✅ | Run ID: 20698364031 |

## Objectives

### 1. CI Trigger Coverage Hardening

**Goal:** Ensure CI runs on all relevant branch patterns and events.

**Current State:**
- ✅ `main` branch (push + PR)
- ✅ `develop` branch (push + PR)
- ✅ `stage-*` branches (push + PR)
- ✅ `pr-*` branches (push + PR)

**Proposed Additions:**
- `feature/*` branches
- `fix/*` branches
- `hotfix/*` branches
- `release/*` branches

### 2. Policy Consistency Gate

**Goal:** Add a blocking CI job that validates policy files are consistent.

**Policies to Validate:**
- `.github/CODEOWNERS` matches team structure
- Branch protection rules documented
- Required status checks match CI jobs
- Security policy (SECURITY.md) exists
- Contributing guidelines (CONTRIBUTING.md) exist

### 3. CI Evidence Closeout

**Goal:** Ensure all CI runs produce audit-ready evidence.

**Evidence Requirements:**
- Job summaries with pass/fail status
- Artifact retention (30 days minimum)
- Correlation IDs for traceability
- Timestamp and SHA in all outputs

## Deliverables

| Deliverable | Description | Owner |
|-------------|-------------|-------|
| Updated ci.yml | Extended trigger patterns | TBD |
| policy-check.yml | New workflow for policy validation | TBD |
| CODEOWNERS | Team ownership file | TBD |
| SECURITY.md | Security policy | TBD |
| CONTRIBUTING.md | Contribution guidelines | TBD |
| Stage 1.3 Acceptance Pack | Evidence of completion | TBD |

## Implementation Plan

### Phase 1: CI Trigger Extension

1. Update `.github/workflows/ci.yml` triggers
2. Add `feature/*`, `fix/*`, `hotfix/*`, `release/*` patterns
3. Verify with test branches

### Phase 2: Policy Consistency Check

1. Create `.github/workflows/policy-check.yml`
2. Implement CODEOWNERS validation
3. Implement security policy check
4. Implement contributing guidelines check
5. Add as required status check

### Phase 3: Documentation

1. Create CODEOWNERS file
2. Create SECURITY.md
3. Create CONTRIBUTING.md
4. Update CI documentation

### Phase 4: Evidence Closeout

1. Run full CI suite on main
2. Collect evidence artifacts
3. Create Stage 1.3 Acceptance Pack

## Acceptance Criteria

| Criteria | Verification Method |
|----------|---------------------|
| CI triggers on all branch patterns | Create test branches, verify CI runs |
| Policy check job exists | Workflow file present |
| Policy check is blocking | Required status check configured |
| CODEOWNERS exists | File present in repo |
| SECURITY.md exists | File present in repo |
| CONTRIBUTING.md exists | File present in repo |
| All CI jobs pass on main | CI run evidence |

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 | 1 day | None |
| Phase 2 | 2 days | Phase 1 |
| Phase 3 | 1 day | Phase 2 |
| Phase 4 | 1 day | Phase 3 |

**Total:** 5 days

## Risks

| Risk | Mitigation |
|------|------------|
| Policy check too strict | Start with warnings, escalate to errors |
| Branch patterns too broad | Monitor CI usage, adjust as needed |
| CODEOWNERS conflicts | Review with team before implementing |

## Sign-off

| Role | Name | Date |
|------|------|------|
| Author | Manus AI | 2026-01-04 |
| Approver | [Pending] | [Pending] |
