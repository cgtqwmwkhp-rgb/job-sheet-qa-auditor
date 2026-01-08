/**
 * Contract Test: /metrics Prometheus Endpoint (ADR-003)
 * 
 * Validates that the /metrics endpoint returns valid Prometheus exposition format.
 * This is REQUIRED for staging/production per ADR-003.
 */

import { describe, it, expect } from 'vitest';
import { handleMetrics } from '../../_core/metrics';
import { formatPrometheusMetrics, recordParityRun, resetMetrics } from '../../services/metrics/parityMetrics';

// Mock Express request/response
function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = '';
  
  return {
    setHeader: (key: string, value: string) => { headers[key] = value; },
    status: (code: number) => ({ send: (data: string) => { statusCode = code; body = data; } }),
    getHeaders: () => headers,
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

describe('Metrics Endpoint Contract (ADR-003)', () => {
  
  describe('Content-Type Requirements', () => {
    
    it('MUST return text/plain content type, not HTML', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const contentType = res.getHeaders()['Content-Type'];
      expect(contentType).toContain('text/plain');
      expect(contentType).not.toContain('text/html');
    });
    
    it('MUST include Prometheus version in Content-Type', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const contentType = res.getHeaders()['Content-Type'];
      expect(contentType).toContain('version=0.0.4');
    });
    
  });
  
  describe('Prometheus Format Requirements', () => {
    
    it('MUST contain # HELP lines for each metric', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('# HELP');
    });
    
    it('MUST contain # TYPE lines for each metric', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('# TYPE');
    });
    
    it('MUST expose app_uptime_seconds gauge', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('# HELP app_uptime_seconds');
      expect(body).toContain('# TYPE app_uptime_seconds gauge');
      expect(body).toMatch(/app_uptime_seconds \d+/);
    });
    
    it('MUST expose app_info with version labels', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('# HELP app_info');
      expect(body).toContain('app_info{');
      expect(body).toContain('git_sha=');
      expect(body).toContain('node_version=');
    });
    
    it('MUST expose HTTP request counters', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('app_http_requests_total');
      expect(body).toContain('app_http_requests_success_total');
      expect(body).toContain('app_http_requests_error_total');
    });
    
    it('MUST expose process memory metrics', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).toContain('process_heap_bytes');
      expect(body).toContain('process_rss_bytes');
    });
    
    it('MUST NOT return HTML or JSON', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      expect(body).not.toContain('<!DOCTYPE');
      expect(body).not.toContain('<html');
      expect(body).not.toMatch(/^\s*\{/); // Not JSON
    });
    
  });
  
  describe('Parity Metrics Integration', () => {
    
    it('MUST include parity metrics when available', () => {
      resetMetrics();
      
      // Record a parity run
      recordParityRun({
        passRate: 95.5,
        totalFields: 100,
        passedFields: 95,
        failedFields: 5,
        violations: [],
        datasetHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        bySeverity: {
          S0: { passed: 10, total: 10 },
          S1: { passed: 20, total: 21 },
        }
      });
      
      const prometheusOutput = formatPrometheusMetrics();
      
      expect(prometheusOutput).toContain('parity_pass_rate');
      expect(prometheusOutput).toContain('parity_total_fields');
      expect(prometheusOutput).toContain('parity_runs_total');
    });
    
  });
  
  describe('ADR-003 Compliance', () => {
    
    it('endpoint returns 200 status code', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      expect(res.getStatusCode()).toBe(200);
    });
    
    it('format matches what monitor-snapshot.sh expects', () => {
      const req = {} as any;
      const res = createMockRes();
      
      handleMetrics(req, res as any);
      
      const body = res.getBody();
      
      // monitor-snapshot.sh checks for these patterns:
      // grep -qE "^# (HELP|TYPE)|^[a-z_]+\{" "$METRICS_FILE"
      const hasHelpOrType = /^# (HELP|TYPE)/m.test(body);
      const hasMetricName = /^[a-z_]+/m.test(body);
      
      expect(hasHelpOrType).toBe(true);
      expect(hasMetricName).toBe(true);
    });
    
  });
  
});

