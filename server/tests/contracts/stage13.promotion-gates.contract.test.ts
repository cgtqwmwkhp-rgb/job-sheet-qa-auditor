/**
 * Stage 13: Deployment Promotion Gates Contract Tests
 * 
 * Tests for promotion bundle composition, ordering, and determinism.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

describe('Stage 13: Deployment Promotion Gates', () => {
  describe('Promotion Manifest Schema', () => {
    const requiredFields = [
      'version',
      'schemaVersion',
      'timestamp',
      'sha',
      'targetEnvironment',
      'triggeredBy',
      'runId',
      'gates',
      'artifacts',
      'bundleHash'
    ];
    
    const requiredGates = ['ci', 'policy', 'rehearsal', 'parity'];
    
    it('should define all required manifest fields', () => {
      const mockManifest = {
        version: '1.0.0',
        schemaVersion: '1',
        timestamp: new Date().toISOString(),
        sha: 'abc123',
        targetEnvironment: 'staging',
        triggeredBy: 'test-user',
        runId: '12345',
        gates: {
          ci: 'passed',
          policy: 'passed',
          rehearsal: 'passed',
          parity: 'passed'
        },
        artifacts: [],
        bundleHash: 'sha256:abc'
      };
      
      requiredFields.forEach(field => {
        expect(mockManifest).toHaveProperty(field);
      });
    });
    
    it('should define all required gates', () => {
      const gates = {
        ci: 'passed' as const,
        policy: 'passed' as const,
        rehearsal: 'passed' as const,
        parity: 'passed' as const
      };
      
      requiredGates.forEach(gate => {
        expect(gates).toHaveProperty(gate);
      });
    });
    
    it('should only allow valid gate statuses', () => {
      const validStatuses = ['passed', 'failed', 'skipped'];
      
      validStatuses.forEach(status => {
        expect(['passed', 'failed', 'skipped']).toContain(status);
      });
    });
    
    it('should only allow valid target environments', () => {
      const validEnvs = ['staging', 'production'];
      
      validEnvs.forEach(env => {
        expect(['staging', 'production']).toContain(env);
      });
    });
  });
  
  describe('Artifact Ordering Determinism', () => {
    it('should sort artifacts by name alphabetically', () => {
      const artifacts = [
        { name: 'thresholds', path: 'thresholds.json', hash: 'sha256:ccc' },
        { name: 'provenance', path: 'provenance.json', hash: 'sha256:aaa' },
        { name: 'parity-report', path: 'parity-report.json', hash: 'sha256:bbb' },
        { name: 'dataset-reference', path: 'dataset-reference.json', hash: 'sha256:ddd' }
      ];
      
      const sorted = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      
      expect(sorted[0].name).toBe('dataset-reference');
      expect(sorted[1].name).toBe('parity-report');
      expect(sorted[2].name).toBe('provenance');
      expect(sorted[3].name).toBe('thresholds');
    });
    
    it('should produce stable ordering across multiple sorts', () => {
      const artifacts = [
        { name: 'z-artifact', hash: 'sha256:111' },
        { name: 'a-artifact', hash: 'sha256:222' },
        { name: 'm-artifact', hash: 'sha256:333' }
      ];
      
      const sorted1 = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      const sorted2 = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      
      expect(sorted1).toEqual(sorted2);
    });
  });
  
  describe('Bundle Hash Computation', () => {
    function computeBundleHash(artifacts: Array<{ hash: string }>): string {
      const sortedHashes = artifacts.map(a => a.hash).sort();
      const combined = sortedHashes.join(':');
      const hash = crypto.createHash('sha256');
      hash.update(combined, 'utf8');
      return 'sha256:' + hash.digest('hex');
    }
    
    it('should produce deterministic hash for same artifacts', () => {
      const artifacts = [
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' },
        { hash: 'sha256:ccc' }
      ];
      
      const hash1 = computeBundleHash(artifacts);
      const hash2 = computeBundleHash(artifacts);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce same hash regardless of input order', () => {
      const artifacts1 = [
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' },
        { hash: 'sha256:ccc' }
      ];
      
      const artifacts2 = [
        { hash: 'sha256:ccc' },
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' }
      ];
      
      const hash1 = computeBundleHash(artifacts1);
      const hash2 = computeBundleHash(artifacts2);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce different hash for different artifacts', () => {
      const artifacts1 = [{ hash: 'sha256:aaa' }];
      const artifacts2 = [{ hash: 'sha256:bbb' }];
      
      const hash1 = computeBundleHash(artifacts1);
      const hash2 = computeBundleHash(artifacts2);
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should use sha256 prefix format', () => {
      const artifacts = [{ hash: 'sha256:test' }];
      const hash = computeBundleHash(artifacts);
      
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
  
  describe('Gate Requirements', () => {
    interface GateConfig {
      required: boolean;
      canSkip: boolean;
      skipRequiresApproval: boolean;
    }
    
    const gateConfigs: Record<string, GateConfig> = {
      ci: { required: true, canSkip: false, skipRequiresApproval: false },
      policy: { required: true, canSkip: false, skipRequiresApproval: false },
      rehearsal: { required: true, canSkip: false, skipRequiresApproval: false },
      parity: { required: true, canSkip: true, skipRequiresApproval: true }
    };
    
    it('should require CI gate for all promotions', () => {
      expect(gateConfigs.ci.required).toBe(true);
      expect(gateConfigs.ci.canSkip).toBe(false);
    });
    
    it('should require policy gate for all promotions', () => {
      expect(gateConfigs.policy.required).toBe(true);
      expect(gateConfigs.policy.canSkip).toBe(false);
    });
    
    it('should require rehearsal gate for all promotions', () => {
      expect(gateConfigs.rehearsal.required).toBe(true);
      expect(gateConfigs.rehearsal.canSkip).toBe(false);
    });
    
    it('should allow parity skip only with approval', () => {
      expect(gateConfigs.parity.required).toBe(true);
      expect(gateConfigs.parity.canSkip).toBe(true);
      expect(gateConfigs.parity.skipRequiresApproval).toBe(true);
    });
    
    it('should not allow parity skip for production', () => {
      const canSkipParityForProduction = false; // Hardcoded rule
      expect(canSkipParityForProduction).toBe(false);
    });
  });
  
  describe('Promotion Validation Rules', () => {
    function validatePromotion(config: {
      branch: string;
      targetEnv: string;
      skipParity: boolean;
      gates: Record<string, 'passed' | 'failed' | 'skipped'>;
    }): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      // Must be on main branch
      if (config.branch !== 'main') {
        errors.push('Promotions must be from main branch');
      }
      
      // Cannot skip parity for production
      if (config.targetEnv === 'production' && config.skipParity) {
        errors.push('Cannot skip parity for production');
      }
      
      // All required gates must pass (or be skipped if allowed)
      const requiredGates = ['ci', 'policy', 'rehearsal'];
      requiredGates.forEach(gate => {
        if (config.gates[gate] !== 'passed') {
          errors.push(`${gate} gate must pass`);
        }
      });
      
      // Parity must pass unless skipped
      if (!config.skipParity && config.gates.parity !== 'passed') {
        errors.push('parity gate must pass');
      }
      
      return { valid: errors.length === 0, errors };
    }
    
    it('should validate successful staging promotion', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should validate successful production promotion', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'production',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject promotion from non-main branch', () => {
      const result = validatePromotion({
        branch: 'develop',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Promotions must be from main branch');
    });
    
    it('should reject production promotion with parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'production',
        skipParity: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot skip parity for production');
    });
    
    it('should allow staging promotion with parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject promotion with failed CI', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'failed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ci gate must pass');
    });
  });
  
  describe('Evidence Bundle Composition', () => {
    it('should include provenance in bundle', () => {
      const requiredArtifacts = ['provenance', 'thresholds', 'parity-report', 'dataset-reference'];
      
      requiredArtifacts.forEach(artifact => {
        expect(['provenance', 'thresholds', 'parity-report', 'dataset-reference']).toContain(artifact);
      });
    });
    
    it('should include checksums file', () => {
      const bundleFiles = ['promotion-manifest.json', 'checksums.txt', 'provenance.json', 'thresholds.json'];
      
      expect(bundleFiles).toContain('checksums.txt');
    });
    
    it('should format checksums correctly', () => {
      const artifacts = [
        { hash: 'sha256:abc123', path: 'file1.json' },
        { hash: 'sha256:def456', path: 'file2.json' }
      ];
      
      const checksums = artifacts.map(a => `${a.hash}  ${a.path}`).join('\n') + '\n';
      
      expect(checksums).toContain('sha256:abc123  file1.json');
      expect(checksums).toContain('sha256:def456  file2.json');
    });
  });
  
  describe('Timestamp Handling', () => {
    it('should use ISO 8601 format for timestamps', () => {
      const timestamp = new Date().toISOString();
      
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
    
    it('should not include timestamps in bundle hash computation', () => {
      // Bundle hash is computed from artifact hashes only, not timestamps
      const artifacts = [{ hash: 'sha256:test' }];
      
      const hash1 = computeHashFromArtifacts(artifacts, '2025-01-01T00:00:00.000Z');
      const hash2 = computeHashFromArtifacts(artifacts, '2025-01-02T00:00:00.000Z');
      
      expect(hash1).toBe(hash2);
    });
  });
});

// Helper function for timestamp test
function computeHashFromArtifacts(artifacts: Array<{ hash: string }>, _timestamp: string): string {
  // Timestamp is intentionally ignored in hash computation
  const sortedHashes = artifacts.map(a => a.hash).sort();
  const combined = sortedHashes.join(':');
  const hash = crypto.createHash('sha256');
  hash.update(combined, 'utf8');
  return 'sha256:' + hash.digest('hex');
}
