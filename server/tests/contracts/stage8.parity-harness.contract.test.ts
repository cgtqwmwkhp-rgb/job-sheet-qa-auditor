/**
 * Stage 8 Contract Tests - Parity Harness
 * 
 * Tests for:
 * - Golden dataset loading
 * - Parity comparison logic
 * - Report generation
 * - Threshold enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import {
  ParityRunner,
  createParityRunner,
  DEFAULT_THRESHOLDS,
  type GoldenDocument,
  type GoldenValidatedField,
} from '../../../parity/runner';

describe('Stage 8: Parity Harness', () => {
  let runner: ParityRunner;

  beforeEach(() => {
    runner = createParityRunner();
  });

  describe('Golden Dataset Loading', () => {
    it('should load golden dataset from file', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      
      expect(() => runner.loadGoldenDataset(fixturesPath)).not.toThrow();
    });

    it('should throw error if dataset not loaded', () => {
      expect(() => runner.runParity([])).toThrow('Golden dataset not loaded');
    });
  });

  describe('Parity Comparison', () => {
    const goldenDoc: GoldenDocument = {
      id: 'test-001',
      name: 'Test Document',
      description: 'Test',
      expectedResult: 'pass',
      extractedFields: {},
      validatedFields: [
        {
          ruleId: 'RULE-001',
          field: 'testField',
          status: 'passed',
          value: 'test',
          confidence: 0.95,
          pageNumber: 1,
          severity: 'critical',
        },
      ],
      findings: [],
    };

    beforeEach(() => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      runner.loadGoldenDataset(fixturesPath);
    });

    it('should detect same results', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      // Pass identical results
      const report = runner.runParity(goldenDataset.documents);
      
      expect(report.status).toBe('pass');
      expect(report.summary.same).toBeGreaterThan(0);
      expect(report.summary.worse).toBe(0);
    });

    it('should detect missing documents', () => {
      // Pass empty results
      const report = runner.runParity([]);
      
      expect(report.status).toBe('fail');
      expect(report.summary.worse).toBeGreaterThan(0);
    });

    it('should detect improved fields', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      // Improve confidence on all fields
      const improved = goldenDataset.documents.map((doc: GoldenDocument) => ({
        ...doc,
        validatedFields: doc.validatedFields.map((field: GoldenValidatedField) => ({
          ...field,
          confidence: Math.min(1, field.confidence + 0.05),
        })),
      }));
      
      const report = runner.runParity(improved);
      
      expect(report.summary.fieldsImproved).toBeGreaterThan(0);
    });

    it('should detect worse fields', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      // Decrease confidence on all fields
      const worse = goldenDataset.documents.map((doc: GoldenDocument) => ({
        ...doc,
        validatedFields: doc.validatedFields.map((field: GoldenValidatedField) => ({
          ...field,
          confidence: Math.max(0, field.confidence - 0.1),
        })),
      }));
      
      const report = runner.runParity(worse);
      
      expect(report.summary.fieldsWorse).toBeGreaterThan(0);
    });
  });

  describe('Report Generation', () => {
    beforeEach(() => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      runner.loadGoldenDataset(fixturesPath);
    });

    it('should generate report with all required fields', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report = runner.runParity(goldenDataset.documents);
      
      expect(report.version).toBeDefined();
      expect(report.runId).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.goldenVersion).toBeDefined();
      expect(report.status).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.documents).toBeDefined();
      expect(report.thresholds).toBeDefined();
      expect(report.violations).toBeDefined();
    });

    it('should generate deterministic runId format', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report = runner.runParity(goldenDataset.documents);
      
      expect(report.runId).toMatch(/^[a-f0-9]{12}$/);
    });

    it('should generate markdown summary', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report = runner.runParity(goldenDataset.documents);
      const markdown = runner.generateSummaryMarkdown(report);
      
      expect(markdown).toContain('# Parity Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Document Details');
    });
  });

  describe('Threshold Enforcement', () => {
    it('should use default thresholds', () => {
      expect(DEFAULT_THRESHOLDS.maxWorseDocuments).toBe(0);
      expect(DEFAULT_THRESHOLDS.maxWorseFields).toBe(0);
      expect(DEFAULT_THRESHOLDS.maxMissingFields).toBe(0);
      expect(DEFAULT_THRESHOLDS.minSamePercentage).toBe(95);
    });

    it('should allow custom thresholds', () => {
      const customRunner = createParityRunner({
        maxWorseDocuments: 1,
        maxWorseFields: 5,
        minSamePercentage: 80,
      });
      
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      customRunner.loadGoldenDataset(fixturesPath);
      
      // Pass empty results - should fail with default but might pass with relaxed thresholds
      const report = customRunner.runParity([]);
      
      // Should still fail because all documents are missing
      expect(report.status).toBe('fail');
    });

    it('should report violations when thresholds exceeded', () => {
      const strictRunner = createParityRunner({
        maxWorseDocuments: 0,
        maxWorseFields: 0,
        minSamePercentage: 100,
      });
      
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      strictRunner.loadGoldenDataset(fixturesPath);
      
      const report = strictRunner.runParity([]);
      
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations.some(v => v.includes('exceeds threshold'))).toBe(true);
    });
  });

  describe('Deterministic Ordering', () => {
    beforeEach(() => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      runner.loadGoldenDataset(fixturesPath);
    });

    it('should sort field comparisons by ruleId', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report = runner.runParity(goldenDataset.documents);
      
      for (const doc of report.documents) {
        const ruleIds = doc.fieldComparisons.map(f => f.ruleId);
        const sortedRuleIds = [...ruleIds].sort();
        expect(ruleIds).toEqual(sortedRuleIds);
      }
    });

    it('should produce consistent reports for same inputs', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report1 = runner.runParity(goldenDataset.documents);
      const report2 = runner.runParity(goldenDataset.documents);
      
      // Summary should be identical
      expect(report1.summary).toEqual(report2.summary);
      
      // Document order should be identical
      expect(report1.documents.map(d => d.documentId))
        .toEqual(report2.documents.map(d => d.documentId));
    });
  });

  describe('Findings Comparison', () => {
    beforeEach(() => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      runner.loadGoldenDataset(fixturesPath);
    });

    it('should track matched findings', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      const report = runner.runParity(goldenDataset.documents);
      
      // Find document with findings
      const docWithFindings = report.documents.find(
        d => d.findingsComparison.expected > 0
      );
      
      if (docWithFindings) {
        expect(docWithFindings.findingsComparison.matched)
          .toBe(docWithFindings.findingsComparison.expected);
      }
    });

    it('should detect missing findings', () => {
      const fixturesPath = join(__dirname, '../../../parity/fixtures/golden-dataset.json');
      const goldenDataset = JSON.parse(require('fs').readFileSync(fixturesPath, 'utf-8'));
      
      // Remove findings from actual results
      const noFindings = goldenDataset.documents.map((doc: GoldenDocument) => ({
        ...doc,
        findings: [],
      }));
      
      const report = runner.runParity(noFindings);
      
      // Check if any document had expected findings
      const totalExpectedFindings = goldenDataset.documents.reduce(
        (sum: number, doc: GoldenDocument) => sum + doc.findings.length,
        0
      );
      
      if (totalExpectedFindings > 0) {
        const totalMissing = report.documents.reduce(
          (sum, doc) => sum + doc.findingsComparison.missing,
          0
        );
        expect(totalMissing).toBe(totalExpectedFindings);
      }
    });
  });
});
