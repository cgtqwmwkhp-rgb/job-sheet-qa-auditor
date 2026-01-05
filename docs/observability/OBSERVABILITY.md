# Observability Guide

This document describes the observability features for monitoring parity and integrity.

## Prometheus Correctness

All metrics follow Prometheus best practices:

- **All metric values are numeric** - No string values in metric data
- **Timestamps are epoch seconds** - Not ISO strings
- **Labels are stable** - No high-cardinality or PII data in labels
- **Hash truncation** - Full hashes are never exposed in labels

## Determinism

All metric emissions are deterministic:

- **Canonical severity order** - Severities are always emitted as S0, S1, S2, S3
- **Label allowlist** - Only `severity`, `hash`, `thresholds_version` labels are permitted
- **Reproducible output** - Same input always produces same output

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
| `parity_pass_rate_by_severity` | Gauge | Pass rate by severity level (S0-S3) |

### Integrity Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `integrity_mismatch_total` | Counter | Total integrity mismatches |
| `integrity_last_check_epoch_seconds` | Gauge | Unix timestamp of last integrity check |

### Info Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `parity_dataset_info` | `hash` (truncated), `thresholds_version` | Dataset metadata |

## Canonical Severity Labels

All severity-based metrics use canonical labels:

| Label | Description | Threshold |
|-------|-------------|-----------|
| `S0` | Critical | Must be 100% |
| `S1` | High | Must be >= 95% |
| `S2` | Medium | Must be >= 90% |
| `S3` | Low | Must be >= 80% |

**IMPORTANT**: Only canonical severity labels (S0-S3) are accepted. Non-canonical labels like "critical", "high", "medium", "low" are rejected.

## Label Allowlist

Only the following labels are permitted in metrics:

| Label | Description |
|-------|-------------|
| `severity` | Canonical severity level (S0-S3) |
| `hash` | Truncated dataset hash |
| `thresholds_version` | Version of threshold configuration |

Dynamic or arbitrary labels are not permitted to ensure determinism and prevent label explosion.

## Alerts

### Critical Alerts

| Alert | Condition | Description |
|-------|-----------|-------------|
| `ParityFailureOnMain` | Parity fails on main | Immediate attention required |
| `CriticalSeverityFailures` | S0 < 100% | Critical fields failing |
| `HighSeverityFailures` | S1 < 95% | High severity fields below threshold |
| `IntegrityMismatchSpike` | >5 mismatches/hour | Possible data corruption |
| `MetricsEndpointDown` | Endpoint unavailable | Metrics collection broken |

### Warning Alerts

| Alert | Condition | Description |
|-------|-----------|-------------|
| `RepeatedThresholdViolations` | >3 violations/hour | Review thresholds |
| `ParityPassRateDrop` | Pass rate < 80% | Quality degradation |
| `MediumSeverityFailures` | S2 < 90% | Medium severity below threshold |
| `LowSeverityFailures` | S3 < 80% | Low severity below threshold |
| `DatasetHashChanged` | Hash changed | Verify intentional |
| `ParityRunsStalled` | No runs in 24h | Check CI pipeline |
| `IntegrityCheckStale` | No check in 24h | Check integrity pipeline |

## Dashboard

A Grafana dashboard template is provided at `scripts/monitoring/grafana-dashboard.json`.

### Panels
1. **Parity Pass Rate** - Current pass rate with color thresholds
2. **Total Parity Runs** - Counter of all runs
3. **Threshold Violations** - Violation counter with alerts
4. **Integrity Mismatches** - Mismatch counter
5. **Pass Rate Over Time** - Time series graph
6. **Pass Rate by Severity** - Bar chart by severity (S0-S3)
7. **Field Status Distribution** - Pie chart of passed/failed
8. **Dataset Information** - Metadata display
9. **Integrity Last Check** - Time since last check

## PII Safety

All metrics are validated for PII safety:

- No email addresses
- No phone numbers
- No SSN/tax IDs
- No credit card numbers
- No raw OCR content
- Hash values are truncated in labels (sha256: + 16 chars + ...)

The `validateMetricsSafety()` function checks for common PII patterns before emission.

## Integration

### Prometheus

Metrics are exposed in Prometheus exposition format:

```
# HELP parity_pass_rate Current parity pass rate percentage
# TYPE parity_pass_rate gauge
parity_pass_rate 85.5

# HELP integrity_last_check_epoch_seconds Unix timestamp of last integrity check
# TYPE integrity_last_check_epoch_seconds gauge
integrity_last_check_epoch_seconds 1704326400

# HELP parity_pass_rate_by_severity Pass rate by severity
# TYPE parity_pass_rate_by_severity gauge
parity_pass_rate_by_severity{severity="S0"} 100
parity_pass_rate_by_severity{severity="S1"} 95
parity_pass_rate_by_severity{severity="S2"} 90
parity_pass_rate_by_severity{severity="S3"} 85
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

## API Reference

### `recordParityRun(results)`

Record parity run results. Only canonical severity labels (S0-S3) are accepted.

### `recordIntegrityCheck(result)`

Record integrity check result. Timestamp is stored as epoch seconds.

### `getMetrics()`

Get current metrics snapshot.

### `formatPrometheusMetrics()`

Format metrics in Prometheus exposition format with deterministic ordering.

### `validateMetricsSafety(metrics)`

Validate metrics for PII safety. Returns `{ safe: boolean, issues: string[] }`.

### `getCanonicalSeverityOrder()`

Get canonical severity order: `['S0', 'S1', 'S2', 'S3']`.

### `getAllowedLabels()`

Get allowed label names: `['severity', 'hash', 'thresholds_version']`.

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

### Severity-Specific Failures

For S0 (Critical) failures:
1. Stop all deployments immediately
2. Identify failing fields
3. Root cause analysis required
4. Fix must be deployed same day

For S1 (High) failures:
1. Block promotion to production
2. Identify failing fields
3. Fix within 24 hours

For S2/S3 (Medium/Low) failures:
1. Document in tracking system
2. Schedule fix in next sprint
3. Consider threshold adjustment if appropriate

## Related Documentation

- [Parity Harness](../parity/PARITY_HARNESS.md)
- [Threshold Governance](../parity/THRESHOLD_GOVERNANCE.md)
- [Promotion Gates](../release/PROMOTION_GATES.md)
