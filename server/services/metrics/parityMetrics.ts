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
  parity_dataset_hash: '',
  parity_thresholds_version: '',
  parity_pass_rate_by_severity: {},
  integrity_mismatch_total: 0,
  integrity_last_check_timestamp: ''
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
    parity_dataset_hash: '',
    parity_thresholds_version: '',
    parity_pass_rate_by_severity: {},
    integrity_mismatch_total: 0,
    integrity_last_check_timestamp: ''
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
        .join(',');
      lines.push(`${name}{${labelStr}} ${value}`);
    } else {
      lines.push(`${name} ${value}`);
    }
  };
  
  // Gauges
  addMetric('parity_pass_rate', metrics.parity_pass_rate, 'Current parity pass rate percentage', 'gauge');
  addMetric('parity_total_fields', metrics.parity_total_fields, 'Total number of validated fields', 'gauge');
  addMetric('parity_passed_fields', metrics.parity_passed_fields, 'Number of passed fields', 'gauge');
  addMetric('parity_failed_fields', metrics.parity_failed_fields, 'Number of failed fields', 'gauge');
  
  // Counters
  addMetric('parity_threshold_violations_total', metrics.parity_threshold_violations_total, 'Total threshold violations', 'counter');
  addMetric('parity_runs_total', metrics.parity_runs_total, 'Total parity runs', 'counter');
  addMetric('parity_failures_total', metrics.parity_failures_total, 'Total parity failures', 'counter');
  addMetric('integrity_mismatch_total', metrics.integrity_mismatch_total, 'Total integrity mismatches', 'counter');
  
  // Info metrics (using labels)
  if (metrics.parity_dataset_hash) {
    addMetric('parity_dataset_info', 1, 'Dataset information', 'gauge', {
      hash: metrics.parity_dataset_hash.substring(0, 16) + '...',
      thresholds_version: metrics.parity_thresholds_version
    });
  }
  
  // By severity
  Object.entries(metrics.parity_pass_rate_by_severity).forEach(([severity, rate]) => {
    addMetric('parity_pass_rate_by_severity', rate, 'Pass rate by severity', 'gauge', { severity });
  });
  
  return lines.join('\n') + '\n';
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
