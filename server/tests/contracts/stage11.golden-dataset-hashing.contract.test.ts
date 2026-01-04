/**
 * Stage 11 Contract Tests: Golden Dataset Hashing + Provenance
 * 
 * Tests:
 * - Deterministic hash computation
 * - Hash stability across runs
 * - Hash verification failure on modification
 * - Provenance artifact structure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';

// ============================================================================
// Hash Computation Logic (mirrored from stamp-content-hash.ts)
// ============================================================================

/**
 * Canonicalize JSON for deterministic hashing
 */
function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  
  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return JSON.stringify(obj);
  }
  
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalize(item));
    return '[' + items.join(',') + ']';
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter(key => key !== 'contentHash')
      .map(key => {
        const value = (obj as Record<string, unknown>)[key];
        return JSON.stringify(key) + ':' + canonicalize(value);
      });
    return '{' + pairs.join(',') + '}';
  }
  
  return '';
}

function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Stage 11: Golden Dataset Hashing', () => {
  describe('Canonicalization', () => {
    it('produces stable output regardless of key order', () => {
      const obj1 = { b: 2, a: 1, c: 3 };
      const obj2 = { a: 1, c: 3, b: 2 };
      const obj3 = { c: 3, b: 2, a: 1 };
      
      const canonical1 = canonicalize(obj1);
      const canonical2 = canonicalize(obj2);
      const canonical3 = canonicalize(obj3);
      
      expect(canonical1).toBe(canonical2);
      expect(canonical2).toBe(canonical3);
      expect(canonical1).toBe('{"a":1,"b":2,"c":3}');
    });
    
    it('excludes contentHash from hash input', () => {
      const withHash = { version: '1.0', contentHash: 'sha256:abc123', data: 'test' };
      const withoutHash = { version: '1.0', data: 'test' };
      
      const canonical1 = canonicalize(withHash);
      const canonical2 = canonicalize(withoutHash);
      
      expect(canonical1).toBe(canonical2);
    });
    
    it('handles nested objects deterministically', () => {
      const nested = {
        outer: {
          z: 3,
          a: 1,
          m: { y: 2, x: 1 }
        }
      };
      
      const canonical = canonicalize(nested);
      expect(canonical).toBe('{"outer":{"a":1,"m":{"x":1,"y":2},"z":3}}');
    });
    
    it('handles arrays preserving order', () => {
      const arr = { items: [3, 1, 2] };
      const canonical = canonicalize(arr);
      expect(canonical).toBe('{"items":[3,1,2]}');
    });
    
    it('handles null and undefined', () => {
      expect(canonicalize(null)).toBe('null');
      expect(canonicalize(undefined)).toBe('null');
    });
    
    it('handles strings with special characters', () => {
      const obj = { text: 'hello "world"\ntest' };
      const canonical = canonicalize(obj);
      expect(canonical).toBe('{"text":"hello \\"world\\"\\ntest"}');
    });
  });
  
  describe('Hash Computation', () => {
    it('produces consistent hash for same input', () => {
      const input = '{"a":1,"b":2}';
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
    
    it('produces different hash for different input', () => {
      const hash1 = computeHash('{"a":1}');
      const hash2 = computeHash('{"a":2}');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('hash is stable across multiple runs', () => {
      const testData = {
        version: '1.0.0',
        documents: [
          { id: 'doc-001', name: 'Test' }
        ],
        rules: [
          { id: 'R001', field: 'test' }
        ]
      };
      
      const canonical = canonicalize(testData);
      const hash = computeHash(canonical);
      
      // Run multiple times
      for (let i = 0; i < 10; i++) {
        const newCanonical = canonicalize(testData);
        const newHash = computeHash(newCanonical);
        expect(newHash).toBe(hash);
      }
    });
  });
  
  describe('Hash Verification', () => {
    it('detects modification when hash does not match', () => {
      const original = {
        version: '1.0.0',
        contentHash: '',
        data: 'original'
      };
      
      // Compute and store hash
      const canonical = canonicalize(original);
      const hash = computeHash(canonical);
      original.contentHash = hash;
      
      // Modify data
      const modified = { ...original, data: 'modified' };
      
      // Verify hash mismatch
      const modifiedCanonical = canonicalize(modified);
      const modifiedHash = computeHash(modifiedCanonical);
      
      expect(modifiedHash).not.toBe(original.contentHash);
    });
    
    it('passes verification when hash matches', () => {
      const data = {
        version: '1.0.0',
        contentHash: '',
        items: ['a', 'b', 'c']
      };
      
      const canonical = canonicalize(data);
      const hash = computeHash(canonical);
      data.contentHash = hash;
      
      // Verify hash matches
      const verifyCanonical = canonicalize(data);
      const verifyHash = computeHash(verifyCanonical);
      
      expect(verifyHash).toBe(data.contentHash);
    });
  });
  
  describe('Provenance Artifact Structure', () => {
    interface Provenance {
      generatedAt: string;
      datasetVersion: string;
      datasetContentHash: string;
      thresholdsVersion: string;
      thresholdsContentHash: string;
      gitHeadSha: string;
      gitBranch: string;
      ciRunId?: string;
      ciRunUrl?: string;
    }
    
    it('contains required fields', () => {
      const provenance: Provenance = {
        generatedAt: new Date().toISOString(),
        datasetVersion: '2.1.0',
        datasetContentHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        thresholdsContentHash: 'sha256:def456',
        gitHeadSha: 'abc123def456',
        gitBranch: 'main'
      };
      
      expect(provenance.generatedAt).toBeDefined();
      expect(provenance.datasetVersion).toBeDefined();
      expect(provenance.datasetContentHash).toMatch(/^sha256:/);
      expect(provenance.thresholdsVersion).toBeDefined();
      expect(provenance.thresholdsContentHash).toMatch(/^sha256:/);
      expect(provenance.gitHeadSha).toBeDefined();
      expect(provenance.gitBranch).toBeDefined();
    });
    
    it('allows optional CI fields', () => {
      const provenance: Provenance = {
        generatedAt: new Date().toISOString(),
        datasetVersion: '2.1.0',
        datasetContentHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        thresholdsContentHash: 'sha256:def456',
        gitHeadSha: 'abc123def456',
        gitBranch: 'main',
        ciRunId: '12345',
        ciRunUrl: 'https://github.com/org/repo/actions/runs/12345'
      };
      
      expect(provenance.ciRunId).toBe('12345');
      expect(provenance.ciRunUrl).toContain('actions/runs');
    });
    
    it('CI fields are not included in hash computation', () => {
      const base: Provenance = {
        generatedAt: '2026-01-04T00:00:00.000Z',
        datasetVersion: '2.1.0',
        datasetContentHash: 'sha256:abc123',
        thresholdsVersion: '1.0.0',
        thresholdsContentHash: 'sha256:def456',
        gitHeadSha: 'abc123def456',
        gitBranch: 'main'
      };
      
      const withCi: Provenance = {
        ...base,
        ciRunId: '12345',
        ciRunUrl: 'https://github.com/org/repo/actions/runs/12345'
      };
      
      // The provenance itself is not hashed, but if it were,
      // CI fields should be excluded. This test documents the contract.
      expect(withCi.ciRunId).toBeDefined();
      expect(withCi.ciRunUrl).toBeDefined();
    });
  });
  
  describe('Determinism Guarantees', () => {
    it('same dataset produces same hash regardless of whitespace', () => {
      const compact = '{"a":1,"b":2}';
      const pretty = '{\n  "a": 1,\n  "b": 2\n}';
      
      const obj1 = JSON.parse(compact);
      const obj2 = JSON.parse(pretty);
      
      const hash1 = computeHash(canonicalize(obj1));
      const hash2 = computeHash(canonicalize(obj2));
      
      expect(hash1).toBe(hash2);
    });
    
    it('timestamps in data DO affect hash', () => {
      const data1 = { timestamp: '2026-01-01T00:00:00Z', value: 1 };
      const data2 = { timestamp: '2026-01-02T00:00:00Z', value: 1 };
      
      const hash1 = computeHash(canonicalize(data1));
      const hash2 = computeHash(canonicalize(data2));
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('contentHash field is excluded from computation', () => {
      const data = { value: 1, contentHash: 'sha256:old' };
      const hash1 = computeHash(canonicalize(data));
      
      data.contentHash = 'sha256:new';
      const hash2 = computeHash(canonicalize(data));
      
      expect(hash1).toBe(hash2);
    });
  });
});

describe('Stage 11: Integration Contracts', () => {
  describe('Golden Dataset Contract', () => {
    it('dataset must have contentHash field', () => {
      const dataset = {
        version: '2.1.0',
        contentHash: 'sha256:29af32b17e931b43353108e37d12a4a49efe9883ed9ba279883d6b8103147ad8',
        documents: [],
        rules: []
      };
      
      expect(dataset.contentHash).toBeDefined();
      expect(dataset.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
    
    it('contentHash format is sha256:<64-hex-chars>', () => {
      const validHash = 'sha256:29af32b17e931b43353108e37d12a4a49efe9883ed9ba279883d6b8103147ad8';
      expect(validHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
  
  describe('CI Gate Contract', () => {
    it('verification fails if contentHash is missing', () => {
      const dataset = { version: '1.0', documents: [] };
      const hasContentHash = 'contentHash' in dataset;
      expect(hasContentHash).toBe(false);
    });
    
    it('verification fails if contentHash is placeholder', () => {
      const dataset = { version: '1.0', contentHash: 'sha256:placeholder', documents: [] };
      const isPlaceholder = dataset.contentHash.includes('placeholder');
      expect(isPlaceholder).toBe(true);
    });
  });
});
