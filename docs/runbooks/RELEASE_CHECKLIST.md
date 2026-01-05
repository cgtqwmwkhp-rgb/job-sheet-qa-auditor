# Release Checklist

This checklist MUST be completed before every production release.

## Pre-Release

- [ ] All required PRs merged to `main`
- [ ] `main` branch CI is green (all checks passing)
- [ ] Release branch created from `main` (e.g., `release/v1.2.3`)
- [ ] Release notes drafted

## Deployment

- [ ] Production promotion workflow triggered
- [ ] Production promotion workflow completes successfully

## Post-Release (First 60 minutes)

- [ ] **Smoke Test:** Run live smoke checks against production
  - [ ] `GET /` returns 200 OK
  - [ ] `GET /api/trpc/system.health` returns 200 OK
  - [ ] `GET /api/trpc/system.version` returns 200 OK and correct version
- [ ] **Monitoring:** Check monitoring for anomalies
  - [ ] No spike in 5xx errors
  - [ ] No spike in 4xx errors
  - [ ] Latency is within normal range
  - [ ] No new Sentry/error log alerts

## Release Verification Evidence Pack

- [ ] Create `RELEASE_VERIFICATION_EVIDENCE_PACK.md`
- [ ] **Identity:** Record `platform_version` and `git_sha`
- [ ] **CI Evidence:** Link to green CI run for the deployed SHA
- [ ] **Smoke Checklist:** Record pass/fail for all smoke checks
- [ ] **Monitoring Snapshot:** Record monitoring metrics
- [ ] **Rollback Plan:** Record previous SHA and rollback steps

## Communication

- [ ] Release notes published
- [ ] Internal team notified

---

**If any critical check fails, STOP and initiate rollback.**
