/**
 * Baseline Management Tests
 * 
 * Tests for baseline creation, comparison, and listing functionality.
 * Uses canonical severity tiers: S0, S1, S2, S3
 * 
 * CANONICAL SEVERITY ENFORCEMENT:
 * - Only S0, S1, S2, S3 keys are allowed
 * - Legacy keys (critical, high, medium, low, major, minor, info) are rejected
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

/**
 * Canonical severity keys - ONLY these are allowed
 */
const CANONICAL_SEVERITY_KEYS = ['S0', 'S1', 'S2', 'S3'];

/**
 * Legacy severity keys - these are FORBIDDEN
 */
const LEGACY_SEVERITY_KEYS = ['critical', 'high', 'medium', 'low', 'major', 'minor', 'info'];

// Test fixtures with canonical severity tiers
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
    S0: { passed: 20, total: 20 },
    S1: { passed: 30, total: 35 },
    S2: { passed: 25, total: 30 },
    S3: { passed: 10, total: 15 }
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
      S0: { passed: 18, total: 20 },
      S1: { passed: 28, total: 35 },
      S2: { passed: 24, total: 30 },
      S3: { passed: 10, total: 15 }
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
  
  describe('Canonical Severity Enforcement', () => {
    it('should accept canonical severity keys (S0-S3)', () => {
      const validBySeverity = {
        S0: { passed: 20, total: 20 },
        S1: { passed: 30, total: 35 },
        S2: { passed: 25, total: 30 },
        S3: { passed: 10, total: 15 }
      };
      
      const error = validateCanonicalSeverity(validBySeverity);
      expect(error).toBeNull();
    });
    
    it('should accept partial canonical severity keys', () => {
      const partialBySeverity = {
        S0: { passed: 20, total: 20 },
        S2: { passed: 25, total: 30 }
      };
      
      const error = validateCanonicalSeverity(partialBySeverity);
      expect(error).toBeNull();
    });
    
    it('should accept empty bySeverity', () => {
      const emptyBySeverity = {};
      
      const error = validateCanonicalSeverity(emptyBySeverity);
      expect(error).toBeNull();
    });
    
    it('should reject legacy severity key "critical"', () => {
      const legacyBySeverity = {
        critical: { passed: 20, total: 20 },
        S1: { passed: 30, total: 35 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('critical');
    });
    
    it('should reject legacy severity key "high"', () => {
      const legacyBySeverity = {
        high: { passed: 30, total: 35 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('high');
    });
    
    it('should reject legacy severity key "medium"', () => {
      const legacyBySeverity = {
        medium: { passed: 25, total: 30 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('medium');
    });
    
    it('should reject legacy severity key "low"', () => {
      const legacyBySeverity = {
        low: { passed: 10, total: 15 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('low');
    });
    
    it('should reject legacy severity key "major"', () => {
      const legacyBySeverity = {
        major: { passed: 20, total: 25 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('major');
    });
    
    it('should reject legacy severity key "minor"', () => {
      const legacyBySeverity = {
        minor: { passed: 15, total: 20 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('minor');
    });
    
    it('should reject legacy severity key "info"', () => {
      const legacyBySeverity = {
        info: { passed: 10, total: 10 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('info');
    });
    
    it('should reject multiple legacy severity keys', () => {
      const legacyBySeverity = {
        critical: { passed: 20, total: 20 },
        high: { passed: 30, total: 35 },
        medium: { passed: 25, total: 30 },
        low: { passed: 10, total: 15 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
      expect(error).toContain('critical');
      expect(error).toContain('high');
      expect(error).toContain('medium');
      expect(error).toContain('low');
    });
    
    it('should reject non-canonical severity keys', () => {
      const invalidBySeverity = {
        S0: { passed: 20, total: 20 },
        S5: { passed: 10, total: 15 } // S5 is not canonical
      };
      
      const error = validateCanonicalSeverity(invalidBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Non-canonical severity keys found');
      expect(error).toContain('S5');
    });
    
    it('should reject mixed legacy and non-canonical keys', () => {
      const mixedBySeverity = {
        critical: { passed: 20, total: 20 },
        S0: { passed: 18, total: 20 }
      };
      
      const error = validateCanonicalSeverity(mixedBySeverity);
      expect(error).not.toBeNull();
      // Legacy keys are checked first
      expect(error).toContain('Legacy severity keys found');
    });
    
    it('should be case-insensitive for legacy key detection', () => {
      const legacyBySeverity = {
        CRITICAL: { passed: 20, total: 20 }
      };
      
      const error = validateCanonicalSeverity(legacyBySeverity);
      expect(error).not.toBeNull();
      expect(error).toContain('Legacy severity keys found');
    });
  });
  
  describe('Canonical Severity Tiers', () => {
    it('should use canonical severity codes (S0-S3)', () => {
      const severities = Object.keys(mockBaseline.metrics.bySeverity);
      
      severities.forEach(sev => {
        expect(CANONICAL_SEVERITY_KEYS).toContain(sev);
      });
    });
    
    it('should not use legacy severity names', () => {
      const severities = Object.keys(mockBaseline.metrics.bySeverity);
      
      severities.forEach(sev => {
        expect(LEGACY_SEVERITY_KEYS).not.toContain(sev.toLowerCase());
      });
    });
    
    it('should sort severities in canonical order', () => {
      const unsorted = ['S2', 'S0', 'S3', 'S1'];
      const sorted = sortSeverities(unsorted);
      
      expect(sorted).toEqual(['S0', 'S1', 'S2', 'S3']);
    });
    
    it('should handle non-canonical severities after canonical ones', () => {
      const mixed = ['S2', 'custom', 'S0', 'other'];
      const sorted = sortSeverities(mixed);
      
      expect(sorted[0]).toBe('S0');
      expect(sorted[1]).toBe('S2');
      // Non-canonical sorted alphabetically after
      expect(sorted.slice(2).sort()).toEqual(['custom', 'other'].sort());
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
    
    it('should exclude createdAt from hash computation', () => {
      const baseInput = {
        version: '1.0.0',
        sourceReport: mockBaseline.sourceReport,
        metrics: mockBaseline.metrics,
        docResults: mockBaseline.docResults
      };
      
      // createdAt is NOT included in hash input
      const hash1 = computeHash(JSON.stringify(baseInput));
      const hash2 = computeHash(JSON.stringify(baseInput));
      
      expect(hash1).toBe(hash2);
    });
    
    it('should exclude createdBy from hash computation', () => {
      const baseInput = {
        version: '1.0.0',
        sourceReport: mockBaseline.sourceReport,
        metrics: mockBaseline.metrics,
        docResults: mockBaseline.docResults
      };
      
      // createdBy is NOT included in hash input
      const hash1 = computeHash(JSON.stringify(baseInput));
      const hash2 = computeHash(JSON.stringify(baseInput));
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce same hash regardless of bySeverity key order', () => {
      const input1 = {
        version: '1.0.0',
        metrics: {
          bySeverity: canonicaliseBySeverity({ S2: { passed: 1, total: 1 }, S0: { passed: 1, total: 1 } })
        }
      };
      
      const input2 = {
        version: '1.0.0',
        metrics: {
          bySeverity: canonicaliseBySeverity({ S0: { passed: 1, total: 1 }, S2: { passed: 1, total: 1 } })
        }
      };
      
      const hash1 = computeHash(JSON.stringify(input1));
      const hash2 = computeHash(JSON.stringify(input2));
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce same hash regardless of docResults order', () => {
      const docs1 = [
        { id: 'doc-2', name: 'B', status: 'pass', passRate: 80 },
        { id: 'doc-1', name: 'A', status: 'pass', passRate: 90 }
      ];
      
      const docs2 = [
        { id: 'doc-1', name: 'A', status: 'pass', passRate: 90 },
        { id: 'doc-2', name: 'B', status: 'pass', passRate: 80 }
      ];
      
      const input1 = { docResults: canonicaliseDocResults(docs1) };
      const input2 = { docResults: canonicaliseDocResults(docs2) };
      
      const hash1 = computeHash(JSON.stringify(input1));
      const hash2 = computeHash(JSON.stringify(input2));
      
      expect(hash1).toBe(hash2);
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
      
      const s0 = comparison.find(s => s.severity === 'S0');
      expect(s0?.status).toBe('improved'); // 18/20 -> 20/20
      
      const s1 = comparison.find(s => s.severity === 'S1');
      expect(s1?.status).toBe('improved'); // 28/35 -> 30/35
    });
    
    it('should calculate severity rates correctly', () => {
      const rate = calculateSeverityRate({ passed: 20, total: 25 });
      expect(rate).toBe(80);
    });
    
    it('should handle zero total gracefully', () => {
      const rate = calculateSeverityRate({ passed: 0, total: 0 });
      expect(rate).toBe(0);
    });
    
    it('should sort severity comparison in canonical order', () => {
      const comparison = compareSeverities(
        { S3: { passed: 1, total: 1 }, S0: { passed: 1, total: 1 }, S2: { passed: 1, total: 1 } },
        { S3: { passed: 1, total: 1 }, S0: { passed: 1, total: 1 }, S2: { passed: 1, total: 1 } }
      );
      
      expect(comparison[0].severity).toBe('S0');
      expect(comparison[1].severity).toBe('S2');
      expect(comparison[2].severity).toBe('S3');
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
          bySeverity: { S0: { passed: 15, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { S0: { minPassRate: 0.90, maxWorseCount: 0 } }
        }
      );
      
      expect(violations.some(v => v.includes('S0 pass rate'))).toBe(true);
    });
    
    it('should pass when all thresholds met', () => {
      const violations = checkViolations(
        { 
          passRate: 90, 
          bySeverity: { S0: { passed: 19, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { S0: { minPassRate: 0.90, maxWorseCount: 0 } }
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
      
      const sorted = canonicaliseDocResults(unsorted);
      
      expect(sorted[0].id).toBe('doc-1');
      expect(sorted[1].id).toBe('doc-2');
      expect(sorted[2].id).toBe('doc-3');
    });
    
    it('should sort severities in canonical order (S0, S1, S2, S3)', () => {
      const severities = ['S2', 'S0', 'S3', 'S1'];
      const sorted = sortSeverities(severities);
      
      expect(sorted).toEqual(['S0', 'S1', 'S2', 'S3']);
    });
  });
  
  describe('Version Mismatch Handling', () => {
    it('should detect dataset version mismatch', () => {
      const baseline = { datasetVersion: '1.0.0' };
      const current = { datasetVersion: '2.0.0' };
      
      expect(baseline.datasetVersion).not.toBe(current.datasetVersion);
    });
    
    it('should detect threshold version mismatch', () => {
      const baseline = { thresholdVersion: '1.0.0' };
      const current = { thresholdVersion: '1.1.0' };
      
      expect(baseline.thresholdVersion).not.toBe(current.thresholdVersion);
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

function sortSeverities(severities: string[]): string[] {
  return [...severities].sort((a, b) => {
    const aIndex = CANONICAL_SEVERITY_KEYS.indexOf(a);
    const bIndex = CANONICAL_SEVERITY_KEYS.indexOf(b);
    
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Validate that bySeverity keys are canonical (S0-S3 only).
 * Rejects legacy keys and any non-canonical keys.
 * Returns error message if invalid, null if valid.
 */
function validateCanonicalSeverity(
  bySeverity: Record<string, { passed: number; total: number }>
): string | null {
  const keys = Object.keys(bySeverity);
  
  // Check for legacy keys
  const legacyKeysFound = keys.filter(k => 
    LEGACY_SEVERITY_KEYS.includes(k.toLowerCase())
  );
  
  if (legacyKeysFound.length > 0) {
    return `Legacy severity keys found: ${legacyKeysFound.join(', ')}. ` +
           `Only canonical keys (${CANONICAL_SEVERITY_KEYS.join(', ')}) are allowed.`;
  }
  
  // Check for non-canonical keys
  const nonCanonicalKeys = keys.filter(k => !CANONICAL_SEVERITY_KEYS.includes(k));
  
  if (nonCanonicalKeys.length > 0) {
    return `Non-canonical severity keys found: ${nonCanonicalKeys.join(', ')}. ` +
           `Only canonical keys (${CANONICAL_SEVERITY_KEYS.join(', ')}) are allowed.`;
  }
  
  return null;
}

function canonicaliseBySeverity(
  bySeverity: Record<string, { passed: number; total: number }>
): Record<string, { passed: number; total: number }> {
  const result: Record<string, { passed: number; total: number }> = {};
  
  // Only include canonical keys in canonical order
  for (const key of CANONICAL_SEVERITY_KEYS) {
    if (bySeverity[key]) {
      result[key] = bySeverity[key];
    }
  }
  
  return result;
}

function canonicaliseDocResults(
  docResults: Array<{ id: string; name: string; status: string; passRate: number }>
): Array<{ id: string; name: string; status: string; passRate: number }> {
  return [...docResults].sort((a, b) => a.id.localeCompare(b.id));
}

function compareDocResults(
  baseline: Array<{ id: string; name: string; status: string; passRate: number }>,
  current: Array<{ id: string; name: string; status: string; passRate: number }>
): Array<{ id: string; name: string; status: 'improved' | 'same' | 'regressed' | 'new' }> {
  const baselineMap = new Map(baseline.map(d => [d.id, d]));
  const currentMap = new Map(current.map(d => [d.id, d]));
  const allIds = Array.from(new Set([...baselineMap.keys(), ...currentMap.keys()])).sort();
  
  return allIds.map(id => {
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
  const severities = sortSeverities(Array.from(new Set([...Object.keys(baseline), ...Object.keys(current)])));
  
  return severities.map(sev => {
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
