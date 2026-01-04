# Visual Regression Test Quarantine

## Status: QUARANTINED

**Date:** 2026-01-04
**Owner:** Platform Engineering
**Ticket:** N/A (governance decision)

## What Was Moved

The following test suites have been moved from blocking CI to a nightly workflow:

| Test File | Location | Reason |
|-----------|----------|--------|
| `components.visual.spec.ts` | `e2e/visual-regression/` | Screenshot comparison flaky in CI |
| `dashboard.visual.spec.ts` | `e2e/visual-regression/` | Screenshot comparison flaky in CI |
| `demo-gateway.visual.spec.ts` | `e2e/visual-regression/` | Screenshot comparison flaky in CI |
| `help-center.visual.spec.ts` | `e2e/visual-regression/` | Screenshot comparison flaky in CI |

## Why Quarantined

Visual regression tests using Playwright's `toHaveScreenshot()` are failing in CI due to:

1. **Font rendering differences** - CI runners use different font rendering than local development
2. **Anti-aliasing variations** - Sub-pixel rendering differs between environments
3. **Timing/animation issues** - Despite `animations: disabled`, some CSS transitions cause flakiness
4. **Baseline drift** - Snapshots generated locally don't match CI environment pixel-perfectly

These failures are **not functional regressions** - the application works correctly. The tests fail due to environmental differences in screenshot rendering.

## Current State

- **Blocking CI (`ci.yml`)**: Unit tests, TypeScript check, Lint, Functional E2E (no visual assertions)
- **Nightly CI (`ci-nightly.yml`)**: Visual regression tests with full artifact upload
- **On-demand**: Visual tests can be triggered manually via `workflow_dispatch`

## Artifacts Produced

The nightly workflow uploads:

- `visual-regression-results/` - Expected, actual, and diff images
- `visual-regression-report/` - HTML report with comparison viewer
- `visual-regression-summary.json` - Failure counts and top failing specs

## Re-enable Criteria

Visual regression tests will be re-enabled in blocking CI when:

1. **Stable rendering plan implemented**:
   - Docker-based CI with fixed font packages
   - OR baseline snapshots generated in CI environment
   - OR increased tolerance thresholds with documented rationale

2. **Flakiness below threshold**:
   - Less than 5% failure rate over 14 consecutive nightly runs
   - No false positives (failures without actual visual changes)

3. **Owner sign-off**:
   - Platform Engineering approves re-enablement
   - Documentation updated with new baseline process

## How to Run Locally

```bash
# Run visual regression tests
pnpm test:visual

# Update baseline snapshots
pnpm test:visual:update

# Run specific project
pnpm test:visual --project=desktop-chrome
```

## How to Trigger On-Demand

1. Go to Actions → "CI Nightly (Visual Regression)"
2. Click "Run workflow"
3. Select branch and run

## Related Files

- `.github/workflows/ci.yml` - Blocking CI (no visual tests)
- `.github/workflows/ci-nightly.yml` - Nightly visual regression
- `playwright.visual.config.ts` - Visual test configuration
- `e2e/visual-regression/` - Visual test specs and snapshots
