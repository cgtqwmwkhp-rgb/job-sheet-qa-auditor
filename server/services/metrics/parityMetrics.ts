/**
 * Parity Metrics Service
 * 
 * Exposes parity and integrity metrics for observability.
 * All metrics are PII-safe and do not leak sensitive data.
 * 
 * PROMETHEUS CORRECTNESS:
 * - All metric values MUST be numeric
 * - Timestamps are exposed as epoch seconds (gauge)
 * - Labels are stable and PII-safe
 * - In-memory store is for testing; production uses proper backend
 * 
 * DETERMINISM:
 * - Severity labels are emitted in canonical order (S0, S1, S2, S3)
 * - Label names are from allowlist only
 */

// Canonical severity order (MUST be maintained)
const CANONICAL_SEVERITY_ORDER = ['S0', 'S1', 'S2', 'S3'] as const;
type CanonicalSeverity = typeof CANONICAL_SEVERITY_ORDER[number];

// Allowed label names (no dynamic labels)
const ALLOWED_LABELS = ['severity', 'hash', 'thresholds_version'] as const;

export interface ParityMetrics {
  // Gauges (all numeric)
  parity_pass_rate: number;
  parity_total_fields: number;
  parity_passed_fields: number;
  parity_failed_fields: number;
  
  // Counters (all numeric)
  parity_threshold_violations_total: number;
  parity_runs_total: number;
  parity_failures_total: number;
  
  // Info labels (not values) - used in label metadata only
  parity_dataset_hash: string;
  parity_thresholds_version: string;
  
  // By severity (all numeric) - keys MUST be canonical S0-S3
  parity_pass_rate_by_severity: Record<string, number>;
  
  // Integrity (numeric)
  integrity_mismatch_total: number;
  integrity_last_check_epoch_seconds: number; // Unix epoch seconds, NOT string
}

export interface IntegrityMetrics {
  integrity_mismatch_total: number;
  integrity_hash_verified: boolean;
  integrity_last_check_epoch_seconds: number;
}

// In-memory metrics store
// NOTE: This is for testing and development only.
// In production, use a proper metrics backend (Prometheus client, StatsD, etc.)
let metricsStore: ParityMetrics = {
  parity_pass_rate: 0,
  parity_total_fields: 0,
  parity_passed_fields: 0,
  parity_failed_fields: 0,
  parity_threshold_violations_total: 0,
  parity_runs_total: 0,
  parity_failures_total: 0,
  parity_dataset_hash: '',
  parity_thresholds_version: '',
  parity_pass_rate_by_severity: {},
  integrity_mismatch_total: 0,
  integrity_last_check_epoch_seconds: 0
};

/**
 * Validate severity label is canonical
 */
function isCanonicalSeverity(severity: string): severity is CanonicalSeverity {
  return CANONICAL_SEVERITY_ORDER.includes(severity as CanonicalSeverity);
}

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
  
  // Calculate pass rate by severity - ONLY canonical severities
  metricsStore.parity_pass_rate_by_severity = {};
  Object.entries(results.bySeverity).forEach(([severity, data]) => {
    // Only accept canonical severity labels
    if (isCanonicalSeverity(severity)) {
      metricsStore.parity_pass_rate_by_severity[severity] = 
        data.total > 0 ? (data.passed / data.total) * 100 : 0;
    }
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
  // Store as Unix epoch seconds (numeric, Prometheus-correct)
  metricsStore.integrity_last_check_epoch_seconds = Math.floor(Date.now() / 1000);
}

/**
 * Get current metrics
 */
export function getMetrics(): ParityMetrics {
  return { ...metricsStore };
}

/**
 * Reset metrics (for testing ONLY - not for production use)
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
    parity_dataset_hash: '',
    parity_thresholds_version: '',
    parity_pass_rate_by_severity: {},
    integrity_mismatch_total: 0,
    integrity_last_check_epoch_seconds: 0
  };
}

/**
 * Format metrics in Prometheus exposition format
 * 
 * IMPORTANT: All values MUST be numeric. Labels are for metadata only.
 * DETERMINISM: Severity labels are emitted in canonical order (S0, S1, S2, S3)
 */
export function formatPrometheusMetrics(): string {
  const metrics = getMetrics();
  const lines: string[] = [];
  
  // Helper to add metric with optional labels
  const addMetric = (
    name: string, 
    value: number, 
    help: string, 
    type: 'gauge' | 'counter', 
    labels?: Record<string, string>
  ) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    
    if (labels && Object.keys(labels).length > 0) {
      // Validate labels are from allowlist
      const validLabels = Object.entries(labels)
        .filter(([k]) => ALLOWED_LABELS.includes(k as typeof ALLOWED_LABELS[number]));
      
      if (validLabels.length > 0) {
        const labelStr = validLabels
          .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
          .join(',');
        lines.push(`${name}{${labelStr}} ${value}`);
      } else {
        lines.push(`${name} ${value}`);
      }
    } else {
      lines.push(`${name} ${value}`);
    }
  };
  
  // Gauges (all numeric)
  addMetric('parity_pass_rate', metrics.parity_pass_rate, 'Current parity pass rate percentage', 'gauge');
  addMetric('parity_total_fields', metrics.parity_total_fields, 'Total number of validated fields', 'gauge');
  addMetric('parity_passed_fields', metrics.parity_passed_fields, 'Number of passed fields', 'gauge');
  addMetric('parity_failed_fields', metrics.parity_failed_fields, 'Number of failed fields', 'gauge');
  
  // Counters (all numeric)
  addMetric('parity_threshold_violations_total', metrics.parity_threshold_violations_total, 'Total threshold violations', 'counter');
  addMetric('parity_runs_total', metrics.parity_runs_total, 'Total parity runs', 'counter');
  addMetric('parity_failures_total', metrics.parity_failures_total, 'Total parity failures', 'counter');
  addMetric('integrity_mismatch_total', metrics.integrity_mismatch_total, 'Total integrity mismatches', 'counter');
  
  // Integrity last check as epoch seconds (numeric gauge)
  addMetric(
    'integrity_last_check_epoch_seconds', 
    metrics.integrity_last_check_epoch_seconds, 
    'Unix timestamp of last integrity check', 
    'gauge'
  );
  
  // Info metrics (using labels for metadata, value is always 1)
  if (metrics.parity_dataset_hash) {
    addMetric('parity_dataset_info', 1, 'Dataset information', 'gauge', {
      hash: truncateHash(metrics.parity_dataset_hash),
      thresholds_version: metrics.parity_thresholds_version
    });
  }
  
  // By severity (all numeric values) - DETERMINISTIC ORDER
  // Emit in canonical order: S0, S1, S2, S3
  CANONICAL_SEVERITY_ORDER.forEach(severity => {
    if (severity in metrics.parity_pass_rate_by_severity) {
      const rate = metrics.parity_pass_rate_by_severity[severity];
      addMetric('parity_pass_rate_by_severity', rate, 'Pass rate by severity', 'gauge', { severity });
    }
  });
  
  return lines.join('\n') + '\n';
}

/**
 * Escape label value for Prometheus format
 */
function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Truncate hash for display (PII-safe, no full hash exposure)
 */
function truncateHash(hash: string): string {
  if (hash.startsWith('sha256:')) {
    return hash.substring(0, 23) + '...'; // sha256: + 16 chars
  }
  return hash.substring(0, 16) + '...';
}

/**
 * Validate that metrics do not contain PII
 * Returns true if safe, false if PII detected
 */
export function validateMetricsSafety(metrics: ParityMetrics): { safe: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for potential PII patterns
  const piiPatterns = [
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, name: 'email' },
    { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, name: 'phone' },
    { pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/, name: 'SSN' },
    { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b/, name: 'credit card' },
  ];
  
  const stringValues = [
    metrics.parity_dataset_hash,
    metrics.parity_thresholds_version
  ];
  
  stringValues.forEach(value => {
    if (value) {
      piiPatterns.forEach(({ pattern, name }) => {
        if (pattern.test(value)) {
          issues.push(`Potential ${name} detected in metric value`);
        }
      });
    }
  });
  
  // Check severity labels for PII
  Object.keys(metrics.parity_pass_rate_by_severity).forEach(severity => {
    piiPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(severity)) {
        issues.push(`Potential ${name} detected in severity label`);
      }
    });
  });
  
  return { safe: issues.length === 0, issues };
}

/**
 * Get canonical severity order for external use
 */
export function getCanonicalSeverityOrder(): readonly string[] {
  return CANONICAL_SEVERITY_ORDER;
}

/**
 * Get allowed label names for external use
 */
export function getAllowedLabels(): readonly string[] {
  return ALLOWED_LABELS;
}
