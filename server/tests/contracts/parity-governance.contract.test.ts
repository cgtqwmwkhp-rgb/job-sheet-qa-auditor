/**
 * Parity Governance v2 Contract Tests
 * 
 * These tests ensure:
 * 1. Positive suite fails on any regression
 * 2. Negative suite fails if expected failure is not detected
 * 3. Only canonical reason codes are allowed
 * 4. Deterministic ordering is preserved
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CANONICAL_REASON_CODES,
  isCanonicalReasonCode,
  mapToCanonicalReasonCode,
  type GoldenDataset,
  type GoldenDocument,
  type CanonicalReasonCode,
} from '../../../parity/runner/types';
import { createParityRunner } from '../../../parity/runner/parityRunner';

const PARITY_ROOT = join(__dirname, '../../../parity');
const POSITIVE_PATH = join(PARITY_ROOT, 'fixtures', 'golden-positive.json');
const NEGATIVE_PATH = join(PARITY_ROOT, 'fixtures', 'golden-negative.json');
const THRESHOLDS_PATH = join(PARITY_ROOT, 'config', 'thresholds.json');

describe('Parity Governance v2 Contract Tests', () => {
  describe('Dataset Structure', () => {
    it('positive dataset exists and has correct structure', () => {
      expect(existsSync(POSITIVE_PATH)).toBe(true);
      
      const dataset: GoldenDataset = JSON.parse(readFileSync(POSITIVE_PATH, 'utf-8'));
      
      expect(dataset.version).toBeDefined();
      expect(dataset.documents).toBeInstanceOf(Array);
      expect(dataset.documents.length).toBeGreaterThan(0);
      
      // All documents should have expectedResult = 'pass'
      for (const doc of dataset.documents) {
        expect(doc.expectedResult).toBe('pass');
      }
    });

    it('negative dataset exists and has correct structure', () => {
      expect(existsSync(NEGATIVE_PATH)).toBe(true);
      
      const dataset: GoldenDataset = JSON.parse(readFileSync(NEGATIVE_PATH, 'utf-8'));
      
      expect(dataset.version).toBeDefined();
      expect(dataset.documents).toBeInstanceOf(Array);
      expect(dataset.documents.length).toBeGreaterThan(0);
      
      // All documents should have expectedResult = 'fail'
      for (const doc of dataset.documents) {
        expect(doc.expectedResult).toBe('fail');
      }
    });

    it('negative dataset documents have expectedFailures defined', () => {
      const dataset: GoldenDataset = JSON.parse(readFileSync(NEGATIVE_PATH, 'utf-8'));
      
      for (const doc of dataset.documents) {
        expect(doc.expectedFailures).toBeDefined();
        expect(doc.expectedFailures!.length).toBeGreaterThan(0);
        
        for (const failure of doc.expectedFailures!) {
          expect(failure.ruleId).toBeDefined();
          expect(failure.field).toBeDefined();
          expect(failure.reasonCode).toBeDefined();
          expect(failure.severity).toBeDefined();
        }
      }
    });
  });

  describe('Canonical Reason Codes', () => {
    it('only allows canonical FAILURE reason codes (VALID is NOT a reason code)', () => {
      // PR-5: VALID is a STATUS (PASS), not a reason code
      // When status is PASS, reasonCode must be null/absent
      const validFailureReasonCodes = [
        // Field-level failure codes
        'MISSING_FIELD', 'INVALID_FORMAT', 'OUT_OF_POLICY', 'LOW_CONFIDENCE', 'CONFLICT',
        // System/Config-level codes (PR-P)
        'SPEC_GAP', 'OCR_FAILURE', 'PIPELINE_ERROR',
      ];
      
      expect(CANONICAL_REASON_CODES).toEqual(validFailureReasonCodes);
    });

    it('DRIFT GUARD: VALID must never appear in canonical reason codes', () => {
      // This is the critical drift guard - VALID is a STATUS, not a reason code
      expect(CANONICAL_REASON_CODES).not.toContain('VALID');
    });

    it('isCanonicalReasonCode returns true for valid failure codes', () => {
      expect(isCanonicalReasonCode('MISSING_FIELD')).toBe(true);
      expect(isCanonicalReasonCode('OUT_OF_POLICY')).toBe(true);
      expect(isCanonicalReasonCode('LOW_CONFIDENCE')).toBe(true);
    });

    it('isCanonicalReasonCode returns false for VALID (status, not reason code)', () => {
      expect(isCanonicalReasonCode('VALID')).toBe(false);
    });

    it('isCanonicalReasonCode returns false for invalid codes', () => {
      expect(isCanonicalReasonCode('OUT_OF_RANGE')).toBe(false);
      expect(isCanonicalReasonCode('INVALID')).toBe(false);
      expect(isCanonicalReasonCode('')).toBe(false);
    });

    it('maps OUT_OF_RANGE to OUT_OF_POLICY', () => {
      expect(mapToCanonicalReasonCode('OUT_OF_RANGE')).toBe('OUT_OF_POLICY');
    });

    it('positive dataset uses only canonical reason codes', () => {
      const dataset: GoldenDataset = JSON.parse(readFileSync(POSITIVE_PATH, 'utf-8'));
      
      for (const doc of dataset.documents) {
        for (const field of doc.validatedFields) {
          if (field.reasonCode) {
            expect(isCanonicalReasonCode(field.reasonCode)).toBe(true);
          }
        }
      }
    });

    it('negative dataset uses only canonical reason codes', () => {
      const dataset: GoldenDataset = JSON.parse(readFileSync(NEGATIVE_PATH, 'utf-8'));
      
      for (const doc of dataset.documents) {
        for (const field of doc.validatedFields) {
          if (field.reasonCode) {
            expect(isCanonicalReasonCode(field.reasonCode)).toBe(true);
          }
        }
        
        for (const failure of doc.expectedFailures || []) {
          expect(isCanonicalReasonCode(failure.reasonCode)).toBe(true);
        }
      }
    });

    it('thresholds.json defines canonical reason codes', () => {
      const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf-8'));
      
      expect(thresholds.canonicalReasonCodes).toBeDefined();
      expect(thresholds.canonicalReasonCodes).toEqual(CANONICAL_REASON_CODES);
    });
  });

  describe('Positive Suite Regression Detection', () => {
    let runner: ReturnType<typeof createParityRunner>;
    let positiveDataset: GoldenDataset;

    beforeEach(() => {
      runner = createParityRunner({
        maxWorseDocuments: 0,
        maxWorseFields: 0,
        minSamePercentage: 100,
      });
      runner.loadPositiveDataset(POSITIVE_PATH);
      positiveDataset = JSON.parse(readFileSync(POSITIVE_PATH, 'utf-8'));
    });

    it('passes when actual matches golden exactly', () => {
      const actualResults = positiveDataset.documents.map(doc => ({ ...doc }));
      const report = runner.runPositiveSuite(actualResults);
      
      expect(report.status).toBe('pass');
      expect(report.violations).toHaveLength(0);
    });

    it('fails when a field status changes from passed to failed', () => {
      const actualResults = positiveDataset.documents.map(doc => ({
        ...doc,
        validatedFields: doc.validatedFields.map((field, idx) => 
          idx === 0 ? { ...field, status: 'failed' as const } : field
        ),
      }));
      
      const report = runner.runPositiveSuite(actualResults);
      
      expect(report.status).toBe('fail');
      expect(report.violations.length).toBeGreaterThan(0);
    });

    it('fails when a document is missing', () => {
      const actualResults = positiveDataset.documents.slice(1); // Remove first doc
      const report = runner.runPositiveSuite(actualResults);
      
      expect(report.status).toBe('fail');
    });

    it('fails when confidence decreases', () => {
      const actualResults = positiveDataset.documents.map(doc => ({
        ...doc,
        validatedFields: doc.validatedFields.map((field, idx) => 
          idx === 0 ? { ...field, confidence: field.confidence - 0.5 } : field
        ),
      }));
      
      const report = runner.runPositiveSuite(actualResults);
      
      expect(report.status).toBe('fail');
    });
  });

  describe('Negative Suite Expected Failure Detection', () => {
    let runner: ReturnType<typeof createParityRunner>;
    let negativeDataset: GoldenDataset;

    beforeEach(() => {
      runner = createParityRunner();
      runner.loadNegativeDataset(NEGATIVE_PATH);
      negativeDataset = JSON.parse(readFileSync(NEGATIVE_PATH, 'utf-8'));
    });

    it('passes when all expected failures are detected', () => {
      // Actual results match golden (failures are present)
      const actualResults = negativeDataset.documents.map(doc => ({ ...doc }));
      const report = runner.runNegativeSuite(actualResults);
      
      expect(report.status).toBe('pass');
      expect(report.violations).toHaveLength(0);
      expect(report.summary.missedFailures).toBe(0);
    });

    it('fails when expected failure is not detected', () => {
      // Remove the failed status from first document's first failed field
      const actualResults = negativeDataset.documents.map((doc, docIdx) => {
        if (docIdx === 0) {
          return {
            ...doc,
            validatedFields: doc.validatedFields.map(field => ({
              ...field,
              status: 'passed' as const, // All fields pass (no failures detected)
            })),
          };
        }
        return doc;
      });
      
      const report = runner.runNegativeSuite(actualResults);
      
      expect(report.status).toBe('fail');
      expect(report.summary.missedFailures).toBeGreaterThan(0);
    });

    it('reports matched vs missed failures correctly', () => {
      const actualResults = negativeDataset.documents.map(doc => ({ ...doc }));
      const report = runner.runNegativeSuite(actualResults);
      
      expect(report.summary.matchedFailures).toBe(report.summary.totalExpectedFailures);
      expect(report.summary.missedFailures).toBe(0);
    });
  });

  describe('Deterministic Ordering', () => {
    it('field comparisons are sorted by ruleId', () => {
      const runner = createParityRunner();
      runner.loadPositiveDataset(POSITIVE_PATH);
      
      const dataset: GoldenDataset = JSON.parse(readFileSync(POSITIVE_PATH, 'utf-8'));
      const actualResults = dataset.documents.map(doc => ({ ...doc }));
      
      const report = runner.runPositiveSuite(actualResults);
      
      for (const doc of report.documents) {
        const ruleIds = doc.fieldComparisons.map(f => f.ruleId);
        const sortedRuleIds = [...ruleIds].sort();
        expect(ruleIds).toEqual(sortedRuleIds);
      }
    });

    it('running parity twice produces identical results', () => {
      const runner1 = createParityRunner();
      const runner2 = createParityRunner();
      
      runner1.loadPositiveDataset(POSITIVE_PATH);
      runner2.loadPositiveDataset(POSITIVE_PATH);
      
      const dataset: GoldenDataset = JSON.parse(readFileSync(POSITIVE_PATH, 'utf-8'));
      const actualResults = dataset.documents.map(doc => ({ ...doc }));
      
      const report1 = runner1.runPositiveSuite(actualResults);
      const report2 = runner2.runPositiveSuite(actualResults);
      
      // Compare summaries (runId and timestamp will differ)
      expect(report1.summary).toEqual(report2.summary);
      expect(report1.violations).toEqual(report2.violations);
      expect(report1.documents.length).toBe(report2.documents.length);
    });
  });

  describe('Thresholds Configuration', () => {
    it('thresholds.json version is 2.0.0', () => {
      const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf-8'));
      expect(thresholds.version).toBe('2.0.0');
    });

    it('positive suite thresholds are strict (100%)', () => {
      const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf-8'));
      
      expect(thresholds.thresholds.overall.minPassRate).toBe(1.0);
      expect(thresholds.thresholds.bySeverity.S0.minPassRate).toBe(1.0);
      expect(thresholds.thresholds.bySeverity.S1.minPassRate).toBe(1.0);
    });

    it('negative suite configuration exists', () => {
      const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf-8'));
      
      expect(thresholds.negativeSuite).toBeDefined();
      expect(thresholds.negativeSuite.requireAllExpectedFailures).toBe(true);
    });
  });
});
