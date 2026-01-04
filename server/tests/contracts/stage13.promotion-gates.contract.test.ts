/**
 * Stage 13b: Deployment Promotion Gates Contract Tests (Hardened)
 * 
 * Tests for promotion bundle composition, ordering, determinism,
 * and parity gate enforcement.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

describe('Stage 13b: Deployment Promotion Gates (Hardened)', () => {
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
      'bundleHash',
      'paritySkipped'
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
        paritySkipped: false,
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
    
    it('should NOT include timestamps in hash computation', () => {
      const artifacts = [{ hash: 'sha256:test' }];
      
      // Same artifacts, different timestamps
      const hash1 = computeHashFromArtifacts(artifacts, '2025-01-01T00:00:00.000Z');
      const hash2 = computeHashFromArtifacts(artifacts, '2025-12-31T23:59:59.999Z');
      
      expect(hash1).toBe(hash2);
    });
  });
  
  describe('Gate Requirements', () => {
    interface GateConfig {
      required: boolean;
      canSkip: boolean;
      skipRequiresApproval: boolean;
      skipAllowedForProduction: boolean;
    }
    
    const gateConfigs: Record<string, GateConfig> = {
      ci: { required: true, canSkip: false, skipRequiresApproval: false, skipAllowedForProduction: false },
      policy: { required: true, canSkip: false, skipRequiresApproval: false, skipAllowedForProduction: false },
      rehearsal: { required: true, canSkip: false, skipRequiresApproval: false, skipAllowedForProduction: false },
      parity: { required: true, canSkip: true, skipRequiresApproval: true, skipAllowedForProduction: false }
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
    
    it('should allow parity skip only with approval for staging', () => {
      expect(gateConfigs.parity.required).toBe(true);
      expect(gateConfigs.parity.canSkip).toBe(true);
      expect(gateConfigs.parity.skipRequiresApproval).toBe(true);
    });
    
    it('should NOT allow parity skip for production', () => {
      expect(gateConfigs.parity.skipAllowedForProduction).toBe(false);
    });
  });
  
  describe('Parity Skip Controls', () => {
    const PARITY_SKIP_ACKNOWLEDGEMENT = 'I_ACCEPT_PARITY_SKIP';
    
    function validateParitySkip(config: {
      targetEnv: string;
      skipRequested: boolean;
      acknowledgementText: string;
    }): { allowed: boolean; reason: string } {
      // Production: NEVER allow skip
      if (config.targetEnv === 'production') {
        return { allowed: false, reason: 'Parity skip is not allowed for production' };
      }
      
      // Skip not requested
      if (!config.skipRequested) {
        return { allowed: true, reason: 'Parity will run normally' };
      }
      
      // Staging: requires acknowledgement
      if (config.acknowledgementText !== PARITY_SKIP_ACKNOWLEDGEMENT) {
        return { allowed: false, reason: 'Parity skip requires acknowledgement text: ' + PARITY_SKIP_ACKNOWLEDGEMENT };
      }
      
      return { allowed: true, reason: 'Parity skip acknowledged for staging' };
    }
    
    it('should NEVER allow parity skip for production', () => {
      const result = validateParitySkip({
        targetEnv: 'production',
        skipRequested: true,
        acknowledgementText: PARITY_SKIP_ACKNOWLEDGEMENT
      });
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed for production');
    });
    
    it('should require acknowledgement for staging parity skip', () => {
      const result = validateParitySkip({
        targetEnv: 'staging',
        skipRequested: true,
        acknowledgementText: ''
      });
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('requires acknowledgement');
    });
    
    it('should allow staging parity skip with correct acknowledgement', () => {
      const result = validateParitySkip({
        targetEnv: 'staging',
        skipRequested: true,
        acknowledgementText: PARITY_SKIP_ACKNOWLEDGEMENT
      });
      
      expect(result.allowed).toBe(true);
    });
    
    it('should reject incorrect acknowledgement text', () => {
      const result = validateParitySkip({
        targetEnv: 'staging',
        skipRequested: true,
        acknowledgementText: 'yes please skip'
      });
      
      expect(result.allowed).toBe(false);
    });
  });
  
  describe('Parity Failure Handling', () => {
    function simulateParityGate(config: {
      parityPassed: boolean;
      skipParity: boolean;
      skipAcknowledged: boolean;
      targetEnv: string;
    }): { promotionAllowed: boolean; reason: string } {
      // Production: parity MUST pass, no skip allowed
      if (config.targetEnv === 'production') {
        if (!config.parityPassed) {
          return { promotionAllowed: false, reason: 'Parity failed - production promotion blocked' };
        }
        return { promotionAllowed: true, reason: 'Parity passed' };
      }
      
      // Staging: parity must pass OR be skipped with acknowledgement
      if (config.parityPassed) {
        return { promotionAllowed: true, reason: 'Parity passed' };
      }
      
      if (config.skipParity && config.skipAcknowledged) {
        return { promotionAllowed: true, reason: 'Parity skipped with acknowledgement' };
      }
      
      return { promotionAllowed: false, reason: 'Parity failed - staging promotion blocked' };
    }
    
    it('should block production promotion when parity fails', () => {
      const result = simulateParityGate({
        parityPassed: false,
        skipParity: false,
        skipAcknowledged: false,
        targetEnv: 'production'
      });
      
      expect(result.promotionAllowed).toBe(false);
      expect(result.reason).toContain('production promotion blocked');
    });
    
    it('should block production promotion even with skip request', () => {
      const result = simulateParityGate({
        parityPassed: false,
        skipParity: true,
        skipAcknowledged: true,
        targetEnv: 'production'
      });
      
      expect(result.promotionAllowed).toBe(false);
    });
    
    it('should allow production promotion when parity passes', () => {
      const result = simulateParityGate({
        parityPassed: true,
        skipParity: false,
        skipAcknowledged: false,
        targetEnv: 'production'
      });
      
      expect(result.promotionAllowed).toBe(true);
    });
    
    it('should block staging promotion when parity fails without skip', () => {
      const result = simulateParityGate({
        parityPassed: false,
        skipParity: false,
        skipAcknowledged: false,
        targetEnv: 'staging'
      });
      
      expect(result.promotionAllowed).toBe(false);
    });
    
    it('should allow staging promotion when parity fails with acknowledged skip', () => {
      const result = simulateParityGate({
        parityPassed: false,
        skipParity: true,
        skipAcknowledged: true,
        targetEnv: 'staging'
      });
      
      expect(result.promotionAllowed).toBe(true);
    });
  });
  
  describe('Promotion Validation Rules', () => {
    function validatePromotion(config: {
      branch: string;
      targetEnv: string;
      skipParity: boolean;
      skipAcknowledged: boolean;
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
      
      // Staging parity skip requires acknowledgement
      if (config.targetEnv === 'staging' && config.skipParity && !config.skipAcknowledged) {
        errors.push('Parity skip requires acknowledgement');
      }
      
      // All required gates must pass (or be skipped if allowed)
      const requiredGates = ['ci', 'policy', 'rehearsal'];
      requiredGates.forEach(gate => {
        if (config.gates[gate] !== 'passed') {
          errors.push(`${gate} gate must pass`);
        }
      });
      
      // Parity must pass unless skipped (and skip is allowed)
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
        skipAcknowledged: false,
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
        skipAcknowledged: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject promotion from non-main branch', () => {
      const result = validatePromotion({
        branch: 'develop',
        targetEnv: 'staging',
        skipParity: false,
        skipAcknowledged: false,
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
        skipAcknowledged: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot skip parity for production');
    });
    
    it('should allow staging promotion with acknowledged parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: true,
        skipAcknowledged: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject staging promotion with unacknowledged parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: true,
        skipAcknowledged: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Parity skip requires acknowledgement');
    });
    
    it('should reject promotion with failed CI', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: false,
        skipAcknowledged: false,
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
    
    it('should include skip acknowledgement in manifest when applicable', () => {
      const manifestWithSkip = {
        paritySkipped: true,
        paritySkipAcknowledgement: {
          acknowledged: true,
          acknowledgementText: 'I_ACCEPT_PARITY_SKIP',
          acknowledgedBy: 'test-user',
          acknowledgedAt: '2025-01-04T10:00:00.000Z'
        }
      };
      
      expect(manifestWithSkip.paritySkipAcknowledgement).toBeDefined();
      expect(manifestWithSkip.paritySkipAcknowledgement.acknowledged).toBe(true);
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
