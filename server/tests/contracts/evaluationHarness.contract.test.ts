/**
 * Evaluation Harness Contract Tests
 * 
 * Tests for deterministic report ordering and metric calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSelectionMetrics,
  calculateCriticalFieldMetrics,
  calculateFusionMetrics,
  calculatePass2Metrics,
  calculateTrends,
  calculateOverallScore,
  generateRunId,
  sortDocumentResults,
  sortFieldResults,
} from '../../../scripts/eval/metrics';
import type { EvalDocumentResult, EvalReport, EvalConfig } from '../../../scripts/eval/types';
import { DEFAULT_EVAL_CONFIG } from '../../../scripts/eval/types';

describe('Evaluation Harness Contract Tests', () => {
  // Sample document results for testing
  const sampleResults: EvalDocumentResult[] = [
    {
      documentId: 'doc-003',
      documentName: 'Document C',
      source: 'fixture',
      selection: {
        expectedTemplateId: 'template-a',
        actualTemplateId: 'template-a',
        isCorrect: true,
        confidence: 0.95,
        runnerUpDelta: 0.2,
        isAmbiguous: false,
      },
      fields: [
        { fieldId: 'f2', fieldName: 'field_b', expectedValue: 'b', actualValue: 'b', isCorrect: true, confidence: 0.9, severity: 'S0' },
        { fieldId: 'f1', fieldName: 'field_a', expectedValue: 'a', actualValue: 'a', isCorrect: true, confidence: 0.95, severity: 'S1' },
      ],
      fusionResults: [
        { fieldId: 'f2', ocrValue: 'b', imageQaValue: 'b', agreed: true, decision: 'merged' },
        { fieldId: 'f1', ocrValue: 'a', imageQaValue: 'a', agreed: true, decision: 'merged' },
      ],
      pass2: { triggered: false },
      overallResult: 'pass',
      expectedResult: 'pass',
      matchesExpectation: true,
    },
    {
      documentId: 'doc-001',
      documentName: 'Document A',
      source: 'fixture',
      selection: {
        expectedTemplateId: 'template-a',
        actualTemplateId: 'template-a',
        isCorrect: true,
        confidence: 0.92,
        runnerUpDelta: 0.15,
        isAmbiguous: false,
      },
      fields: [
        { fieldId: 'f1', fieldName: 'field_a', expectedValue: 'a', actualValue: 'a', isCorrect: true, confidence: 0.9, severity: 'S0' },
        { fieldId: 'f2', fieldName: 'field_b', expectedValue: 'b', actualValue: 'x', isCorrect: false, confidence: 0.8, severity: 'S1' },
      ],
      fusionResults: [
        { fieldId: 'f1', ocrValue: 'a', imageQaValue: 'a', agreed: true, decision: 'merged' },
        { fieldId: 'f2', ocrValue: 'b', imageQaValue: 'x', agreed: false, decision: 'ocr' },
      ],
      pass2: { triggered: true, reason: 'low_confidence', interpreter: 'gemini', escalated: false },
      overallResult: 'fail',
      expectedResult: 'pass',
      matchesExpectation: false,
    },
    {
      documentId: 'doc-002',
      documentName: 'Document B',
      source: 'fixture',
      selection: {
        expectedTemplateId: 'template-b',
        actualTemplateId: 'template-c',
        isCorrect: false,
        confidence: 0.7,
        runnerUpDelta: 0.05,
        isAmbiguous: true,
      },
      fields: [
        { fieldId: 'f1', fieldName: 'field_a', expectedValue: 'a', actualValue: 'a', isCorrect: true, confidence: 0.85, severity: 'S2' },
      ],
      fusionResults: [
        { fieldId: 'f1', ocrValue: 'a', imageQaValue: 'different', agreed: false, decision: 'ocr' },
      ],
      pass2: { triggered: true, reason: 'ambiguous_selection', interpreter: 'claude', escalated: true },
      overallResult: 'fail',
      expectedResult: 'fail',
      matchesExpectation: true,
    },
  ];

  describe('Deterministic Report Ordering', () => {
    it('should sort documents by ID deterministically', () => {
      const sorted = sortDocumentResults(sampleResults);
      
      expect(sorted[0].documentId).toBe('doc-001');
      expect(sorted[1].documentId).toBe('doc-002');
      expect(sorted[2].documentId).toBe('doc-003');
    });

    it('should sort fields within documents by field ID', () => {
      const sorted = sortFieldResults(sampleResults);
      
      // Check first document's fields are sorted
      const doc003 = sorted.find(d => d.documentId === 'doc-003')!;
      expect(doc003.fields[0].fieldId).toBe('f1');
      expect(doc003.fields[1].fieldId).toBe('f2');
      
      // Check fusion results are also sorted
      expect(doc003.fusionResults[0].fieldId).toBe('f1');
      expect(doc003.fusionResults[1].fieldId).toBe('f2');
    });

    it('should produce identical output for same input', () => {
      const sorted1 = sortDocumentResults(sortFieldResults(sampleResults));
      const sorted2 = sortDocumentResults(sortFieldResults(sampleResults));
      
      expect(JSON.stringify(sorted1)).toBe(JSON.stringify(sorted2));
    });

    it('should generate unique run IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRunId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Selection Metrics', () => {
    it('should calculate selection accuracy correctly', () => {
      const metrics = calculateSelectionMetrics(sampleResults);
      
      expect(metrics.totalDocuments).toBe(3);
      expect(metrics.correctSelections).toBe(2);
      expect(metrics.incorrectSelections).toBe(1);
      expect(metrics.accuracy).toBeCloseTo(2/3, 5);
    });

    it('should track ambiguous selections', () => {
      const metrics = calculateSelectionMetrics(sampleResults);
      
      expect(metrics.ambiguousSelections).toBe(1);
      expect(metrics.ambiguityRate).toBeCloseTo(1/3, 5);
    });

    it('should break down by template ID', () => {
      const metrics = calculateSelectionMetrics(sampleResults);
      
      expect(metrics.byTemplateId['template-a'].total).toBe(2);
      expect(metrics.byTemplateId['template-a'].correct).toBe(2);
      expect(metrics.byTemplateId['template-b'].total).toBe(1);
      expect(metrics.byTemplateId['template-b'].correct).toBe(0);
    });
  });

  describe('Critical Field Metrics', () => {
    it('should calculate field accuracy correctly', () => {
      const metrics = calculateCriticalFieldMetrics(sampleResults);
      
      expect(metrics.totalFields).toBe(5);
      expect(metrics.correctFields).toBe(4);
      expect(metrics.incorrectFields).toBe(1);
      expect(metrics.accuracy).toBeCloseTo(4/5, 5);
    });

    it('should break down by severity', () => {
      const metrics = calculateCriticalFieldMetrics(sampleResults);
      
      expect(metrics.bySeverity['S0'].total).toBe(2);
      expect(metrics.bySeverity['S1'].total).toBe(2);
      expect(metrics.bySeverity['S2'].total).toBe(1);
    });

    it('should calculate critical-only accuracy (S0 + S1)', () => {
      const metrics = calculateCriticalFieldMetrics(sampleResults);
      
      // S0: 2 total, 2 correct; S1: 2 total, 1 correct
      // Critical = 4 total, 3 correct
      expect(metrics.criticalOnlyAccuracy).toBeCloseTo(3/4, 5);
    });
  });

  describe('Fusion Metrics', () => {
    it('should calculate agreement rate correctly', () => {
      const metrics = calculateFusionMetrics(sampleResults);
      
      // 5 total comparisons across 3 docs:
      // doc-003: f1 agreed, f2 agreed (2 agreed)
      // doc-001: f1 agreed, f2 disagreed (1 agreed, 1 disagreed)  
      // doc-002: f1 disagreed (1 disagreed)
      // Total: 5 comparisons, 3 agreed, 2 disagreed
      expect(metrics.totalComparisons).toBe(5);
      expect(metrics.agreements).toBe(3);
      expect(metrics.disagreements).toBe(2);
      expect(metrics.agreementRate).toBeCloseTo(3/5, 5);
    });

    it('should track decision types', () => {
      const metrics = calculateFusionMetrics(sampleResults);
      
      // doc-003: 2 merged; doc-001: 1 merged + 1 ocr; doc-002: 1 ocr
      expect(metrics.ocrPreferred).toBe(2);
      expect(metrics.mergedDecisions).toBe(3);
    });
  });

  describe('Pass-2 Metrics', () => {
    it('should calculate pass-2 rate correctly', () => {
      const metrics = calculatePass2Metrics(sampleResults);
      
      expect(metrics.totalDocuments).toBe(3);
      expect(metrics.pass2Triggered).toBe(2);
      expect(metrics.pass2Rate).toBeCloseTo(2/3, 5);
    });

    it('should track interpreter usage', () => {
      const metrics = calculatePass2Metrics(sampleResults);
      
      expect(metrics.interpreterUsage.gemini).toBe(1);
      expect(metrics.interpreterUsage.claude).toBe(1);
      expect(metrics.interpreterUsage.escalatedToClaude).toBe(1);
    });

    it('should track trigger reasons', () => {
      const metrics = calculatePass2Metrics(sampleResults);
      
      expect(metrics.triggerReasons['low_confidence']).toBe(1);
      expect(metrics.triggerReasons['ambiguous_selection']).toBe(1);
    });
  });

  describe('Overall Score', () => {
    it('should calculate weighted overall score', () => {
      const selection = calculateSelectionMetrics(sampleResults);
      const criticalField = calculateCriticalFieldMetrics(sampleResults);
      const fusion = calculateFusionMetrics(sampleResults);
      const pass2 = calculatePass2Metrics(sampleResults);
      
      const score = calculateOverallScore(
        selection,
        criticalField,
        fusion,
        pass2,
        DEFAULT_EVAL_CONFIG.weights
      );
      
      // Verify it's a reasonable number between 0 and 1
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('Trend Calculation', () => {
    it('should calculate trends between runs', () => {
      const current: EvalReport = {
        version: '1.0.0',
        runId: 'run-2',
        timestamp: new Date().toISOString(),
        environment: 'local',
        documentSummary: { total: 3, fixtures: 3, sampledProduction: 0, synthetic: 0 },
        selectionMetrics: { ...calculateSelectionMetrics(sampleResults), accuracy: 0.90 },
        criticalFieldMetrics: { ...calculateCriticalFieldMetrics(sampleResults), criticalOnlyAccuracy: 0.85 },
        fusionMetrics: { ...calculateFusionMetrics(sampleResults), agreementRate: 0.88 },
        pass2Metrics: { ...calculatePass2Metrics(sampleResults), pass2Rate: 0.10 },
        overallScore: 0.88,
        trends: [],
        documentResults: [],
        metadata: { goldenDatasetVersion: '1.0', evaluatorVersion: '1.0', configHash: '' },
      };

      const previous: EvalReport = {
        ...current,
        runId: 'run-1',
        selectionMetrics: { ...current.selectionMetrics, accuracy: 0.85 },
        criticalFieldMetrics: { ...current.criticalFieldMetrics, criticalOnlyAccuracy: 0.80 },
        fusionMetrics: { ...current.fusionMetrics, agreementRate: 0.85 },
        pass2Metrics: { ...current.pass2Metrics, pass2Rate: 0.15 },
        overallScore: 0.82,
      };

      const trends = calculateTrends(current, previous);
      
      expect(trends.length).toBe(5);
      
      // Selection accuracy improved
      const selectionTrend = trends.find(t => t.metric === 'selection_accuracy')!;
      expect(selectionTrend.trend).toBe('improving');
      expect(selectionTrend.delta).toBeCloseTo(0.05, 5);
      
      // Pass-2 rate improved (decreased)
      const pass2Trend = trends.find(t => t.metric === 'pass2_rate')!;
      expect(pass2Trend.trend).toBe('improving');
      expect(pass2Trend.delta).toBeCloseTo(-0.05, 5);
    });

    it('should return empty trends when no previous report', () => {
      const current: EvalReport = {
        version: '1.0.0',
        runId: 'run-1',
        timestamp: new Date().toISOString(),
        environment: 'local',
        documentSummary: { total: 0, fixtures: 0, sampledProduction: 0, synthetic: 0 },
        selectionMetrics: calculateSelectionMetrics([]),
        criticalFieldMetrics: calculateCriticalFieldMetrics([]),
        fusionMetrics: calculateFusionMetrics([]),
        pass2Metrics: calculatePass2Metrics([]),
        overallScore: 0,
        trends: [],
        documentResults: [],
        metadata: { goldenDatasetVersion: '1.0', evaluatorVersion: '1.0', configHash: '' },
      };

      const trends = calculateTrends(current, null);
      expect(trends).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results', () => {
      const selectionMetrics = calculateSelectionMetrics([]);
      expect(selectionMetrics.totalDocuments).toBe(0);
      expect(selectionMetrics.accuracy).toBe(0);

      const fieldMetrics = calculateCriticalFieldMetrics([]);
      expect(fieldMetrics.totalFields).toBe(0);
      expect(fieldMetrics.accuracy).toBe(0);

      const fusionMetrics = calculateFusionMetrics([]);
      expect(fusionMetrics.totalComparisons).toBe(0);
      expect(fusionMetrics.agreementRate).toBe(0);

      const pass2Metrics = calculatePass2Metrics([]);
      expect(pass2Metrics.totalDocuments).toBe(0);
      expect(pass2Metrics.pass2Rate).toBe(0);
    });

    it('should maintain stable JSON serialization order', () => {
      const sorted = sortDocumentResults(sortFieldResults(sampleResults));
      
      const json1 = JSON.stringify(sorted);
      const json2 = JSON.stringify(sorted);
      
      expect(json1).toBe(json2);
    });
  });
});
