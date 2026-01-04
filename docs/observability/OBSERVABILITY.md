# Observability Guide

This document describes the observability features for monitoring parity and integrity.

## Metrics

### Parity Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `parity_pass_rate` | Gauge | Current parity pass rate percentage |
| `parity_total_fields` | Gauge | Total number of validated fields |
| `parity_passed_fields` | Gauge | Number of passed fields |
| `parity_failed_fields` | Gauge | Number of failed fields |
| `parity_threshold_violations_total` | Counter | Total threshold violations |
| `parity_runs_total` | Counter | Total parity runs |
| `parity_failures_total` | Counter | Total parity failures |
| `parity_pass_rate_by_severity` | Gauge | Pass rate by severity level |

### Integrity Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `integrity_mismatch_total` | Counter | Total integrity mismatches |
| `integrity_last_check_timestamp` | Info | Last integrity check time |

### Info Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `parity_dataset_info` | `hash`, `thresholds_version` | Dataset metadata |

## Alerts

### Critical Alerts

| Alert | Condition | Description |
|-------|-----------|-------------|
| `ParityFailureOnMain` | Parity fails on main | Immediate attention required |
| `CriticalSeverityFailures` | S0 < 100% | Critical fields failing |
| `IntegrityMismatchSpike` | >5 mismatches/hour | Possible data corruption |

### Warning Alerts

| Alert | Condition | Description |
|-------|-----------|-------------|
| `RepeatedThresholdViolations` | >3 violations/hour | Review thresholds |
| `ParityPassRateDrop` | Pass rate < 80% | Quality degradation |
| `DatasetHashChanged` | Hash changed | Verify intentional |
| `ParityRunsStalled` | No runs in 24h | Check CI pipeline |

## Dashboard

A Grafana dashboard template is provided at `scripts/monitoring/grafana-dashboard.json`.

### Panels

1. **Parity Pass Rate** - Current pass rate with color thresholds
2. **Total Parity Runs** - Counter of all runs
3. **Threshold Violations** - Violation counter with alerts
4. **Integrity Mismatches** - Mismatch counter
5. **Pass Rate Over Time** - Time series graph
6. **Pass Rate by Severity** - Bar chart by severity
7. **Field Status Distribution** - Pie chart of passed/failed
8. **Dataset Information** - Metadata display

## PII Safety

All metrics are validated for PII safety:

- No email addresses
- No phone numbers
- No SSN/tax IDs
- No credit card numbers
- No raw OCR content

The `validateMetricsSafety()` function checks for common PII patterns before emission.

## Integration

### Prometheus

Metrics are exposed in Prometheus exposition format:

```
# HELP parity_pass_rate Current parity pass rate percentage
# TYPE parity_pass_rate gauge
parity_pass_rate 85.5
```

### Grafana

Import the dashboard template:

1. Open Grafana
2. Go to Dashboards > Import
3. Upload `grafana-dashboard.json`
4. Select data source
5. Save

### Alertmanager

Import alert rules:

1. Copy `alert-rules.yml` to Alertmanager rules directory
2. Reload Alertmanager configuration
3. Verify rules are loaded

## Vendor Neutrality

All observability outputs are vendor-neutral:

- Metrics use Prometheus format (widely supported)
- Alerts use Prometheus Alertmanager format
- Dashboard uses Grafana JSON (can be adapted)

No external vendor configuration is required for basic functionality.

## Runbooks

### Parity Failure on Main

1. Check CI logs for failure details
2. Review recent commits for changes
3. Run local parity tests
4. If regression, revert or fix
5. If threshold issue, review with team

### Integrity Mismatch

1. Check which hash mismatched
2. Verify dataset file integrity
3. Check for unauthorized changes
4. If corruption, restore from backup
5. If tampering, escalate to security

### Threshold Violations

1. Review violation details
2. Check if thresholds are appropriate
3. If rules changed, update thresholds
4. If quality issue, fix validation
5. Document decision in changelog
