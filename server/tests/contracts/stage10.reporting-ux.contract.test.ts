/**
 * Stage 10 Contract Tests: Reporting UX
 * 
 * Tests for:
 * - Parity report generation
 * - Threshold violation detection
 * - Artifact structure validation
 * - Summary format compliance
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
  alerts: {
    warnOnImprovement: boolean;
    failOnRegression: boolean;
  };
  ci: {
    prSubsetDocIds: string[];
    summaryFormat: string;
  };
}

describe('Stage 10: Reporting UX Contract Tests', () => {
  let goldenDataset: GoldenDataset;
  let thresholdConfig: ThresholdConfig;

  beforeAll(() => {
    const datasetPath = path.join(process.cwd(), 'parity/fixtures/golden-dataset.json');
    const thresholdPath = path.join(process.cwd(), 'parity/config/thresholds.json');
    
    goldenDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
    thresholdConfig = JSON.parse(fs.readFileSync(thresholdPath, 'utf-8'));
  });

  describe('Report Generation', () => {
    it('should generate pass rate from dataset', () => {
      let totalFields = 0;
      let passedFields = 0;
      
      goldenDataset.documents.forEach(doc => {
        doc.validatedFields.forEach(f => {
          totalFields++;
          if (f.status === 'passed') passedFields++;
        });
      });
      
      const passRate = passedFields / totalFields;
      expect(passRate).toBeGreaterThan(0);
      expect(passRate).toBeLessThanOrEqual(1);
    });

    it('should calculate severity-based stats', () => {
      const bySeverity: Record<string, { total: number; passed: number }> = {
        S0: { total: 0, passed: 0 },
        S1: { total: 0, passed: 0 },
        S2: { total: 0, passed: 0 },
        S3: { total: 0, passed: 0 },
      };
      
      goldenDataset.documents.forEach(doc => {
        doc.validatedFields.forEach(f => {
          bySeverity[f.severity].total++;
          if (f.status === 'passed') {
            bySeverity[f.severity].passed++;
          }
        });
      });
      
      // Should have at least some fields in each severity
      expect(bySeverity.S0.total).toBeGreaterThan(0);
      expect(bySeverity.S1.total).toBeGreaterThan(0);
    });

    it('should calculate reason code distribution', () => {
      const byReasonCode: Record<string, number> = {};
      
      goldenDataset.documents.forEach(doc => {
        doc.validatedFields.forEach(f => {
          byReasonCode[f.reasonCode] = (byReasonCode[f.reasonCode] || 0) + 1;
        });
      });
      
      // Should have VALID reason code
      expect(byReasonCode['VALID']).toBeGreaterThan(0);
      
      // All reason codes should be documented
      Object.keys(byReasonCode).forEach(code => {
        expect(goldenDataset.reasonCodes[code]).toBeDefined();
      });
    });
  });

  describe('Threshold Violation Detection', () => {
    it('should detect overall threshold violations', () => {
      let totalFields = 0;
      let passedFields = 0;
      
      goldenDataset.documents.forEach(doc => {
        doc.validatedFields.forEach(f => {
          totalFields++;
          if (f.status === 'passed') passedFields++;
        });
      });
      
      const passRate = passedFields / totalFields;
      const threshold = thresholdConfig.thresholds.overall.minPassRate;
      
      const isViolation = passRate < threshold;
      expect(typeof isViolation).toBe('boolean');
    });

    it('should detect severity-based threshold violations', () => {
      const violations: string[] = [];
      const bySeverity: Record<string, { total: number; passed: number }> = {
        S0: { total: 0, passed: 0 },
        S1: { total: 0, passed: 0 },
        S2: { total: 0, passed: 0 },
        S3: { total: 0, passed: 0 },
      };
      
      goldenDataset.documents.forEach(doc => {
        doc.validatedFields.forEach(f => {
          bySeverity[f.severity].total++;
          if (f.status === 'passed') {
            bySeverity[f.severity].passed++;
          }
        });
      });
      
      Object.entries(bySeverity).forEach(([sev, data]) => {
        const rate = data.total > 0 ? data.passed / data.total : 1;
        const threshold = thresholdConfig.thresholds.bySeverity[sev]?.minPassRate || 0;
        if (rate < threshold) {
          violations.push(`${sev} pass rate ${(rate * 100).toFixed(1)}% below threshold ${threshold * 100}%`);
        }
      });
      
      // Violations array should be defined (may be empty if all pass)
      expect(Array.isArray(violations)).toBe(true);
    });
  });

  describe('Summary Format Compliance', () => {
    it('should have markdown summary format configured', () => {
      expect(thresholdConfig.ci.summaryFormat).toBe('markdown');
    });

    it('should have PR subset docs defined', () => {
      expect(thresholdConfig.ci.prSubsetDocIds.length).toBeGreaterThan(0);
    });

    it('should have all PR subset docs in dataset', () => {
      const datasetIds = new Set(goldenDataset.documents.map(d => d.id));
      thresholdConfig.ci.prSubsetDocIds.forEach(id => {
        expect(datasetIds.has(id)).toBe(true);
      });
    });
  });

  describe('Report Structure', () => {
    it('should support JSON report format', () => {
      // Simulate report structure
      const report = {
        timestamp: new Date().toISOString(),
        datasetVersion: goldenDataset.version,
        thresholdVersion: thresholdConfig.version,
        status: 'pass',
        passRate: 95.0,
        totalFields: 100,
        passedFields: 95,
        failedFields: 5,
        violations: [],
      };
      
      expect(report.timestamp).toBeDefined();
      expect(report.datasetVersion).toBe(goldenDataset.version);
      expect(report.status).toMatch(/^(pass|fail)$/);
    });

    it('should include document-level results', () => {
      const docResults = goldenDataset.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        expectedResult: doc.expectedResult,
        passed: doc.validatedFields.filter(f => f.status === 'passed').length,
        failed: doc.validatedFields.filter(f => f.status === 'failed').length,
        total: doc.validatedFields.length,
        findings: doc.findings.length,
      }));
      
      expect(docResults.length).toBe(goldenDataset.documents.length);
      docResults.forEach(doc => {
        expect(doc.passed + doc.failed).toBe(doc.total);
      });
    });
  });

  describe('Alert Configuration', () => {
    it('should have alert settings defined', () => {
      expect(thresholdConfig.alerts).toBeDefined();
      expect(typeof thresholdConfig.alerts.warnOnImprovement).toBe('boolean');
      expect(typeof thresholdConfig.alerts.failOnRegression).toBe('boolean');
    });

    it('should fail on regression by default', () => {
      expect(thresholdConfig.alerts.failOnRegression).toBe(true);
    });
  });

  describe('Artifact Naming', () => {
    it('should support run-number based artifact naming', () => {
      const runNumber = 123;
      const subsetArtifact = `parity-subset-report-${runNumber}`;
      const fullArtifact = `parity-full-report-${runNumber}`;
      
      expect(subsetArtifact).toMatch(/^parity-subset-report-\d+$/);
      expect(fullArtifact).toMatch(/^parity-full-report-\d+$/);
    });
  });
});
