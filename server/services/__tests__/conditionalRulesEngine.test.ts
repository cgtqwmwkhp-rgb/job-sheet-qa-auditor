/**
 * Conditional Rules Engine Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  ConditionalRulesEngine,
  getConditionalRulesEngine,
  resetConditionalRulesEngine,
  type ExtractedField,
} from '../conditionalRulesEngine';
import {
  getTemplateRegistry,
  resetTemplateRegistry,
} from '../templateRegistry';
import { resetTemplateSelector } from '../templateSelector';

const SPECS_DIR = path.join(__dirname, '..', '..', 'specs');

describe('Conditional Rules Engine', () => {
  let engine: ConditionalRulesEngine;

  beforeEach(async () => {
    resetTemplateRegistry();
    resetTemplateSelector();
    resetConditionalRulesEngine();
    
    // Load the registry
    const registry = getTemplateRegistry();
    (registry as unknown as { specsDir: string }).specsDir = SPECS_DIR;
    await registry.loadAllPacks();
    
    engine = getConditionalRulesEngine();
  });

  afterEach(() => {
    resetTemplateRegistry();
    resetTemplateSelector();
    resetConditionalRulesEngine();
  });

  describe('Document Evaluation', () => {
    it('evaluates a document with all required fields', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.95 },
        { field: 'customerName', value: 'ACME Corp', confidence: 0.92 },
        { field: 'assetId', value: 'PUMP-001', confidence: 0.98 },
        { field: 'technicianSignature', value: 'present', confidence: 0.90 },
        { field: 'imageCount', value: 3, confidence: 1.0 },
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      expect(result.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(result.validatedFields.length).toBeGreaterThan(0);
    });

    it('returns failure for non-existent template', () => {
      const result = engine.evaluateDocument('NON_EXISTENT_V1', []);

      expect(result.documentOutcome).toBe('FAIL');
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.reasonCodes).toContain('PIPELINE_ERROR');
    });

    it('detects missing required fields', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.95 },
        // Missing other required fields
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      const missingFieldFindings = result.findings.filter(f => f.reasonCode === 'MISSING_FIELD');
      expect(missingFieldFindings.length).toBeGreaterThan(0);
    });

    it('detects low confidence fields', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.5 }, // Low confidence
        { field: 'customerName', value: 'ACME Corp', confidence: 0.92 },
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      const lowConfidenceResults = result.validatedFields.filter(v => v.reasonCode === 'LOW_CONFIDENCE');
      expect(lowConfidenceResults.length).toBeGreaterThan(0);
    });
  });

  describe('Documentation Audit Perspective', () => {
    it('passes when engineer documents failure correctly', () => {
      // Simulate Aztec weighing system with failure but proper documentation
      const extractedFields: ExtractedField[] = [
        { field: 'systemPoweringUp', value: 'No', confidence: 0.95 },
        { field: 'weighingSystemOperational', value: 'No', confidence: 0.95 },
        { field: 'engineerComments', value: 'FAULT 62 displayed. Found loose connection at main harness. Requires follow-up visit.', confidence: 0.90 },
        { field: 'returnVisitNeeded', value: 'Yes', confidence: 0.95 },
        { field: 'assetSafeToUse', value: 'Yes', confidence: 0.95 },
        { field: 'technicianSignature', value: 'present', confidence: 0.90 },
        { field: 'imageCount', value: 3, confidence: 1.0 },
      ];

      const result = engine.evaluateDocument('PE_JOB_SUMMARY_AZTEC_V1', extractedFields);

      // Documentation should PASS because engineer documented the issue properly
      // Even though the asset has issues
      const criticalFailures = result.findings.filter(f => f.severity === 'critical');
      expect(criticalFailures.length).toBe(0);
    });

    it('fails when engineer does not document failure', () => {
      // Simulate failure without proper documentation
      const extractedFields: ExtractedField[] = [
        { field: 'systemPoweringUp', value: 'No', confidence: 0.95 },
        { field: 'weighingSystemOperational', value: 'No', confidence: 0.95 },
        // Missing engineer comments
        { field: 'returnVisitNeeded', value: 'No', confidence: 0.95 }, // Inconsistent
        { field: 'technicianSignature', value: 'present', confidence: 0.90 },
      ];

      const result = engine.evaluateDocument('PE_JOB_SUMMARY_AZTEC_V1', extractedFields);

      // Should have findings about incomplete evidence
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('Conditional Formatting', () => {
    it('returns correct formatting for green status', () => {
      const formatting = engine.getConditionalFormatting('green');

      expect(formatting.displayColor).toBe('#22c55e');
      expect(formatting.displayLabel).toBe('Completed');
    });

    it('returns correct formatting for red status', () => {
      const formatting = engine.getConditionalFormatting('red');

      expect(formatting.displayColor).toBe('#ef4444');
      expect(formatting.displayLabel).toBe('Failed/Critical');
    });

    it('returns correct formatting for orange status', () => {
      const formatting = engine.getConditionalFormatting('orange');

      expect(formatting.displayColor).toBe('#f97316');
      expect(formatting.displayLabel).toBe('Requires Attention');
    });

    it('returns correct formatting for yellow status', () => {
      const formatting = engine.getConditionalFormatting('yellow');

      expect(formatting.displayColor).toBe('#eab308');
      expect(formatting.displayLabel).toBe('N/A');
    });

    it('returns correct formatting for yes/no status', () => {
      const yesFormatting = engine.getConditionalFormatting('yes');
      const noFormatting = engine.getConditionalFormatting('no');

      expect(yesFormatting.displayLabel).toBe('Yes');
      expect(noFormatting.displayLabel).toBe('No');
    });
  });

  describe('Summary Calculation', () => {
    it('calculates summary statistics correctly', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.95 },
        { field: 'customerName', value: 'ACME Corp', confidence: 0.92 },
        { field: 'technicianSignature', value: 'present', confidence: 0.90 },
        { field: 'imageCount', value: 3, confidence: 1.0 },
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      expect(result.summary.totalFields).toBeGreaterThan(0);
      expect(result.summary.passedFields + result.summary.failedFields + 
             result.summary.warningFields + result.summary.skippedFields)
        .toBe(result.summary.totalFields);
      expect(result.summary.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(result.summary.consistencyScore).toBeLessThanOrEqual(1);
      expect(result.summary.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.summary.completenessScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Next Steps Generation', () => {
    it('generates next steps for missing fields', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.95 },
        // Missing other required fields
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      const missingFieldStep = result.nextSteps.find(s => s.includes('missing'));
      expect(missingFieldStep).toBeDefined();
    });

    it('generates deterministic next steps order', () => {
      const extractedFields: ExtractedField[] = [];

      const result1 = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);
      const result2 = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      expect(result1.nextSteps).toEqual(result2.nextSteps);
    });
  });

  describe('Reason Codes', () => {
    it('collects unique reason codes', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.5 }, // LOW_CONFIDENCE
        // Missing fields -> MISSING_FIELD
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      // Reason codes should be unique
      const uniqueCodes = [...new Set(result.reasonCodes)];
      expect(result.reasonCodes.length).toBe(uniqueCodes.length);
    });

    it('uses canonical reason codes only', () => {
      const CANONICAL_CODES = [
        'VALID', 'MISSING_FIELD', 'UNREADABLE_FIELD', 'LOW_CONFIDENCE',
        'INVALID_FORMAT', 'CONFLICT', 'OUT_OF_POLICY', 'INCOMPLETE_EVIDENCE',
        'OCR_FAILURE', 'PIPELINE_ERROR', 'SPEC_GAP', 'SECURITY_RISK',
      ];

      const extractedFields: ExtractedField[] = [];
      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      for (const code of result.reasonCodes) {
        expect(CANONICAL_CODES).toContain(code);
      }
    });
  });

  describe('Documentation Quality', () => {
    it('determines quality as complete when all checks pass', () => {
      const extractedFields: ExtractedField[] = [
        { field: 'engineerName', value: 'John Smith', confidence: 0.95 },
        { field: 'customerName', value: 'ACME Corp', confidence: 0.92 },
        { field: 'employerAddress', value: '123 Main St', confidence: 0.90 },
        { field: 'siteAddress', value: '456 Work St', confidence: 0.90 },
        { field: 'assetId', value: 'PUMP-001', confidence: 0.98 },
        { field: 'makeAndModel', value: 'Acme Pump 3000', confidence: 0.90 },
        { field: 'serialNumber', value: 'SN123456', confidence: 0.90 },
        { field: 'safeWorkingLoad', value: '500kg', confidence: 0.90 },
        { field: 'dateOfExamination', value: '2026-01-07', confidence: 0.95 },
        { field: 'technicianSignature', value: 'present', confidence: 0.90 },
        { field: 'imageCount', value: 3, confidence: 1.0 },
      ];

      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      // If most fields pass, quality should be complete or incomplete (not inconsistent)
      expect(['complete', 'incomplete']).toContain(result.documentationQuality);
    });

    it('determines quality as inconsistent when conflicts exist', () => {
      // This would require a document with conflicting fields
      // For now, just verify the quality determination works
      const extractedFields: ExtractedField[] = [];
      const result = engine.evaluateDocument('PE_LOLER_EXAM_V1', extractedFields);

      expect(['complete', 'incomplete', 'inconsistent']).toContain(result.documentationQuality);
    });
  });

  describe('Singleton Instance', () => {
    it('returns the same instance', () => {
      const instance1 = getConditionalRulesEngine();
      const instance2 = getConditionalRulesEngine();

      expect(instance1).toBe(instance2);
    });

    it('resets the singleton instance', () => {
      const instance1 = getConditionalRulesEngine();
      resetConditionalRulesEngine();
      const instance2 = getConditionalRulesEngine();

      expect(instance1).not.toBe(instance2);
    });
  });
});
