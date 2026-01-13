# Cadence Baseline Runs

## Date: 2026-01-13
## Purpose: Initial baseline execution of all cadence workflows after production stabilization

---

## Summary

| Workflow | Run ID | Status | Duration | URL |
|----------|--------|--------|----------|-----|
| Drift Detection (Daily) | 20971121067 | ✅ Success | ~45s | [View Run](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971121067) |
| Evaluation Harness (Weekly) | 20971122892 | ✅ Success | ~42s | [View Run](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971122892) |
| Feedback Scorecards (Cadence) | 20971124607 | ✅ Success | ~38s | [View Run](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971124607) |

---

## Workflow Details

### 1. Drift Detection (Daily)

**Workflow:** `drift-daily.yml`
**Schedule:** Daily at 6:00 AM UTC
**Baseline Run ID:** `20971121067`
**Run URL:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971121067
**Conclusion:** ✅ Success

**Configuration:**
- Environment: `local`
- Create Baseline: `false`

**Purpose:** Detects accuracy degradation by comparing current metrics against baseline. Alerts on critical drift.

**Expected Artifacts:**
- `drift-report-{run_id}` containing `scripts/drift/reports/latest.json`

---

### 2. Evaluation Harness (Weekly)

**Workflow:** `eval-weekly.yml`
**Schedule:** Weekly on Sunday at 7:00 AM UTC
**Baseline Run ID:** `20971122892`
**Run URL:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971122892
**Conclusion:** ✅ Success

**Configuration:**
- Mode: `fixtures`
- Compare Run: (none - baseline)

**Purpose:** Measures accuracy metrics using evaluation fixtures. Tracks trends over time.

**Metrics Tracked:**
- Selection Accuracy
- Critical Field Accuracy
- Fusion Agreement Rate
- Pass-2 Rate
- Overall Score

**Expected Artifacts:**
- `eval-report-{run_id}` containing `scripts/eval/reports/latest.json`

---

### 3. Feedback Scorecards (Cadence)

**Workflow:** `scorecards-cadence.yml`
**Schedule:** Weekly on Sunday at 8:00 AM UTC, Monthly on 1st at 8:00 AM UTC
**Baseline Run ID:** `20971124607`
**Run URL:** https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20971124607
**Conclusion:** ✅ Success

**Configuration:**
- Period: `weekly`
- Redact PII: `true`
- Export Format: `json`

**Purpose:** Generates scorecards and fix packs for engineers, customers, and templates.

**Metrics Tracked:**
- Engineer Scorecards
- Customer Scorecards
- Template Scorecards
- Fix Pack Issues
- Critical Issues

**Expected Artifacts:**
- `feedback-{period}-{run_id}` containing `scripts/feedback/reports/`

---

## Cadence Schedule Overview

| Workflow | Frequency | Time (UTC) | Next Scheduled Run |
|----------|-----------|------------|-------------------|
| Drift Detection | Daily | 06:00 | 2026-01-14 06:00 |
| Evaluation Harness | Weekly (Sunday) | 07:00 | 2026-01-19 07:00 |
| Feedback Scorecards | Weekly (Sunday) | 08:00 | 2026-01-19 08:00 |
| Feedback Scorecards | Monthly (1st) | 08:00 | 2026-02-01 08:00 |

---

## Baseline Metrics (To Be Captured)

### Drift Detection Baseline
- **Baseline Created:** No (first run comparison baseline)
- **Critical Alerts:** TBD (check artifact)
- **Metrics Captured:** TBD (check artifact)

### Evaluation Harness Baseline
- **Selection Accuracy:** TBD (check artifact)
- **Critical Field Accuracy:** TBD (check artifact)
- **Fusion Agreement:** TBD (check artifact)
- **Pass-2 Rate:** TBD (check artifact)
- **Overall Score:** TBD (check artifact)

### Feedback Scorecards Baseline
- **Total Engineers:** TBD (check artifact)
- **Total Customers:** TBD (check artifact)
- **Total Templates:** TBD (check artifact)
- **Fix Pack Issues:** TBD (check artifact)
- **Critical Issues:** TBD (check artifact)

---

## Operational Notes

1. **Manual Trigger:** All cadence workflows support `workflow_dispatch` for ad-hoc runs.
2. **PII Redaction:** Feedback scorecards redact PII by default (`redact_pii: true`).
3. **Artifact Retention:** All reports are retained for 30-90 days.
4. **Alert Thresholds:**
   - Drift: Critical alerts trigger warnings
   - Evaluation: Score below 80% triggers warnings
   - Scorecards: Critical issues > 0 triggers warnings

---

## Evidence Timestamp

- **Triggered:** 2026-01-13T20:14:11Z
- **Completed:** 2026-01-13T20:15:20Z (approx)
- **Triggered By:** Manual workflow_dispatch
- **Branch:** main
