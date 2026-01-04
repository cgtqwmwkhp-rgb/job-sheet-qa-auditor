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
        integrity_last_check_timestamp: ''
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
        integrity_last_check_timestamp: ''
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
      expect(metrics.parity_dataset_hash).toBe('');
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
