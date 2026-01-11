/**
 * Stage 9 Contract Tests: Dataset Expansion and Threshold Governance
 * 
 * Tests for:
 * - Expanded golden dataset with 9 documents
 * - Edge case coverage (all reason codes)
 * - Threshold configuration validation
 * - Severity-based threshold enforcement
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface GoldenDataset {
  version: string;
  documents: Array<{
    id: string;
    name: string;
    expectedResult: string;
    validatedFields: Array<{
      ruleId: string;
      field: string;
      status: string;
      severity: string;
      reasonCode: string;
    }>;
    findings: Array<{
      id: string;
      reasonCode: string;
      severity: string;
    }>;
  }>;
  rules: Array<{
    ruleId: string;
    severity: string;
  }>;
  reasonCodes: Record<string, string>;
}

interface ThresholdConfig {
  version: string;
  thresholds: {
    overall: {
      minPassRate: number;
      maxWorseCount: number;
    };
    bySeverity: Record<string, {
      minPassRate: number;
      maxWorseCount: number;
    }>;
  };
  ci: {
    prSubsetDocIds: string[];
  };
}

describe('Stage 9: Dataset Expansion Contract Tests', () => {
  let goldenDataset: GoldenDataset;
  let thresholdConfig: ThresholdConfig;

  beforeAll(() => {
    const datasetPath = path.join(process.cwd(), 'parity/fixtures/golden-dataset.json');
    const thresholdPath = path.join(process.cwd(), 'parity/config/thresholds.json');
    
    goldenDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
    thresholdConfig = JSON.parse(fs.readFileSync(thresholdPath, 'utf-8'));
  });

  describe('Dataset Size and Coverage', () => {
    it('should have at least 6 documents', () => {
      expect(goldenDataset.documents.length).toBeGreaterThanOrEqual(6);
    });

    it('should have exactly 9 documents in expanded dataset', () => {
      expect(goldenDataset.documents.length).toBe(9);
    });

    it('should have unique document IDs', () => {
      const ids = goldenDataset.documents.map(d => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have both pass and fail expected results', () => {
      const results = new Set(goldenDataset.documents.map(d => d.expectedResult));
      expect(results.has('pass')).toBe(true);
      expect(results.has('fail')).toBe(true);
    });
  });

  describe('Reason Code Coverage', () => {
    it('passed fields should have no reason code (VALID is a status, not a reason code)', () => {
      // PR-5: VALID is a STATUS (PASS), not a reason code
      // When a field passes, reasonCode should be absent/undefined/null
      const passedFieldsWithReasonCode = goldenDataset.documents.flatMap(d =>
        d.validatedFields.filter(f => f.status === 'passed' && f.reasonCode !== undefined && f.reasonCode !== null)
      );
      expect(passedFieldsWithReasonCode).toHaveLength(0);
    });

    it('DRIFT GUARD: no field should have reasonCode="VALID"', () => {
      const hasValid = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'VALID')
      );
      expect(hasValid).toBe(false);
    });

    it('should cover MISSING_FIELD reason code', () => {
      const hasMissing = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'MISSING_FIELD')
      );
      expect(hasMissing).toBe(true);
    });

    it('should cover INVALID_FORMAT reason code', () => {
      const hasInvalid = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'INVALID_FORMAT')
      );
      expect(hasInvalid).toBe(true);
    });

    it('should cover OUT_OF_RANGE reason code', () => {
      const hasOutOfRange = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'OUT_OF_RANGE')
      );
      expect(hasOutOfRange).toBe(true);
    });

    it('should cover OUT_OF_POLICY reason code', () => {
      const hasOutOfPolicy = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'OUT_OF_POLICY')
      );
      expect(hasOutOfPolicy).toBe(true);
    });

    it('should cover CONFLICT reason code', () => {
      const hasConflict = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'CONFLICT')
      );
      expect(hasConflict).toBe(true);
    });

    it('should cover LOW_CONFIDENCE reason code', () => {
      const hasLowConf = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.reasonCode === 'LOW_CONFIDENCE')
      );
      expect(hasLowConf).toBe(true);
    });

    it('should have all reason codes documented', () => {
      const allReasonCodes = new Set<string>();
      goldenDataset.documents.forEach(d => {
        d.validatedFields.forEach(f => {
          // Only add defined reason codes (passed fields have no reasonCode)
          if (f.reasonCode) allReasonCodes.add(f.reasonCode);
        });
      });
      
      for (const code of allReasonCodes) {
        expect(goldenDataset.reasonCodes[code]).toBeDefined();
      }
    });
  });

  describe('Severity Coverage', () => {
    it('should cover S0 severity', () => {
      const hasS0 = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.severity === 'S0')
      );
      expect(hasS0).toBe(true);
    });

    it('should cover S1 severity', () => {
      const hasS1 = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.severity === 'S1')
      );
      expect(hasS1).toBe(true);
    });

    it('should cover S2 severity', () => {
      const hasS2 = goldenDataset.documents.some(d =>
        d.validatedFields.some(f => f.severity === 'S2')
      );
      expect(hasS2).toBe(true);
    });

    it('should have S0 failures in failed documents', () => {
      const failedDocs = goldenDataset.documents.filter(d => d.expectedResult === 'fail');
      const hasS0Failure = failedDocs.some(d =>
        d.findings.some(f => f.severity === 'S0')
      );
      expect(hasS0Failure).toBe(true);
    });
  });

  describe('Edge Case Documents', () => {
    it('should have document with multiple failures', () => {
      const multiFailDoc = goldenDataset.documents.find(d => d.findings.length >= 3);
      expect(multiFailDoc).toBeDefined();
    });

    it('should have document requiring review queue', () => {
      const reviewDoc = goldenDataset.documents.find(d =>
        d.validatedFields.some(f => f.reasonCode === 'LOW_CONFIDENCE')
      );
      expect(reviewDoc).toBeDefined();
    });

    it('should have document with table-heavy extraction', () => {
      const tableDoc = goldenDataset.documents.find(d =>
        d.name.toLowerCase().includes('table')
      );
      expect(tableDoc).toBeDefined();
    });
  });

  describe('Threshold Configuration', () => {
    it('should have valid version format', () => {
      expect(thresholdConfig.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have overall threshold defined', () => {
      expect(thresholdConfig.thresholds.overall).toBeDefined();
      expect(thresholdConfig.thresholds.overall.minPassRate).toBeGreaterThan(0);
      expect(thresholdConfig.thresholds.overall.minPassRate).toBeLessThanOrEqual(1);
    });

    it('should have severity-based thresholds', () => {
      expect(thresholdConfig.thresholds.bySeverity).toBeDefined();
      expect(thresholdConfig.thresholds.bySeverity['S0']).toBeDefined();
      expect(thresholdConfig.thresholds.bySeverity['S1']).toBeDefined();
    });

    it('should have S0 threshold at 100%', () => {
      expect(thresholdConfig.thresholds.bySeverity['S0'].minPassRate).toBe(1.0);
    });

    it('should have decreasing thresholds by severity', () => {
      const s0 = thresholdConfig.thresholds.bySeverity['S0'].minPassRate;
      const s1 = thresholdConfig.thresholds.bySeverity['S1'].minPassRate;
      const s2 = thresholdConfig.thresholds.bySeverity['S2'].minPassRate;
      
      expect(s0).toBeGreaterThanOrEqual(s1);
      expect(s1).toBeGreaterThanOrEqual(s2);
    });

    it('should have PR subset document IDs defined', () => {
      expect(thresholdConfig.ci.prSubsetDocIds).toBeDefined();
      expect(thresholdConfig.ci.prSubsetDocIds.length).toBeGreaterThan(0);
    });

    it('should have PR subset IDs that exist in dataset', () => {
      const datasetIds = new Set(goldenDataset.documents.map(d => d.id));
      for (const id of thresholdConfig.ci.prSubsetDocIds) {
        expect(datasetIds.has(id)).toBe(true);
      }
    });
  });

  describe('Deterministic Ordering', () => {
    it('should have documents in deterministic order by ID', () => {
      const ids = goldenDataset.documents.map(d => d.id);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    it('should have validatedFields in deterministic order by ruleId', () => {
      for (const doc of goldenDataset.documents) {
        const ruleIds = doc.validatedFields.map(f => f.ruleId);
        const sortedRuleIds = [...ruleIds].sort();
        expect(ruleIds).toEqual(sortedRuleIds);
      }
    });

    it('should have findings in deterministic order by ID', () => {
      for (const doc of goldenDataset.documents) {
        if (doc.findings.length > 0) {
          const findingIds = doc.findings.map(f => f.id);
          const sortedFindingIds = [...findingIds].sort();
          expect(findingIds).toEqual(sortedFindingIds);
        }
      }
    });
  });

  describe('Data Integrity', () => {
    it('should have consistent rule references', () => {
      const ruleIds = new Set(goldenDataset.rules.map(r => r.ruleId));
      
      for (const doc of goldenDataset.documents) {
        for (const field of doc.validatedFields) {
          expect(ruleIds.has(field.ruleId)).toBe(true);
        }
      }
    });

    it('should have findings that match validatedFields failures', () => {
      for (const doc of goldenDataset.documents) {
        const failedRuleIds = new Set(
          doc.validatedFields
            .filter(f => f.status === 'failed')
            .map(f => f.ruleId)
        );
        
        for (const finding of doc.findings) {
          expect(failedRuleIds.has(finding.ruleId)).toBe(true);
        }
      }
    });

    it('should have expectedResult consistent with findings', () => {
      for (const doc of goldenDataset.documents) {
        const hasFailures = doc.findings.length > 0;
        if (hasFailures) {
          expect(doc.expectedResult).toBe('fail');
        }
      }
    });
  });
});
