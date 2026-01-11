# Cadence Workflows Summary

**Version:** 1.1.0  
**Date:** 2026-01-11  
**Status:** ✅ All workflows verified and operational

---

## Overview

Three scheduled workflows operationalize the accuracy flywheel cadence:

| Workflow | Purpose | Schedule | Status |
|----------|---------|----------|--------|
| **Drift Detection** | Detect accuracy degradation | Daily 6:00 AM UTC | ✅ Operational |
| **Evaluation Harness** | Measure accuracy metrics | Weekly Sun 7:00 AM UTC | ✅ Operational |
| **Feedback Scorecards** | Generate scorecards + fix packs | Weekly + Monthly | ✅ Operational |

---

## 1. Drift Detection (Daily)

**File:** `.github/workflows/drift-daily.yml`  
**Workflow ID:** 222558385

### Schedule
```yaml
schedule:
  - cron: '0 6 * * *'  # 6:00 AM UTC daily
```

### Manual Trigger
```bash
gh workflow run drift-daily.yml --ref main \
  -f create_baseline=false \
  -f environment=local
```

### First Successful Run
| Field | Value |
|-------|-------|
| **Run ID** | 20895863625 |
| **Status** | ✅ SUCCESS |
| **URL** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20895863625 |
| **Triggered** | 2026-01-11T13:23:42Z |

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `create_baseline` | boolean | false | Create new baseline from current metrics |
| `environment` | choice | local | Target environment (local/staging/production) |

### Outputs
- `scripts/drift/reports/latest.json` - Drift report artifact
- GitHub Actions job summary with alerts
- Slack notification (if configured)

---

## 2. Evaluation Harness (Weekly)

**File:** `.github/workflows/eval-weekly.yml`  
**Workflow ID:** 222558386

### Schedule
```yaml
schedule:
  - cron: '0 7 * * 0'  # 7:00 AM UTC every Sunday
```

### Manual Trigger
```bash
gh workflow run eval-weekly.yml --ref main \
  -f run_full_suite=false \
  -f environment=local
```

### First Successful Run
| Field | Value |
|-------|-------|
| **Run ID** | 20895863875 |
| **Status** | ✅ SUCCESS |
| **URL** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20895863875 |
| **Triggered** | 2026-01-11T13:23:43Z |

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `run_full_suite` | boolean | false | Run full evaluation suite |
| `environment` | choice | local | Target environment |

### Outputs
- `scripts/eval/reports/eval_report.json` - Evaluation report artifact
- Trend deltas from previous run
- GitHub Actions job summary

---

## 3. Feedback Scorecards (Cadence)

**File:** `.github/workflows/scorecards-cadence.yml`  
**Workflow ID:** 222558387

### Schedule
```yaml
schedule:
  - cron: '0 8 * * 1'   # Weekly: 8:00 AM UTC every Monday
  - cron: '0 9 1 * *'   # Monthly: 9:00 AM UTC on 1st of month
```

### Manual Trigger
```bash
gh workflow run scorecards-cadence.yml --ref main \
  -f period=weekly \
  -f environment=local
```

### First Successful Run
| Field | Value |
|-------|-------|
| **Run ID** | 20895864270 |
| **Status** | ✅ SUCCESS |
| **URL** | https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20895864270 |
| **Triggered** | 2026-01-11T13:23:44Z |

### Inputs
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | choice | weekly | Scorecard period (weekly/monthly) |
| `environment` | choice | local | Target environment |

### Outputs
- Scorecards by engineer/customer/assetType/templateId
- Fix packs (redacted by default)
- GitHub Actions job summary

---

## Environment Gating

All workflows are environment-gated:

| Feature | Implementation |
|---------|----------------|
| **No secrets required for PR CI** | Workflows only run on `main` or via `workflow_dispatch` |
| **Environment selection** | Input parameter selects local/staging/production |
| **Artifact retention** | 30-90 days depending on workflow |
| **No global scheduler** | `ENABLE_SCHEDULER=false` is preserved |

---

## Monitoring

### Success Metrics

All workflows should complete with:
- Exit code 0
- Artifacts uploaded successfully
- Job summary generated

### Failure Alerts

Failures will:
- Mark workflow as failed (❌)
- Be visible in GitHub Actions tab
- Trigger notifications (if configured)

---

## PRs That Fixed Cadence Workflows

| PR | Description |
|----|-------------|
| #73 | Removed `--frozen-lockfile` to avoid patchedDependencies mismatch |
| #74 | Updated pnpm version from v9 to v10 to match lockfile |

---

## Runbook

### Re-run Failed Workflow
```bash
gh workflow run [workflow-file].yml --ref main
```

### View Latest Run
```bash
gh run list --workflow=[workflow-file].yml --limit 1
```

### Download Artifacts
```bash
gh run download [RUN_ID] --name [ARTIFACT_NAME]
```

---

**Document Status:** Complete with real evidence
