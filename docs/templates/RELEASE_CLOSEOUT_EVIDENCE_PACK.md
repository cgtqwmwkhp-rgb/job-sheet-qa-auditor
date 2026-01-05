# Release Closeout Evidence Pack

> **Template Version:** 2.0.0  
> **Last Updated:** 2026-01-05  
> **Governance:** This template is validated by `scripts/release/validate-evidence-pack.sh`

---

## Document Metadata

| Field | Value |
|-------|-------|
| **Release Version** | <!-- REQUIRED: e.g., v1.2.3 --> |
| **Release Date** | <!-- REQUIRED: YYYY-MM-DD --> |
| **Git SHA** | <!-- REQUIRED: Full 40-char SHA --> |
| **Environment** | <!-- REQUIRED: sandbox / staging / production --> |
| **Prepared By** | <!-- REQUIRED: Name or @handle --> |
| **Reviewed By** | <!-- REQUIRED: Name or @handle --> |

---

## 1. Pre-Release Verification

### 1.1 CI Pipeline Status

| Check | Status | Run ID | Notes |
|-------|--------|--------|-------|
| TypeScript Check | <!-- ✅ PASS / ❌ FAIL --> | <!-- GitHub Actions Run ID --> | |
| Lint Check | <!-- ✅ PASS / ❌ FAIL --> | <!-- GitHub Actions Run ID --> | |
| Unit & Integration Tests | <!-- ✅ PASS / ❌ FAIL --> | <!-- GitHub Actions Run ID --> | |
| E2E Tests | <!-- ✅ PASS / ❌ FAIL --> | <!-- GitHub Actions Run ID --> | |
| Load Test (Smoke) | <!-- ✅ PASS / ❌ FAIL --> | <!-- GitHub Actions Run ID --> | |

### 1.2 Parity Verification

| Suite | Status | Documents | Fields | Violations |
|-------|--------|-----------|--------|------------|
| Positive Suite | <!-- ✅ PASS / ❌ FAIL --> | <!-- e.g., 3 same, 0 worse --> | <!-- e.g., 21 same --> | <!-- 0 or list --> |
| Negative Suite | <!-- ✅ PASS / ❌ FAIL --> | <!-- e.g., 6 passed --> | <!-- e.g., 8/8 matched --> | <!-- 0 or list --> |

**Parity Report Location:** `parity/reports/latest.json`

### 1.3 Policy Compliance

| Policy | Status | Evidence |
|--------|--------|----------|
| Required Files Present | <!-- ✅ PASS / ❌ FAIL --> | <!-- Policy Check job --> |
| No Secrets in Repo | <!-- ✅ PASS / ❌ FAIL --> | <!-- Secret scanning --> |
| ADR-003 Compliant | <!-- ✅ PASS / ❌ FAIL --> | <!-- HEALTH_ONLY usage --> |

---

## 2. Deployment Verification

### 2.1 Smoke Check Results

| Endpoint | Status | HTTP Code | Response Time |
|----------|--------|-----------|---------------|
| GET / | <!-- ✅ PASS / ❌ FAIL --> | <!-- e.g., 200 --> | <!-- e.g., 150ms --> |
| GET /api/trpc/system.health | <!-- ✅ PASS / ❌ FAIL --> | <!-- e.g., 200 --> | <!-- e.g., 50ms --> |
| GET /api/trpc/system.version | <!-- ✅ PASS / ❌ FAIL --> | <!-- e.g., 200 --> | <!-- e.g., 30ms --> |

**Deployed SHA:** <!-- REQUIRED: Must match Git SHA above -->

**SHA Verification:** <!-- ✅ MATCH / ❌ MISMATCH -->

### 2.2 Monitoring Snapshot

| Metric | Status | Evidence |
|--------|--------|----------|
| Metrics Endpoint | <!-- CAPTURED / NOT_AVAILABLE --> | <!-- logs/release/monitoring/metrics.txt --> |
| Health Sample | <!-- CAPTURED / FAIL --> | <!-- logs/release/monitoring/health_sample.json --> |
| Evidence Type | <!-- METRICS / HEALTH_ONLY --> | <!-- Per ADR-003 --> |

**ADR-003 Mode:** <!-- HEALTH_ONLY=true (sandbox only) / HEALTH_ONLY=false (required for prod/staging) -->

---

## 3. Parity Triage (If Applicable)

> Complete this section only if parity checks showed any warnings or failures.

### 3.1 Triage Classification

| Classification | Description |
|----------------|-------------|
| <!-- REGRESSION / THRESHOLD_DRIFT / EXPECTED_CHANGE --> | <!-- Brief explanation --> |

### 3.2 Triage Details

| Document | Field | Expected | Actual | Classification | Risk |
|----------|-------|----------|--------|----------------|------|
| <!-- doc-001 --> | <!-- fieldName --> | <!-- value --> | <!-- value --> | <!-- REGRESSION / etc --> | <!-- LOW / MEDIUM / HIGH --> |

### 3.3 Triage Decision

**Decision:** <!-- GO / NO-GO / GO_WITH_FOLLOW_UP -->

**Rationale:** <!-- Explain why this decision was made -->

**Follow-up Required:** <!-- Yes / No -->

**Follow-up Ticket:** <!-- Link to ticket if applicable -->

---

## 4. Production Readiness Checklist

> All items must be checked for production releases.

### 4.1 Configuration

- [ ] `ENABLE_PURGE_EXECUTION=false` (read-only posture)
- [ ] `ENABLE_SCHEDULER=false` (no automated jobs)
- [ ] Database connection verified
- [ ] External API keys configured (if applicable)

### 4.2 Security

- [ ] No secrets committed to repository
- [ ] Secret scanning passed
- [ ] SAST (CodeQL) passed or findings addressed
- [ ] Dependency scanning passed or findings addressed

### 4.3 Observability

- [ ] Health endpoint responding
- [ ] Version endpoint returning correct SHA
- [ ] Metrics endpoint available (production/staging) OR ADR-003 acknowledged (sandbox)
- [ ] Alerting configured (if applicable)

### 4.4 Rollback Plan

- [ ] Previous version identified: <!-- e.g., v1.2.2 / SHA -->
- [ ] Rollback procedure documented
- [ ] Database migration reversible (if applicable)

---

## 5. Sign-Off

### 5.1 Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Release Engineer | <!-- Name --> | <!-- YYYY-MM-DD --> | <!-- ✅ Approved --> |
| QA Lead | <!-- Name --> | <!-- YYYY-MM-DD --> | <!-- ✅ Approved --> |
| Tech Lead | <!-- Name --> | <!-- YYYY-MM-DD --> | <!-- ✅ Approved --> |

### 5.2 Final Status

**Release Status:** <!-- ✅ APPROVED / ❌ REJECTED / ⚠️ APPROVED_WITH_CONDITIONS -->

**Conditions (if applicable):** <!-- List any conditions for approval -->

---

## 6. Artifacts

| Artifact | Location | Retention |
|----------|----------|-----------|
| CI Run Logs | <!-- GitHub Actions URL --> | 30 days |
| Parity Report | `parity/reports/latest.json` | Permanent |
| Smoke Check Logs | `logs/release/smoke/` | 30 days |
| Monitoring Snapshot | `logs/release/monitoring/` | 30 days |
| Deployment Bundle | <!-- Artifact URL --> | 90 days |

---

## 7. Post-Release Notes

<!-- Add any post-release observations, issues, or follow-up items here -->

---

**Template Validation:**

This document should be validated using:
```bash
./scripts/release/validate-evidence-pack.sh <path-to-this-file>
```

Required sections for validation:
- Document Metadata (all fields populated)
- Pre-Release Verification (CI and Parity)
- Deployment Verification (Smoke and Monitoring)
- Sign-Off (at least one approval)
