# Next Release Backlog

## Governed Enhancement PR Plans

**Created**: 2026-01-11  
**Head SHA**: `3b0c06b58564652180636a74f86a2c062bfcb446`  
**Created By**: Cursor (Release Governor + Senior Architect)

---

## Recommended Order

1. **PR-Next-1**: Fix Flaky E2E Test (blocking PR gate stability)
2. **PR-Next-2**: Template Scaling Batch Execution (feature expansion)
3. **PR-Next-3**: Engineer Feedback MVP (operational insights)

---

## PR-Next-1: Fix Flaky E2E Test

### Summary

Fix the flaky E2E test (`Fixture files exist and are valid JSON`) that fails intermittently in CI due to fixture path resolution differences between local and CI environments. Keep functional E2E lane blocking; move visual regression to nightly-only.

### Scope

#### IN Scope

- Fix `e2e/sandbox-smoke.spec.ts:162` fixture path resolution
- Ensure CI and local environments resolve fixture paths consistently
- Keep functional E2E tests as blocking PR gate
- Move visual regression tests to nightly workflow (non-blocking for PRs)
- Add retry logic for transient network issues (if applicable)
- Document E2E test structure and path conventions

#### OUT of Scope

- Adding new E2E tests
- Changing functional test behavior
- Modifying visual regression baselines
- UI changes

### Allowed Touched Files

```
e2e/sandbox-smoke.spec.ts
e2e/fixtures/                     (path resolution only)
playwright.config.ts              (test project configuration)
.github/workflows/ci.yml          (E2E job configuration)
.github/workflows/visual-nightly.yml  (new: visual regression nightly)
docs/testing/E2E_GUIDE.md         (new: documentation)
```

### Stop Conditions

1. ❌ If fix requires changing fixture content (not path resolution)
2. ❌ If fix requires disabling the flaky test entirely
3. ❌ If fix causes other E2E tests to fail
4. ❌ If functional E2E lane becomes non-blocking

### Evidence Required

| Evidence | Type | Gate |
|----------|------|------|
| E2E tests pass locally | Command output | Blocking |
| E2E tests pass in CI (3 consecutive runs) | CI run URLs | Blocking |
| Visual regression moved to nightly | Workflow file diff | Informational |
| Documentation updated | File exists | Informational |

### Verification Commands

```bash
# Local verification
pnpm test:e2e --project=chromium

# CI verification (after PR merge)
gh run list --workflow=ci.yml --branch main --limit 3
```

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path fix doesn't work in all CI runners | Medium | High | Test on ubuntu-latest and macos-latest |
| Moving visual to nightly masks regressions | Low | Medium | Ensure nightly failures trigger alerts |
| Retry logic masks real failures | Low | High | Cap retries at 2, log retry attempts |

### Branch Name

`ai/fix-flaky-e2e-fixture-test`

---

## PR-Next-2: Template Scaling Batch Execution

### Summary

Add the next 10 templates to the template registry with proper collision detection and ambiguity governance. Implement batch execution plan with phased rollout and signal weight tuning per template category.

### Scope

#### IN Scope

- Add 10 new template definitions to registry
- Implement collision detection between similar templates
- Add ambiguity thresholds per template category
- Update multi-signal selection weights based on template category
- Add template-specific field calibration rules
- Create template batch execution framework
- Add regression tests for each new template

#### OUT of Scope

- UI changes for template management
- Template editor modifications
- Production deployment of new templates (staging verification first)
- Changes to core extraction pipeline
- Changes to existing template definitions

### Allowed Touched Files

```
server/services/templateRegistry/
  - templates/                    (new template definitions)
  - registryService.ts            (template loading)
  - collisionDetector.ts          (new: collision detection)
  - categoryWeights.ts            (new: category-specific weights)
server/services/templateSelector/
  - selectorService.ts            (ambiguity thresholds)
  - signalExtractors.ts           (weight tuning)
server/services/extraction/
  - fieldCalibration.ts           (template-specific rules)
server/tests/contracts/
  - templateScaling.contract.test.ts     (new)
  - collisionDetection.contract.test.ts  (new)
parity/fixtures/
  - golden-positive.json          (new template golden data)
  - golden-negative.json          (new template golden data)
docs/templates/
  - TEMPLATE_CATALOG.md           (new: template documentation)
  - COLLISION_GOVERNANCE.md       (new: collision rules)
```

### Stop Conditions

1. ❌ If any new template causes collision with existing template
2. ❌ If ambiguity rate for batch exceeds 20% on test corpus
3. ❌ If parity subset gate fails after template addition
4. ❌ If any existing template behavior changes

### Evidence Required

| Evidence | Type | Gate |
|----------|------|------|
| All 10 templates pass golden dataset validation | Test output | Blocking |
| Collision detection reports clean | Script output | Blocking |
| Parity subset passes | CI run URL | Blocking |
| Ambiguity rate < 20% on test corpus | Report | Blocking |
| Template catalog documented | File exists | Informational |

### Phased Rollout

| Phase | Templates | Verification |
|-------|-----------|--------------|
| 1 | Templates 1-3 (invoices) | Staging smoke |
| 2 | Templates 4-6 (service reports) | Staging smoke |
| 3 | Templates 7-10 (mixed) | Full staging validation |

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template collision undetected | Medium | High | Mandatory collision check before merge |
| Weight tuning destabilizes selection | Medium | High | A/B comparison on staging |
| Golden dataset bloat | Low | Medium | Compress and index golden data |
| Ambiguity spike in production | Medium | High | Phased rollout with monitoring |

### Branch Name

`ai/template-scaling-batch-10`

---

## PR-Next-3: Engineer Feedback MVP

### Summary

Implement weekly scorecards and fix packs for engineer feedback, with breakdowns by engineer, customer, asset type, and template. Provide actionable insights for quality improvement.

### Scope

#### IN Scope

- Weekly scorecard generation per engineer
- Fix pack generation for engineers with issues
- Aggregation by customer, asset type, template ID
- Scorecard storage and retrieval API
- Basic email/notification integration (optional)
- Dashboard widget for scorecard summary
- Export functionality (CSV/JSON)

#### OUT of Scope

- Real-time scoring (batch only)
- Engineer performance ratings or rankings
- Customer-facing reports
- Integration with HR systems
- Automated remediation actions

### Allowed Touched Files

```
server/services/feedback/
  - engineerFeedback.ts           (existing, extend)
  - weeklyScorecard.ts            (new: scorecard generation)
  - fixPackGenerator.ts           (new: fix pack logic)
  - aggregationService.ts         (new: breakdowns)
server/services/jobs/
  - feedbackJobs.ts               (extend weekly job)
server/routes/
  - feedbackRouter.ts             (API endpoints)
client/src/components/
  - EngineerScorecard.tsx         (new: dashboard widget)
  - FixPackViewer.tsx             (new: fix pack display)
client/src/pages/
  - FeedbackDashboard.tsx         (new: feedback page)
server/tests/contracts/
  - engineerScorecard.contract.test.ts   (new)
  - fixPackGenerator.contract.test.ts    (new)
docs/feedback/
  - SCORECARD_SPEC.md             (new: scorecard format)
  - FIX_PACK_GUIDE.md             (new: fix pack usage)
```

### Stop Conditions

1. ❌ If scorecard generation exceeds 60s for 1000 audits
2. ❌ If any PII exposed in scorecard output
3. ❌ If UI changes affect existing dashboard layout
4. ❌ If feedback job fails to complete within nightly window

### Evidence Required

| Evidence | Type | Gate |
|----------|------|------|
| Scorecard generates correctly for test data | Test output | Blocking |
| Fix pack contains actionable items | Sample output | Blocking |
| No PII in scorecard output | PII check script | Blocking |
| Performance < 60s for 1000 audits | Benchmark | Blocking |
| Dashboard widget renders correctly | Screenshot | Informational |
| Export works (CSV/JSON) | Sample files | Informational |

### Data Model

```typescript
interface EngineerScorecard {
  engineerId: string;
  period: 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
  totalAudits: number;
  validRate: number;
  issueBreakdown: {
    byCustomer: Record<string, number>;
    byAssetType: Record<string, number>;
    byTemplateId: Record<string, number>;
    bySeverity: Record<'S0' | 'S1' | 'S2' | 'S3', number>;
  };
  trends: {
    validRateChange: number;
    volumeChange: number;
  };
}

interface FixPack {
  engineerId: string;
  period: 'weekly' | 'monthly';
  issues: Array<{
    auditId: string;
    field: string;
    issue: string;
    severity: string;
    suggestedFix: string;
  }>;
  trainingRecommendations: string[];
}
```

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PII leakage in scorecards | Medium | Critical | PII check in CI gate |
| Performance degradation with scale | Medium | High | Index by engineerId, pagination |
| Engineer pushback on visibility | Low | Medium | Opt-in initially, clear communication |
| Data accuracy issues | Medium | Medium | Reconciliation with source audits |

### Branch Name

`ai/engineer-feedback-mvp`

---

## Summary Table

| PR | Priority | Complexity | Est. Duration | Dependencies |
|----|----------|------------|---------------|--------------|
| PR-Next-1 | High | Low | 1-2 days | None |
| PR-Next-2 | Medium | High | 5-7 days | PR-Next-1 (stable CI) |
| PR-Next-3 | Medium | Medium | 3-5 days | None |

---

## Next Actions

1. Create branch `ai/fix-flaky-e2e-fixture-test` and implement PR-Next-1
2. After PR-Next-1 merged and CI stable, create `ai/template-scaling-batch-10`
3. PR-Next-3 can proceed in parallel with PR-Next-2

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-11
