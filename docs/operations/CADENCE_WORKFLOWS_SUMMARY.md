# Cadence Workflows Summary

**Version:** 1.0.0  
**Date:** 2026-01-11  
**SHA:** c909e29497bebe5c3e5a99636bf52a0f9f4f65b9

---

## Overview

Three scheduled workflows operationalise the accuracy flywheel without requiring the global scheduler (`ENABLE_SCHEDULER=false`).

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| Drift Detection | Daily 6:00 AM UTC | Detect accuracy degradation |
| Evaluation Harness | Weekly Sunday 7:00 AM UTC | Measure accuracy metrics |
| Feedback Scorecards | Weekly Sunday 8:00 AM UTC + Monthly 1st 8:00 AM UTC | Generate scorecards & fix packs |

---

## 1. Drift Detection (Daily)

### Workflow File

`.github/workflows/drift-daily.yml`

### Schedule

```yaml
schedule:
  - cron: '0 6 * * *'  # 6:00 AM UTC daily
```

### Manual Trigger

```bash
gh workflow run drift-daily.yml \
  -f create_baseline=false \
  -f environment=local
```

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `create_baseline` | boolean | false | Create new baseline from current metrics |
| `environment` | choice | local | Target environment (local/staging/production) |

### Outputs

| Artifact | Retention | Location |
|----------|-----------|----------|
| `drift-report-{run_id}` | 30 days | `scripts/drift/reports/latest.json` |

### First Run URL

```
[INSERT_FIRST_RUN_URL_HERE]
```

### Sample Output

```json
{
  "runId": "drift-xxx",
  "timestamp": "2026-01-11T06:00:00Z",
  "currentMetrics": {
    "ambiguityRate": 0.05,
    "tokenCollisionRate": 0.02,
    "selectionAccuracy": 0.95
  },
  "alerts": [],
  "summary": {
    "totalAlerts": 0,
    "criticalAlerts": 0
  }
}
```

---

## 2. Evaluation Harness (Weekly)

### Workflow File

`.github/workflows/eval-weekly.yml`

### Schedule

```yaml
schedule:
  - cron: '0 7 * * 0'  # 7:00 AM UTC on Sundays
```

### Manual Trigger

```bash
gh workflow run eval-weekly.yml \
  -f mode=fixtures \
  -f compare_run=
```

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | choice | fixtures | Evaluation mode (fixtures/full/quick) |
| `compare_run` | string | (empty) | Previous run ID to compare against |

### Outputs

| Artifact | Retention | Location |
|----------|-----------|----------|
| `eval-report-{run_id}` | 90 days | `scripts/eval/reports/latest.json` |

### First Run URL

```
[INSERT_FIRST_RUN_URL_HERE]
```

### Sample Output

```json
{
  "runId": "eval-xxx",
  "timestamp": "2026-01-12T07:00:00Z",
  "selectionMetrics": { "accuracy": 0.889 },
  "criticalFieldMetrics": { "criticalOnlyAccuracy": 0.891 },
  "fusionMetrics": { "agreementRate": 0.963 },
  "pass2Metrics": { "pass2Rate": 0.222 },
  "overallScore": 0.893,
  "trends": []
}
```

---

## 3. Feedback Scorecards (Weekly + Monthly)

### Workflow File

`.github/workflows/scorecards-cadence.yml`

### Schedules

```yaml
schedule:
  - cron: '0 8 * * 0'  # 8:00 AM UTC on Sundays (weekly)
  - cron: '0 8 1 * *'  # 8:00 AM UTC on 1st of month (monthly)
```

### Manual Trigger

```bash
# Weekly
gh workflow run scorecards-cadence.yml \
  -f period=weekly \
  -f redact_pii=true \
  -f export_format=json

# Monthly
gh workflow run scorecards-cadence.yml \
  -f period=monthly \
  -f redact_pii=true \
  -f export_format=json
```

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | choice | weekly | Report period (daily/weekly/monthly) |
| `redact_pii` | boolean | true | Redact PII in exports |
| `export_format` | choice | json | Export format (json/csv) |

### Outputs

| Artifact | Retention | Location |
|----------|-----------|----------|
| `feedback-{period}-{run_id}` | 90 days | `scripts/feedback/reports/` |

### First Run URL

```
[INSERT_FIRST_RUN_URL_HERE]
```

### Sample Output

```json
{
  "reportId": "report-xxx",
  "period": "weekly",
  "overall": {
    "totalDocuments": 450,
    "passRate": 0.92
  },
  "summary": {
    "totalEngineers": 3,
    "totalCustomers": 2,
    "totalFixPackIssues": 25,
    "criticalIssues": 3
  }
}
```

---

## 4. Environment Gating

All workflows are environment-gated and do NOT require secrets for PR CI:

| Workflow | Requires Secrets | PR Safe |
|----------|------------------|---------|
| drift-daily | ❌ No | ✅ Yes |
| eval-weekly | ❌ No | ✅ Yes |
| scorecards-cadence | ❌ No | ✅ Yes |

### How It Works

- Workflows run in "local" mode by default
- No external API calls unless explicitly configured
- All outputs are stored as artifacts
- No database writes in local mode

---

## 5. Monitoring Recommendations

### Daily

- Check drift alerts for critical issues
- Review escalation rate trends

### Weekly

- Review evaluation overall score
- Compare trends with previous week
- Review fix pack priorities

### Monthly

- Generate monthly scorecards
- Review engineer/customer performance trends
- Update baseline if metrics have improved

---

## 6. Trigger Commands

### Quick Reference

```bash
# Run all cadence workflows manually
gh workflow run drift-daily.yml
gh workflow run eval-weekly.yml
gh workflow run scorecards-cadence.yml -f period=weekly

# Create new drift baseline
gh workflow run drift-daily.yml -f create_baseline=true

# Run full evaluation
gh workflow run eval-weekly.yml -f mode=full

# Generate monthly scorecards
gh workflow run scorecards-cadence.yml -f period=monthly
```

---

## 7. Workflow Files Diff

```diff
+ .github/workflows/drift-daily.yml       (new)
+ .github/workflows/eval-weekly.yml       (new)
+ .github/workflows/scorecards-cadence.yml (new)
```

---

## 8. Sign-off

| Item | Status |
|------|--------|
| Workflows created | ✅ |
| Schedules configured | ✅ |
| Environment gating | ✅ |
| No secrets required for PR | ✅ |
| First manual run completed | [PENDING] |

---

**Document Status:** Complete - pending first manual workflow runs
