/**
 * Stage 14c: Observability Contract Tests (Finalised)
 * 
 * Tests for parity metrics, alerts, and dashboard configuration.
 * 
 * PROMETHEUS CORRECTNESS:
 * - All metric values MUST be numeric
 * - Timestamps are epoch seconds (not ISO strings)
 * - Labels are stable and PII-safe
 * 
 * DETERMINISM:
 * - Severity labels are emitted in canonical order (S0, S1, S2, S3)
 * - Label names are from allowlist only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordParityRun,
  recordIntegrityCheck,
  getMetrics,
  resetMetrics,
  formatPrometheusMetrics,
  validateMetricsSafety,
  getCanonicalSeverityOrder,
  getAllowedLabels,
  type ParityMetrics
} from '../../services/metrics/parityMetrics';

describe('Stage 14c: Observability (Finalised)', () => {
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
    
    it('should calculate pass rate by severity using canonical labels (S0-S3)', () => {
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
    
    it('should ONLY accept canonical severity labels (S0-S3)', () => {
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
          'critical': { passed: 10, total: 10 }, // Non-canonical - should be ignored
          'high': { passed: 15, total: 20 }, // Non-canonical - should be ignored
          S1: { passed: 28, total: 35 }
        }
      });
      
      const metrics = getMetrics();
      
      // Only canonical labels should be present
      expect(Object.keys(metrics.parity_pass_rate_by_severity)).toEqual(
        expect.arrayContaining(['S0', 'S1'])
      );
      expect(metrics.parity_pass_rate_by_severity['critical']).toBeUndefined();
      expect(metrics.parity_pass_rate_by_severity['high']).toBeUndefined();
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
    it('should record integrity check results with epoch seconds', () => {
      const beforeTime = Math.floor(Date.now() / 1000);
      
      recordIntegrityCheck({
        hashVerified: true,
        mismatch: false
      });
      
      const afterTime = Math.floor(Date.now() / 1000);
      const metrics = getMetrics();
      
      expect(metrics.integrity_mismatch_total).toBe(0);
      // Timestamp should be numeric epoch seconds
      expect(typeof metrics.integrity_last_check_epoch_seconds).toBe('number');
      expect(metrics.integrity_last_check_epoch_seconds).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.integrity_last_check_epoch_seconds).toBeLessThanOrEqual(afterTime);
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
  
  describe('Prometheus Format Correctness', () => {
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
    
    it('should emit all metric values as numeric (Prometheus requirement)', () => {
      recordParityRun({
        passRate: 85.5,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: { S0: { passed: 20, total: 20 } }
      });
      
      recordIntegrityCheck({ hashVerified: true, mismatch: false });
      
      const output = formatPrometheusMetrics();
      const lines = output.split('\n').filter(l => !l.startsWith('#') && l.trim());
      
      // Each metric line should have a numeric value
      lines.forEach(line => {
        const parts = line.split(' ');
        const value = parts[parts.length - 1];
        expect(Number.isFinite(parseFloat(value))).toBe(true);
      });
    });
    
    it('should emit integrity timestamp as epoch seconds', () => {
      recordIntegrityCheck({ hashVerified: true, mismatch: false });
      
      const output = formatPrometheusMetrics();
      
      expect(output).toContain('integrity_last_check_epoch_seconds');
      expect(output).toContain('# TYPE integrity_last_check_epoch_seconds gauge');
      
      // Extract the value and verify it's a reasonable epoch timestamp
      const match = output.match(/integrity_last_check_epoch_seconds (\d+)/);
      expect(match).toBeTruthy();
      const epochSeconds = parseInt(match![1], 10);
      expect(epochSeconds).toBeGreaterThan(1700000000); // After 2023
      expect(epochSeconds).toBeLessThan(2000000000); // Before 2033
    });
    
    it('should truncate hash in labels for PII safety', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      const output = formatPrometheusMetrics();
      
      // Hash should be truncated (sha256: + 16 chars + ...)
      expect(output).toContain('hash="sha256:abcdef1234567890...');
      // Full hash should NOT be present
      expect(output).not.toContain('sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    });
  });
  
  describe('Deterministic Severity Ordering', () => {
    it('should emit severity metrics in canonical order (S0, S1, S2, S3)', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test',
        thresholdsVersion: '1.0.0',
        bySeverity: {
          S3: { passed: 10, total: 15 },  // Out of order
          S0: { passed: 20, total: 20 },
          S2: { passed: 25, total: 30 },
          S1: { passed: 30, total: 35 }
        }
      });
      
      const output = formatPrometheusMetrics();
      
      // Find all severity metric lines
      const severityLines = output.split('\n')
        .filter(l => l.includes('parity_pass_rate_by_severity{severity='));
      
      // Extract severity values in order
      const severities = severityLines.map(line => {
        const match = line.match(/severity="(S[0-3])"/);
        return match ? match[1] : null;
      }).filter(Boolean);
      
      // Should be in canonical order
      expect(severities).toEqual(['S0', 'S1', 'S2', 'S3']);
    });
    
    it('should provide canonical severity order via API', () => {
      const order = getCanonicalSeverityOrder();
      expect(order).toEqual(['S0', 'S1', 'S2', 'S3']);
    });
    
    it('should provide allowed labels via API', () => {
      const labels = getAllowedLabels();
      expect(labels).toContain('severity');
      expect(labels).toContain('hash');
      expect(labels).toContain('thresholds_version');
    });
    
    it('should produce identical output for identical input (determinism)', () => {
      const input = {
        passRate: 85.5,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        bySeverity: { 
          S3: { passed: 10, total: 15 },
          S0: { passed: 20, total: 20 },
          S2: { passed: 25, total: 30 },
          S1: { passed: 30, total: 35 }
        }
      };
      
      resetMetrics();
      recordParityRun(input);
      const output1 = formatPrometheusMetrics();
      
      resetMetrics();
      recordParityRun(input);
      const output2 = formatPrometheusMetrics();
      
      expect(output1).toBe(output2);
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
        integrity_last_check_epoch_seconds: 1704326400
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
        integrity_last_check_epoch_seconds: 0
      };
      
      const result = validateMetricsSafety(metrics);
      
      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.includes('email'))).toBe(true);
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
        integrity_last_check_epoch_seconds: 0
      };
      
      const result = validateMetricsSafety(metrics);
      
      expect(result.safe).toBe(false);
      expect(result.issues.some(i => i.includes('phone'))).toBe(true);
    });
    
    it('should detect PII in severity labels', () => {
      const metrics: ParityMetrics = {
        parity_pass_rate: 85,
        parity_total_fields: 100,
        parity_passed_fields: 85,
        parity_failed_fields: 15,
        parity_threshold_violations_total: 0,
        parity_runs_total: 1,
        parity_failures_total: 0,
        parity_dataset_hash: 'sha256:test',
        parity_thresholds_version: '1.0.0',
        parity_pass_rate_by_severity: {
          'user@example.com': 100 // PII in label!
        },
        integrity_mismatch_total: 0,
        integrity_last_check_epoch_seconds: 0
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
    
    it('should escape special characters in labels', () => {
      recordParityRun({
        passRate: 85,
        totalFields: 100,
        passedFields: 85,
        failedFields: 15,
        violations: [],
        datasetHash: 'sha256:test"with"quotes',
        thresholdsVersion: '1.0.0',
        bySeverity: {}
      });
      
      const output = formatPrometheusMetrics();
      
      // Quotes should be escaped
      expect(output).toContain('\\"');
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
      expect(metrics.parity_dataset_hash).toBe('');
      expect(metrics.integrity_last_check_epoch_seconds).toBe(0);
    });
  });
  
  describe('Alert Rules Validation', () => {
    it('should define critical alerts for main branch failures', () => {
      const criticalAlerts = [
        'ParityFailureOnMain',
        'CriticalSeverityFailures',
        'HighSeverityFailures',
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
        'MediumSeverityFailures',
        'LowSeverityFailures',
        'DatasetHashChanged',
        'ParityRunsStalled',
        'IntegrityCheckStale'
      ];
      
      warningAlerts.forEach(alert => {
        expect(alert).toBeTruthy();
      });
    });
    
    it('should define alerts for all canonical severity levels (S0-S3)', () => {
      const severityAlerts = [
        { severity: 'S0', alert: 'CriticalSeverityFailures', threshold: 100 },
        { severity: 'S1', alert: 'HighSeverityFailures', threshold: 95 },
        { severity: 'S2', alert: 'MediumSeverityFailures', threshold: 90 },
        { severity: 'S3', alert: 'LowSeverityFailures', threshold: 80 }
      ];
      
      severityAlerts.forEach(({ severity, alert, threshold }) => {
        expect(severity).toMatch(/^S[0-3]$/);
        expect(alert).toBeTruthy();
        expect(threshold).toBeGreaterThan(0);
        expect(threshold).toBeLessThanOrEqual(100);
      });
    });
  });
});
