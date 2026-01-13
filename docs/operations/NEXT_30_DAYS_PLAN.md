# Next 30 Days Plan

**Date:** 2026-01-13  
**Status:** Active  
**Owner:** Product / Engineering

---

## Executive Summary

Following the successful resolution of PDF CORS, auth resilience, and performance issues (PR #102, #103), this plan outlines the next 30 days of focused work to deliver maximum value: **templates onboarding**, **weekly scorecards**, and **operational cadence**.

---

## Completed (This Sprint)

| Item | PR | Status |
|------|-----|--------|
| Lazy PDF loading | #102 | ✅ Merged |
| Auth resilience (no React crash) | #102 | ✅ Merged |
| Blob URL guard | #102 | ✅ Merged |
| Performance instrumentation | #102 | ✅ Merged |
| PDF proxy auth verification gate | #103 | ✅ Merged |
| Core workflow E2E smoke test | #103 | ✅ Merged |
| Performance budgets documentation | — | ✅ Complete |

---

## Week 1 (Jan 13-19): Templates Onboarding

### Goal
Enable users to create and manage Gold Standard templates for their specific job sheet formats.

### Tasks

| # | Task | Owner | Priority | Status |
|---|------|-------|----------|--------|
| 1.1 | Template creation UI wireframes | Product | P0 | Pending |
| 1.2 | Template CRUD API endpoints | Backend | P0 | Pending |
| 1.3 | Template field mapping UI | Frontend | P0 | Pending |
| 1.4 | Template activation/deactivation | Backend | P1 | Pending |
| 1.5 | Template import from existing job sheet | Backend | P1 | Pending |
| 1.6 | Template versioning (soft delete) | Backend | P2 | Pending |

### Success Criteria
- [ ] User can create a template from scratch
- [ ] User can activate/deactivate templates
- [ ] At least 3 templates created in production

---

## Week 2 (Jan 20-26): Weekly Scorecards Rollout

### Goal
Provide weekly performance scorecards showing pass rates, common issues, and technician performance.

### Tasks

| # | Task | Owner | Priority | Status |
|---|------|-------|----------|--------|
| 2.1 | Scorecard data model + API | Backend | P0 | Pending |
| 2.2 | Weekly aggregation job (scheduled) | Backend | P0 | Pending |
| 2.3 | Scorecard dashboard UI | Frontend | P0 | Pending |
| 2.4 | Email report generation | Backend | P1 | Pending |
| 2.5 | Scorecard export (PDF/CSV) | Frontend | P2 | Pending |

### Success Criteria
- [ ] Weekly scorecard generates automatically
- [ ] Dashboard shows last 4 weeks of data
- [ ] At least one user receives email scorecard

---

## Week 3 (Jan 27 - Feb 2): Drift Detection & Ops Cadence

### Goal
Establish operational monitoring for template drift and processing anomalies.

### Tasks

| # | Task | Owner | Priority | Status |
|---|------|-------|----------|--------|
| 3.1 | Drift detection algorithm | Backend | P0 | Pending |
| 3.2 | Anomaly alerting (Slack/email) | Ops | P0 | Pending |
| 3.3 | Weekly ops review runbook | Ops | P1 | Pending |
| 3.4 | Template usage analytics | Backend | P1 | Pending |
| 3.5 | Monthly performance review template | Product | P2 | Pending |

### Success Criteria
- [ ] Drift detection runs daily
- [ ] Alerts fire for >10% drift from baseline
- [ ] First weekly ops review completed

---

## Week 4 (Feb 3-9): Feedback Cadence & Iteration

### Goal
Establish user feedback loops and iterate on high-impact improvements.

### Tasks

| # | Task | Owner | Priority | Status |
|---|------|-------|----------|--------|
| 4.1 | User feedback collection mechanism | Product | P0 | Pending |
| 4.2 | Feedback triage process | Product | P1 | Pending |
| 4.3 | Top 3 feedback items addressed | Eng | P0 | Pending |
| 4.4 | Performance budget CI warnings | Eng | P1 | Pending |
| 4.5 | 30-day retrospective document | All | P1 | Pending |

### Success Criteria
- [ ] Feedback mechanism in production
- [ ] At least 10 feedback items collected
- [ ] 30-day retrospective completed

---

## Operational Cadence

### Daily
- [ ] Monitor `/readyz` and `/metrics` endpoints
- [ ] Check review queue size (<20 items)
- [ ] Verify no processing failures in last 24h

### Weekly
- [ ] Ops review meeting (30 min)
- [ ] Template drift report review
- [ ] Scorecard generation verification

### Monthly
- [ ] Performance budget review
- [ ] Template effectiveness analysis
- [ ] User feedback synthesis

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Template creation too complex | High | User testing before launch |
| Scorecard data accuracy | Medium | Automated validation tests |
| Drift detection false positives | Medium | Tunable thresholds |
| User adoption low | High | In-app onboarding tour |

---

## Constraints

1. **Production read-only**: Scheduler and purge remain OFF unless explicitly approved
2. **No security work**: Security changes require separate security review
3. **No platform integration work**: Azure AD changes require separate approval
4. **Evidence-led only**: All changes must include verification evidence

---

## Dependencies

| Dependency | Owner | Due Date |
|------------|-------|----------|
| Template design approval | Product | Jan 15 |
| Scorecard requirements | Product | Jan 19 |
| Ops runbook review | Ops Lead | Jan 27 |

---

## Stakeholder Sign-Off

| Stakeholder | Role | Approval |
|-------------|------|----------|
| Product Owner | Product | Pending |
| Engineering Lead | Engineering | Pending |
| Ops Lead | Operations | Pending |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-13 | AI Agent | Initial draft |
