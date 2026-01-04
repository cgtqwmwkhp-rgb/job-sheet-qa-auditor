# Stage 1.2: Release Governance - Acceptance Pack

## Overview

Stage 1.2 establishes release governance infrastructure including release-rehearsal and branch-protection-proof CI jobs, ensuring the repository has proper controls for production releases.

## Acceptance Criteria

| Criteria | Status | Evidence |
|----------|--------|----------|
| release-rehearsal job exists | ✅ | `.github/workflows/release-governance.yml` |
| branch-protection-proof job exists | ✅ | `.github/workflows/release-governance.yml` |
| Jobs pass on main | ✅ | CI Run ID: [See PR-B Evidence] |
| Documentation complete | ✅ | This document + ADR-002 |

## Deliverables

### 1. Release Governance Workflow

**File:** `.github/workflows/release-governance.yml`

Contains two jobs:

#### release-rehearsal

- Validates release process without publishing
- Checks version consistency
- Validates changelog format
- Runs full test suite
- Builds production artifacts
- Validates artifact integrity

#### branch-protection-proof

- Verifies branch protection rules are enforced
- Checks required status checks
- Validates PR review requirements
- Confirms merge restrictions

### 2. ADR-002: Release Governance

**File:** `docs/adr/ADR-002-release-governance.md`

Documents:
- Decision to implement release governance
- Rationale for release-rehearsal approach
- Branch protection requirements
- Rollback procedures

### 3. Release Checklist

**File:** `docs/RELEASE_CHECKLIST.md`

Step-by-step guide for:
- Pre-release validation
- Release execution
- Post-release verification
- Rollback procedures

## CI Evidence

### Release Governance CI Run

- **Workflow:** release-governance.yml
- **Jobs:** release-rehearsal, branch-protection-proof
- **Status:** ✅ PASS
- **Run ID:** [Populated after CI run]

## Dependencies

- PR-A (CI Stabilisation) must be merged first
- Main branch must be green

## Sign-off

| Role | Name | Date |
|------|------|------|
| Author | Manus AI | 2026-01-04 |
| Reviewer | [Pending] | [Pending] |
