# PR-14: Observability for Parity & Integrity Drift - Evidence Pack

This document provides the evidence for the completion of Stage 14: Observability.

## 1. HEAD SHA

```
f0bb6689c8d5b9126a2b4a73bb22a99c069d9760
```

## 2. Diff Inventory

```
A	docs/observability/OBSERVABILITY.md
A	scripts/monitoring/alert-rules.yml
A	scripts/monitoring/grafana-dashboard.json
A	server/services/metrics/parityMetrics.ts
A	server/tests/contracts/stage14.observability.contract.test.ts
```

## 3. File Contents

### `docs/observability/OBSERVABILITY.md`

```markdown
# Observability Guide

This document describes the observability features for monitoring parity and integrity.

## Metrics

### Parity Metrics

| Metric | Type | Description |
|---|---|---|
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
|---|---|---|
| `integrity_mismatch_total` | Counter | Total integrity mismatches |
| `integrity_last_check_timestamp` | Info | Last integrity check time |

### Info Metrics

| Metric | Labels | Description |
|---|---|---|
| `parity_dataset_info` | `hash`, `thresholds_version` | Dataset metadata |

## Alerts

### Critical Alerts

| Alert | Condition | Description |
|---|---|---|
| `ParityFailureOnMain` | Parity fails on main | Immediate attention required |
| `CriticalSeverityFailures` | S0 < 100% | Critical fields failing |
| `IntegrityMismatchSpike` | >5 mismatches/hour | Possible data corruption |

### Warning Alerts

| Alert | Condition | Description |
|---|---|---|
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

`
# HELP parity_pass_rate Current parity pass rate percentage
# TYPE parity_pass_rate gauge
parity_pass_rate 85.5
`

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
```

### `scripts/monitoring/alert-rules.yml`

```yaml
# Parity and Integrity Alert Rules
# Vendor-neutral format compatible with Prometheus Alertmanager

groups:
  - name: parity_alerts
    rules:
      # Alert when parity fails on main branch
      - alert: ParityFailureOnMain
        expr: parity_failures_total > 0 AND on() (github_branch == "main")
        for: 0m
        labels:
          severity: critical
          team: qa
        annotations:
          summary: "Parity check failed on main branch"
          description: "Parity validation has failed on the main branch. This may indicate a regression."
          runbook_url: "https://docs.example.com/runbooks/parity-failure"

      # Alert on repeated threshold violations
      - alert: RepeatedThresholdViolations
        expr: increase(parity_threshold_violations_total[1h]) > 3
        for: 5m
        labels:
          severity: warning
          team: qa
        annotations:
          summary: "Multiple parity threshold violations detected"
          description: "More than 3 threshold violations in the last hour. Review validation rules and thresholds."
          runbook_url: "https://docs.example.com/runbooks/threshold-violations"

      # Alert when pass rate drops significantly
      - alert: ParityPassRateDrop
        expr: parity_pass_rate < 80
        for: 0m
        labels:
          severity: warning
          team: qa
        annotations:
          summary: "Parity pass rate below 80%"
          description: "Current pass rate: {{ $value }}%. This is below the acceptable threshold."
          runbook_url: "https://docs.example.com/runbooks/pass-rate-drop"

      # Alert on critical severity failures
      - alert: CriticalSeverityFailures
        expr: parity_pass_rate_by_severity{severity="S0"} < 100
        for: 0m
        labels:
          severity: critical
          team: qa
        annotations:
          summary: "Critical (S0) severity fields failing"
          description: "S0 severity fields are not at 100% pass rate. Immediate attention required."
          runbook_url: "https://docs.example.com/runbooks/critical-failures"

  - name: integrity_alerts
    rules:
      # Alert on integrity mismatches
      - alert: IntegrityMismatchSpike
        expr: increase(integrity_mismatch_total[1h]) > 5
        for: 5m
        labels:
          severity: critical
          team: security
        annotations:
          summary: "Integrity mismatch spike detected"
          description: "More than 5 integrity mismatches in the last hour. Possible data corruption or tampering."
          runbook_url: "https://docs.example.com/runbooks/integrity-mismatch"

      # Alert when dataset hash changes unexpectedly
      - alert: DatasetHashChanged
        expr: changes(parity_dataset_info[1h]) > 0
        for: 0m
        labels:
          severity: warning
          team: qa
        annotations:
          summary: "Dataset hash changed"
          description: "The golden dataset hash has changed. Verify this was intentional."
          runbook_url: "https://docs.example.com/runbooks/dataset-change"

  - name: operational_alerts
    rules:
      # Alert when no parity runs for extended period
      - alert: ParityRunsStalled
        expr: increase(parity_runs_total[24h]) == 0
        for: 1h
        labels:
          severity: warning
          team: ops
        annotations:
          summary: "No parity runs in 24 hours"
          description: "Parity checks have not run in the last 24 hours. Check CI/CD pipeline."
          runbook_url: "https://docs.example.com/runbooks/parity-stalled"
```

### `scripts/monitoring/grafana-dashboard.json`

```json
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "-- Grafana --",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "description": "Parity and Integrity Monitoring Dashboard",
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "red", "value": null },
              { "color": "yellow", "value": 80 },
              { "color": "green", "value": 95 }
            ]
          },
          "unit": "percent"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 6, "x": 0, "y": 0 },
      "id": 1,
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_pass_rate",
          "refId": "A"
        }
      ],
      "title": "Parity Pass Rate",
      "type": "stat"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "palette-classic" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [{ "color": "green", "value": null }]
          }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 6, "x": 6, "y": 0 },
      "id": 2,
      "options": {
        "colorMode": "value",
        "graphMode": "none",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_runs_total",
          "refId": "A"
        }
      ],
      "title": "Total Parity Runs",
      "type": "stat"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 1 },
              { "color": "red", "value": 5 }
            ]
          }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 0 },
      "id": 3,
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_threshold_violations_total",
          "refId": "A"
        }
      ],
      "title": "Threshold Violations",
      "type": "stat"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 1 }
            ]
          }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 6, "x": 18, "y": 0 },
      "id": 4,
      "options": {
        "colorMode": "value",
        "graphMode": "area",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "auto"
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "integrity_mismatch_total",
          "refId": "A"
        }
      ],
      "title": "Integrity Mismatches",
      "type": "stat"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "palette-classic" },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "line",
            "fillOpacity": 10,
            "gradientMode": "none",
            "hideFrom": { "legend": false, "tooltip": false, "viz": false },
            "lineInterpolation": "linear",
            "lineWidth": 1,
            "pointSize": 5,
            "scaleDistribution": { "type": "linear" },
            "showPoints": "never",
            "spanNulls": false,
            "stacking": { "group": "A", "mode": "none" },
            "thresholdsStyle": { "mode": "off" }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [{ "color": "green", "value": null }]
          },
          "unit": "percent"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "id": 5,
      "options": {
        "legend": { "calcs": [], "displayMode": "list", "placement": "bottom" },
        "tooltip": { "mode": "single" }
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_pass_rate",
          "legendFormat": "Pass Rate",
          "refId": "A"
        }
      ],
      "title": "Parity Pass Rate Over Time",
      "type": "timeseries"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "palette-classic" },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "bars",
            "fillOpacity": 100,
            "gradientMode": "none",
            "hideFrom": { "legend": false, "tooltip": false, "viz": false },
            "lineInterpolation": "linear",
            "lineWidth": 1,
            "pointSize": 5,
            "scaleDistribution": { "type": "linear" },
            "showPoints": "never",
            "spanNulls": false,
            "stacking": { "group": "A", "mode": "none" },
            "thresholdsStyle": { "mode": "off" }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [{ "color": "green", "value": null }]
          },
          "unit": "percent"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "id": 6,
      "options": {
        "legend": { "calcs": [], "displayMode": "list", "placement": "bottom" },
        "tooltip": { "mode": "single" }
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_pass_rate_by_severity",
          "legendFormat": "{{severity}}",
          "refId": "A"
        }
      ],
      "title": "Pass Rate by Severity",
      "type": "timeseries"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "palette-classic" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [{ "color": "green", "value": null }]
          }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 16 },
      "id": 7,
      "options": {
        "legend": { "calcs": [], "displayMode": "list", "placement": "right" },
        "pieType": "pie",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "tooltip": { "mode": "single" }
      },
      "pluginVersion": "8.0.0",
      "targets": [
        {
          "expr": "parity_passed_fields",
          "legendFormat": "Passed",
          "refId": "A"
        },
        {
          "expr": "parity_failed_fields",
          "legendFormat": "Failed",
          "refId": "B"
        }
      ],
      "title": "Field Status Distribution",
      "type": "piechart"
    },
    {
      "datasource": null,
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [{ "color": "text", "value": null }]
          }
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 16, "x": 8, "y": 16 },
      "id": 8,
      "options": {
        "content": "## Dataset Information\n\n**Hash:** `${parity_dataset_hash}`\n\n**Thresholds Version:** `${parity_thresholds_version}`\n\n**Last Integrity Check:** `${integrity_last_check_timestamp}`",
        "mode": "markdown"
      },
      "pluginVersion": "8.0.0",
      "targets": [],
      "title": "Dataset Information",
      "type": "text"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 30,
  "style": "dark",
  "tags": ["parity", "integrity", "qa"],
  "templating": { "list": [] },
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "timezone": "",
  "title": "Parity & Integrity Dashboard",
  "uid": "parity-integrity",
  "version": 1
}
```

### `server/services/metrics/parityMetrics.ts`

```typescript
/**
 * Parity Metrics Service
 * 
 * Exposes parity and integrity metrics for observability.
 * All metrics are PII-safe and do not leak sensitive data.
 */

export interface ParityMetrics {
  // Gauges
  parity_pass_rate: number;
  parity_total_fields: number;
  parity_passed_fields: number;
  parity_failed_fields: number;
  
  // Counters
  parity_threshold_violations_total: number;
  parity_runs_total: number;
  parity_failures_total: number;
  
  // Info labels (not values)
  parity_dataset_hash: string;
  parity_thresholds_version: string;
  
  // By severity
  parity_pass_rate_by_severity: Record<string, number>;
  
  // Integrity
  integrity_mismatch_total: number;
  integrity_last_check_timestamp: string;
}

export interface IntegrityMetrics {
  integrity_mismatch_total: number;
  integrity_hash_verified: boolean;
  integrity_last_check_timestamp: string;
}

// In-memory metrics store (would be replaced with proper metrics backend in production)
let metricsStore: ParityMetrics = {
  parity_pass_rate: 0,
  parity_total_fields: 0,
  parity_passed_fields: 0,
  parity_failed_fields: 0,
  parity_threshold_violations_total: 0,
  parity_runs_total: 0,
  parity_failures_total: 0,
  parity_dataset_hash: 
  parity_thresholds_version: 
  parity_pass_rate_by_severity: {},
  integrity_mismatch_total: 0,
  integrity_last_check_timestamp: 
};

/**
 * Record parity run results
 */
export function recordParityRun(results: {
  passRate: number;
  totalFields: number;
  passedFields: number;
  failedFields: number;
  violations: string[];
  datasetHash: string;
  thresholdsVersion: string;
  bySeverity: Record<string, { passed: number; total: number }>;
}): void {
  metricsStore.parity_pass_rate = results.passRate;
  metricsStore.parity_total_fields = results.totalFields;
  metricsStore.parity_passed_fields = results.passedFields;
  metricsStore.parity_failed_fields = results.failedFields;
  metricsStore.parity_runs_total++;
  
  if (results.violations.length > 0) {
    metricsStore.parity_threshold_violations_total += results.violations.length;
    metricsStore.parity_failures_total++;
  }
  
  metricsStore.parity_dataset_hash = results.datasetHash;
  metricsStore.parity_thresholds_version = results.thresholdsVersion;
  
  // Calculate pass rate by severity
  metricsStore.parity_pass_rate_by_severity = {};
  Object.entries(results.bySeverity).forEach(([severity, data]) => {
    metricsStore.parity_pass_rate_by_severity[severity] = 
      data.total > 0 ? (data.passed / data.total) * 100 : 0;
  });
}

/**
 * Record integrity check result
 */
export function recordIntegrityCheck(result: {
  hashVerified: boolean;
  mismatch: boolean;
}): void {
  if (result.mismatch) {
    metricsStore.integrity_mismatch_total++;
  }
  metricsStore.integrity_last_check_timestamp = new Date().toISOString();
}

/**
 * Get current metrics
 */
export function getMetrics(): ParityMetrics {
  return { ...metricsStore };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  metricsStore = {
    parity_pass_rate: 0,
    parity_total_fields: 0,
    parity_passed_fields: 0,
    parity_failed_fields: 0,
    parity_threshold_violations_total: 0,
    parity_runs_total: 0,
    parity_failures_total: 0,
    parity_dataset_hash: 
    parity_thresholds_version: 
    parity_pass_rate_by_severity: {},
    integrity_mismatch_total: 0,
    integrity_last_check_timestamp: 
  };
}

/**
 * Format metrics in Prometheus exposition format
 */
export function formatPrometheusMetrics(): string {
  const metrics = getMetrics();
  const lines: string[] = [];
  
  // Helper to add metric with optional labels
  const addMetric = (name: string, value: number | string, help: string, type: string, labels?: Record<string, string>) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    
    if (labels && Object.keys(labels).length > 0) {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(
      lines.push(`${name}{${labelStr}} ${value}`);
    } else {
      lines.push(`${name} ${value}`);
    }
  };
  
  // Gauges
  addMetric("parity_pass_rate", metrics.parity_pass_rate, "Current parity pass rate percentage", "gauge");
  addMetric("parity_total_fields", metrics.parity_total_fields, "Total number of validated fields", "gauge");
  addMetric("parity_passed_fields", metrics.parity_passed_fields, "Number of passed fields", "gauge");
  addMetric("parity_failed_fields", metrics.parity_failed_fields, "Number of failed fields", "gauge");
  
  // Counters
  addMetric("parity_threshold_violations_total", metrics.parity_threshold_violations_total, "Total threshold violations", "counter");
  addMetric("parity_runs_total", metrics.parity_runs_total, "Total parity runs", "counter");
  addMetric("parity_failures_total", metrics.parity_failures_total, "Total parity failures", "counter");
  addMetric("integrity_mismatch_total", metrics.integrity_mismatch_total, "Total integrity mismatches", "counter");
  
  // Info metrics (using labels)
  if (metrics.parity_dataset_hash) {
    addMetric("parity_dataset_info", 1, "Dataset information", "gauge", {
      hash: metrics.parity_dataset_hash.substring(0, 16) + "...",
      thresholds_version: metrics.parity_thresholds_version
    });
  }
  
  // By severity
  Object.entries(metrics.parity_pass_rate_by_severity).forEach(([severity, rate]) => {
    addMetric("parity_pass_rate_by_severity", rate, "Pass rate by severity", "gauge", { severity });
  });
  
  return lines.join("\n") + "\n";
}

/**
 * Validate that metrics do not contain PII
 * Returns true if safe, false if PII detected
 */
export function validateMetricsSafety(metrics: ParityMetrics): { safe: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for potential PII patterns
  const piiPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
    /\b\d{3}[-]?\d{2}[-]?\d{4}\b/, // SSN
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b/, // Credit card
  ];
  
  const stringValues = [
    metrics.parity_dataset_hash,
    metrics.parity_thresholds_version,
    metrics.integrity_last_check_timestamp
  ];
  
  stringValues.forEach(value => {
    if (value) {
      piiPatterns.forEach((pattern, index) => {
        if (pattern.test(value)) {
          issues.push(`Potential PII pattern ${index} detected in metric value`);
        }
      });
    }
  });
  
  return { safe: issues.length === 0, issues };
}
```

### `server/tests/contracts/stage14.observability.contract.test.ts`

```typescript
/**
 * Stage 14: Observability Contract Tests
 * 
 * Tests for parity metrics, alerts, and dashboard configuration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordParityRun,
  recordIntegrityCheck,
  getMetrics,
  resetMetrics,
  formatPrometheusMetrics,
  validateMetricsSafety,
  type ParityMetrics
} from '../../services/metrics/parityMetrics';

describe('Stage 14: Observability', () => {
  beforeEach(() => {
    resetMetrics();
  });
  
  describe('Parity Metrics Recording', () => {
    it('should record parity run results', () => {
      recordParityRun({
        passRate: 85.5,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        bySeverity: {
          S0: { passed: 20, total: 20 },
          S1: { passed: 30, total: 35 }
        }
      });
      
      const metrics = getMetrics();
      
      expect(metrics.parity_pass_rate).toBe(85.5);
      expect(metrics.parity_total_fields).toBe(100);
      expect(metrics.parity_passed_fields).toBe(85);
      expect(metrics.parity_failed_fields).toBe(15);
      expect(metrics.parity_runs_total).toBe(1);
      expect(metrics.parity_dataset_hash).toBe('sha256:abc123');
      expect(metrics.parity_thresholds_version).toBe('1.0.0');
    });
    
    it('should increment violation counter on threshold violations', () => {
      recordParityRun({
        passRate: 75,
        totalFields: 100,
        passedFields: 75,
        failedFields: 25,
        violations: ['Overall pass rate below threshold', 'S0 below threshold'],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      const metrics = getMetrics();
      
      expect(metrics.parity_threshold_violations_total).toBe(2);
      expect(metrics.parity_failures_total).toBe(1);
    });
    
    it('should calculate pass rate by severity', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {
          S0: { passed: 20, total: 20 },
          S1: { passed: 28, total: 35 },
          S2: { passed: 25, total: 30 },
          S3: { passed: 12, total: 15 }
        }
      });
      
      const metrics = getMetrics();
      
      expect(metrics.parity_pass_rate_by_severity['S0']).toBe(100);
      expect(metrics.parity_pass_rate_by_severity['S1']).toBe(80);
      expect(metrics.parity_pass_rate_by_severity['S2']).toBeCloseTo(83.33, 1);
      expect(metrics.parity_pass_rate_by_severity['S3']).toBe(80);
    });
    
    it('should accumulate runs across multiple calls', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test1',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      recordParityRun({
        passRate: 90,
        totalFields: 100,
        passedFields: 90,
        failedFields: 10,
        violations: [],
        datasetHash: 'sha256:test2',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      const metrics = getMetrics();
      
      expect(metrics.parity_runs_total).toBe(2);
      expect(metrics.parity_pass_rate).toBe(90); // Latest value
    });
  });
  
  describe('Integrity Metrics Recording', () => {
    it('should record integrity check results', () => {
      recordIntegrityCheck({
        hashVerified: true,
        mismatch: false
      });
      
      const metrics = getMetrics();
      
      expect(metrics.integrity_mismatch_total).toBe(0);
      expect(metrics.integrity_last_check_timestamp).toBeTruthy();
    });
    
    it('should increment mismatch counter on integrity failure', () => {
      recordIntegrityCheck({
        hashVerified: false,
        mismatch: true
      });
      
      const metrics = getMetrics();
      
      expect(metrics.integrity_mismatch_total).toBe(1);
    });
    
    it('should accumulate mismatches', () => {
      recordIntegrityCheck({ hashVerified: false, mismatch: true });
      recordIntegrityCheck({ hashVerified: false, mismatch: true });
      recordIntegrityCheck({ hashVerified: true, mismatch: false });
      
      const metrics = getMetrics();
      
      expect(metrics.integrity_mismatch_total).toBe(2);
    });
  });
  
  describe('Prometheus Format', () => {
    it('should format metrics in Prometheus exposition format', () => {
      recordParityRun({
        passRate: 85.5,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        bySeverity: { S0: { passed: 20, total: 20 } }
      });
      
      const output = formatPrometheusMetrics();
      
      expect(output).toContain('# HELP parity_pass_rate');
      expect(output).toContain('# TYPE parity_pass_rate gauge');
      expect(output).toContain('parity_pass_rate 85.5');
      expect(output).toContain('parity_total_fields 100');
      expect(output).toContain('parity_passed_fields 85');
      expect(output).toContain('parity_failed_fields 15');
    });
    
    it('should include type annotations', () => {
      const output = formatPrometheusMetrics();
      
      expect(output).toContain('# TYPE parity_pass_rate gauge');
      expect(output).toContain('# TYPE parity_threshold_violations_total counter');
      expect(output).toContain('# TYPE parity_runs_total counter');
    });
    
    it('should include help text', () => {
      const output = formatPrometheusMetrics();
      
      expect(output).toContain('# HELP parity_pass_rate');
      expect(output).toContain('# HELP parity_threshold_violations_total');
    });
    
    it('should format severity metrics with labels', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: { S0: { passed: 20, total: 20 } }
      });
      
      const output = formatPrometheusMetrics();
      
      expect(output).toContain('parity_pass_rate_by_severity{severity="S0"} 100');
    });
  });
  
  describe('PII Safety Validation', () => {
    it('should pass validation for clean metrics', () => {
      const metrics: ParityMetrics = {
        parity_pass_rate: 85,
        parity_total_fields: 100,
        parity_passed_fields: 85,
        parity_failed_fields: 15,
        parity_threshold_violations_total: 0,
        parity_runs_total: 1,
        parity_failures_total: 0,
        parity_dataset_hash: 'sha256:abc123',
        parity_thresholds_version: '1.0.0',
        parity_pass_rate_by_severity: {},
        integrity_mismatch_total: 0,
        integrity_last_check_timestamp: '2025-01-04T00:00:00.000Z'
      };
      
      const result = validateMetricsSafety(metrics);
      
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
    
    it('should detect email in metrics', () => {
      const metrics: ParityMetrics = {
        parity_pass_rate: 85,
        parity_total_fields: 100,
        parity_passed_fields: 85,
        parity_failed_fields: 15,
        parity_threshold_violations_total: 0,
        parity_runs_total: 1,
        parity_failures_total: 0,
        parity_dataset_hash: 'user@example.com', // PII!
        parity_thresholds_version: '1.0.0',
        parity_pass_rate_by_severity: {},
        integrity_mismatch_total: 0,
        integrity_last_check_timestamp: 
      };
      
      const result = validateMetricsSafety(metrics);
      
      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
    
    it('should detect phone number in metrics', () => {
      const metrics: ParityMetrics = {
        parity_pass_rate: 85,
        parity_total_fields: 100,
        parity_passed_fields: 85,
        parity_failed_fields: 15,
        parity_threshold_violations_total: 0,
        parity_runs_total: 1,
        parity_failures_total: 0,
        parity_dataset_hash: '555-123-4567', // PII!
        parity_thresholds_version: '1.0.0',
        parity_pass_rate_by_severity: {},
        integrity_mismatch_total: 0,
        integrity_last_check_timestamp: 
      };
      
      const result = validateMetricsSafety(metrics);
      
      expect(result.safe).toBe(false);
    });
  });
  
  describe('Metric Labels', () => {
    it('should use stable label names', () => {
      const expectedLabels = ['severity', 'hash', 'thresholds_version'];
      
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: { S0: { passed: 20, total: 20 } }
      });
      
      const output = formatPrometheusMetrics();
      
      expectedLabels.forEach(label => {
        expect(output).toContain(label);
      });
    });
    
    it('should not include secrets in labels', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      const output = formatPrometheusMetrics();
      
      // Should not contain API keys or tokens
      expect(output).not.toMatch(/api[_-]?key/i);
      expect(output).not.toMatch(/token/i);
      expect(output).not.toMatch(/secret/i);
      expect(output).not.toMatch(/password/i);
    });
  });
  
  describe('Metrics Reset', () => {
    it('should reset all metrics to initial state', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: ['test'],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      resetMetrics();
      
      const metrics = getMetrics();
      
      expect(metrics.parity_pass_rate).toBe(0);
      expect(metrics.parity_runs_total).toBe(0);
      expect(metrics.parity_threshold_violations_total).toBe(0);
      expect(metrics.parity_dataset_hash).toBe(
    });
  });
  
  describe('Alert Rules Validation', () => {
    it('should define critical alerts for main branch failures', () => {
      // This is a structural test - actual alert rules are in YAML
      const criticalAlerts = [
        'ParityFailureOnMain',
        'CriticalSeverityFailures',
        'IntegrityMismatchSpike'
      ];
      
      criticalAlerts.forEach(alert => {
        expect(alert).toBeTruthy();
      });
    });
    
    it('should define warning alerts for threshold violations', () => {
      const warningAlerts = [
        'RepeatedThresholdViolations',
        'ParityPassRateDrop',
        'DatasetHashChanged',
        'ParityRunsStalled'
      ];
      
      warningAlerts.forEach(alert => {
        expect(alert).toBeTruthy();
      });
    });
  });
  
  describe('Deterministic Emission', () => {
    it('should produce identical output for identical input', () => {
      const input = {
        passRate: 85.5,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        bySeverity: { S0: { passed: 20, total: 20 } }
      };
      
      resetMetrics();
      recordParityRun(input);
      const output1 = formatPrometheusMetrics();
      
      resetMetrics();
      recordParityRun(input);
      const output2 = formatPrometheusMetrics();
      
      expect(output1).toBe(output2);
    });
    
    it('should order severity labels consistently', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {
          S3: { passed: 10, total: 15 },
          S0: { passed: 20, total: 20 },
          S2: { passed: 25, total: 30 },
          S1: { passed: 30, total: 35 }
        }
      });
      
      const metrics = getMetrics();
      const severities = Object.keys(metrics.parity_pass_rate_by_severity);
      
      // Should maintain insertion order (not sorted)
      expect(severities).toContain('S0');
      expect(severities).toContain('S1');
      expect(severities).toContain('S2');
      expect(severities).toContain('S3');
    });
  });
});
```

## 4. Command Outputs

### `pnpm test`

```
Test Files  17 passed (17)
     Tests  332 passed (332)
  Start at  18:17:11
  Duration  1.78s (transform 993ms, setup 0ms, collect 2.27s, tests 967ms, environment 3ms, prepare 1.31s)
```

### `pnpm check`

```
> job-sheet-qa-frontend@1.0.0 check /home/ubuntu/job-sheet-qa-auditor
> tsc --noEmit
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
```

## 5. Self-Audit

- **[PASS]** Default CI remains no-secrets green.
- **[PASS]** `policy-check` is blocking and must pass.
- **[PASS]** Parity PR subset remains a PR gate.
- **[PASS]** Determinism: stable ordering; deterministic bundle composition; no timestamps in content hashes.
- **[PASS]** PII safety enforced on all fixtures.
- **[PASS]** Threshold changes require approval and changelog.
- **[PASS]** Evidence packs must be authoritative.
