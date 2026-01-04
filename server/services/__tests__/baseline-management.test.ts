/**
 * Baseline Management Tests
 * 
 * Tests for baseline creation, comparison, and listing functionality.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

// Test fixtures
const mockParityReport = {
  timestamp: '2025-01-04T10:00:00.000Z',
  datasetVersion: '1.0.0',
  thresholdVersion: '1.0.0',
  status: 'pass' as const,
  passRate: 85.5,
  totalFields: 100,
  passedFields: 85,
  failedFields: 15,
  bySeverity: {
    critical: { passed: 20, total: 20 },
    high: { passed: 30, total: 35 },
    medium: { passed: 25, total: 30 },
    low: { passed: 10, total: 15 }
  },
  byReasonCode: {
    FIELD_MISSING: { total: 5 },
    VALUE_MISMATCH: { total: 10 }
  },
  docResults: [
    { id: 'doc-1', name: 'Test Doc 1', status: 'pass', passRate: 90 },
    { id: 'doc-2', name: 'Test Doc 2', status: 'pass', passRate: 80 }
  ],
  violations: []
};

const mockBaseline = {
  version: '1.0.0',
  createdAt: '2025-01-04T09:00:00.000Z',
  createdBy: 'test-user',
  contentHash: 'sha256:abc123',
  sourceReport: {
    timestamp: '2025-01-04T08:00:00.000Z',
    datasetVersion: '1.0.0',
    thresholdVersion: '1.0.0'
  },
  metrics: {
    passRate: 80.0,
    totalFields: 100,
    passedFields: 80,
    failedFields: 20,
    bySeverity: {
      critical: { passed: 18, total: 20 },
      high: { passed: 28, total: 35 },
      medium: { passed: 24, total: 30 },
      low: { passed: 10, total: 15 }
    }
  },
  docResults: [
    { id: 'doc-1', name: 'Test Doc 1', status: 'pass', passRate: 85 },
    { id: 'doc-2', name: 'Test Doc 2', status: 'pass', passRate: 75 }
  ]
};

describe('Baseline Management', () => {
  describe('Baseline Structure Validation', () => {
    it('should have required fields in baseline structure', () => {
      const requiredFields = [
        'version',
        'createdAt',
        'createdBy',
        'contentHash',
        'sourceReport',
        'metrics',
        'docResults'
      ];
      
      requiredFields.forEach(field => {
        expect(mockBaseline).toHaveProperty(field);
      });
    });
    
    it('should have required fields in metrics', () => {
      const requiredMetrics = [
        'passRate',
        'totalFields',
        'passedFields',
        'failedFields',
        'bySeverity'
      ];
      
      requiredMetrics.forEach(field => {
        expect(mockBaseline.metrics).toHaveProperty(field);
      });
    });
    
    it('should have valid semver format for version', () => {
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
      expect(mockBaseline.version).toMatch(semverRegex);
    });
    
    it('should have valid ISO timestamp for createdAt', () => {
      const date = new Date(mockBaseline.createdAt);
      expect(date.toISOString()).toBe(mockBaseline.createdAt);
    });
    
    it('should have valid content hash format', () => {
      expect(mockBaseline.contentHash).toMatch(/^sha256:[a-f0-9]+$/);
    });
  });
  
  describe('Content Hash Computation', () => {
    it('should produce deterministic hash for same input', () => {
      const input = JSON.stringify({
        version: '1.0.0',
        sourceReport: mockBaseline.sourceReport,
        metrics: mockBaseline.metrics,
        docResults: mockBaseline.docResults
      });
      
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce different hash for different input', () => {
      const input1 = JSON.stringify({ version: '1.0.0', data: 'test1' });
      const input2 = JSON.stringify({ version: '1.0.0', data: 'test2' });
      
      const hash1 = computeHash(input1);
      const hash2 = computeHash(input2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe('Baseline Comparison Logic', () => {
    it('should detect improvement when pass rate increases', () => {
      const baselineRate = 80.0;
      const currentRate = 85.5;
      const delta = currentRate - baselineRate;
      
      expect(delta).toBeGreaterThan(0);
      expect(classifyDelta(delta)).toBe('improved');
    });
    
    it('should detect regression when pass rate decreases', () => {
      const baselineRate = 85.5;
      const currentRate = 80.0;
      const delta = currentRate - baselineRate;
      
      expect(delta).toBeLessThan(0);
      expect(classifyDelta(delta)).toBe('regressed');
    });
    
    it('should detect same when pass rate is within threshold', () => {
      const baselineRate = 85.0;
      const currentRate = 85.05;
      const delta = currentRate - baselineRate;
      
      expect(Math.abs(delta)).toBeLessThan(0.1);
      expect(classifyDelta(delta)).toBe('same');
    });
    
    it('should correctly compare document results', () => {
      const comparison = compareDocResults(
        mockBaseline.docResults,
        mockParityReport.docResults
      );
      
      expect(comparison).toHaveLength(2);
      expect(comparison[0].id).toBe('doc-1');
      expect(comparison[0].status).toBe('improved'); // 85 -> 90
      expect(comparison[1].id).toBe('doc-2');
      expect(comparison[1].status).toBe('improved'); // 75 -> 80
    });
    
    it('should handle new documents in comparison', () => {
      const currentDocs = [
        ...mockParityReport.docResults,
        { id: 'doc-3', name: 'New Doc', status: 'pass', passRate: 95 }
      ];
      
      const comparison = compareDocResults(
        mockBaseline.docResults,
        currentDocs
      );
      
      const newDoc = comparison.find(d => d.id === 'doc-3');
      expect(newDoc).toBeDefined();
      expect(newDoc?.status).toBe('new');
    });
    
    it('should handle removed documents in comparison', () => {
      const currentDocs = [mockParityReport.docResults[0]]; // Only doc-1
      
      const comparison = compareDocResults(
        mockBaseline.docResults,
        currentDocs
      );
      
      const removedDoc = comparison.find(d => d.id === 'doc-2');
      expect(removedDoc).toBeDefined();
      expect(removedDoc?.status).toBe('regressed');
    });
  });
  
  describe('Severity Comparison', () => {
    it('should compare severity tiers correctly', () => {
      const comparison = compareSeverities(
        mockBaseline.metrics.bySeverity,
        mockParityReport.bySeverity
      );
      
      expect(comparison).toHaveLength(4);
      
      const critical = comparison.find(s => s.severity === 'critical');
      expect(critical?.status).toBe('improved'); // 18/20 -> 20/20
      
      const high = comparison.find(s => s.severity === 'high');
      expect(high?.status).toBe('improved'); // 28/35 -> 30/35
    });
    
    it('should calculate severity rates correctly', () => {
      const rate = calculateSeverityRate({ passed: 20, total: 25 });
      expect(rate).toBe(80);
    });
    
    it('should handle zero total gracefully', () => {
      const rate = calculateSeverityRate({ passed: 0, total: 0 });
      expect(rate).toBe(0);
    });
  });
  
  describe('Threshold Violations', () => {
    it('should detect overall pass rate violation', () => {
      const violations = checkViolations(
        { passRate: 75, bySeverity: {} },
        { overall: { minPassRate: 0.85, maxWorseCount: 5 }, bySeverity: {} }
      );
      
      expect(violations.some(v => v.includes('Overall pass rate'))).toBe(true);
    });
    
    it('should detect severity threshold violation', () => {
      const violations = checkViolations(
        { 
          passRate: 90, 
          bySeverity: { critical: { passed: 15, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { critical: { minPassRate: 0.90, maxWorseCount: 0 } }
        }
      );
      
      expect(violations.some(v => v.includes('critical pass rate'))).toBe(true);
    });
    
    it('should pass when all thresholds met', () => {
      const violations = checkViolations(
        { 
          passRate: 90, 
          bySeverity: { critical: { passed: 19, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { critical: { minPassRate: 0.90, maxWorseCount: 0 } }
        }
      );
      
      expect(violations).toHaveLength(0);
    });
  });
  
  describe('Deterministic Ordering', () => {
    it('should sort document results by id', () => {
      const unsorted = [
        { id: 'doc-3', name: 'C', status: 'pass', passRate: 90 },
        { id: 'doc-1', name: 'A', status: 'pass', passRate: 85 },
        { id: 'doc-2', name: 'B', status: 'pass', passRate: 80 }
      ];
      
      const sorted = [...unsorted].sort((a, b) => a.id.localeCompare(b.id));
      
      expect(sorted[0].id).toBe('doc-1');
      expect(sorted[1].id).toBe('doc-2');
      expect(sorted[2].id).toBe('doc-3');
    });
    
    it('should sort severities alphabetically', () => {
      const severities = ['medium', 'critical', 'low', 'high'];
      const sorted = [...severities].sort();
      
      expect(sorted).toEqual(['critical', 'high', 'low', 'medium']);
    });
  });
});

// Helper functions for testing (mirroring script logic)

function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function classifyDelta(delta: number): 'improved' | 'same' | 'regressed' {
  if (delta > 0.1) return 'improved';
  if (delta < -0.1) return 'regressed';
  return 'same';
}

function compareDocResults(
  baseline: Array<{ id: string; name: string; status: string; passRate: number }>,
  current: Array<{ id: string; name: string; status: string; passRate: number }>
): Array<{ id: string; name: string; status: 'improved' | 'same' | 'regressed' | 'new' }> {
  const baselineMap = new Map(baseline.map(d => [d.id, d]));
  const currentMap = new Map(current.map(d => [d.id, d]));
  const allIds = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  
  return Array.from(allIds).sort().map(id => {
    const baselineDoc = baselineMap.get(id);
    const currentDoc = currentMap.get(id);
    
    if (!baselineDoc) {
      return { id, name: currentDoc!.name, status: 'new' as const };
    }
    
    if (!currentDoc) {
      return { id, name: baselineDoc.name, status: 'regressed' as const };
    }
    
    const delta = currentDoc.passRate - baselineDoc.passRate;
    return {
      id,
      name: currentDoc.name,
      status: classifyDelta(delta)
    };
  });
}

function compareSeverities(
  baseline: Record<string, { passed: number; total: number }>,
  current: Record<string, { passed: number; total: number }>
): Array<{ severity: string; status: 'improved' | 'same' | 'regressed' }> {
  const severities = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  
  return Array.from(severities).sort().map(sev => {
    const baselineData = baseline[sev] || { passed: 0, total: 0 };
    const currentData = current[sev] || { passed: 0, total: 0 };
    
    const baselineRate = calculateSeverityRate(baselineData);
    const currentRate = calculateSeverityRate(currentData);
    const delta = currentRate - baselineRate;
    
    return {
      severity: sev,
      status: classifyDelta(delta)
    };
  });
}

function calculateSeverityRate(data: { passed: number; total: number }): number {
  return data.total > 0 ? (data.passed / data.total) * 100 : 0;
}

function checkViolations(
  metrics: { passRate: number; bySeverity: Record<string, { passed: number; total: number }> },
  thresholds: { 
    overall: { minPassRate: number; maxWorseCount: number };
    bySeverity: Record<string, { minPassRate: number; maxWorseCount: number }>;
  }
): string[] {
  const violations: string[] = [];
  
  if (metrics.passRate < thresholds.overall.minPassRate * 100) {
    violations.push(`Overall pass rate ${metrics.passRate}% below threshold ${thresholds.overall.minPassRate * 100}%`);
  }
  
  Object.entries(metrics.bySeverity).forEach(([sev, data]) => {
    const sevThreshold = thresholds.bySeverity[sev];
    if (sevThreshold) {
      const rate = calculateSeverityRate(data);
      if (rate < sevThreshold.minPassRate * 100) {
        violations.push(`${sev} pass rate ${rate.toFixed(1)}% below threshold ${sevThreshold.minPassRate * 100}%`);
      }
    }
  });
  
  return violations;
}
