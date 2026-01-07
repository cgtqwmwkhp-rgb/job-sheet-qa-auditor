/**
 * Template Analytics Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSelectionEvent,
  recordValidationEvent,
  recordFeedbackEvent,
  calculateTemplateMetrics,
  checkForDrift,
  generateDashboardData,
  analyzeFeedback,
  getSelectionEvents,
  getValidationEvents,
  getFeedbackEvents,
  getDriftAlerts,
  resetAnalytics,
  DRIFT_THRESHOLDS,
  type SelectionEvent,
  type ValidationEvent,
  type FeedbackEvent,
} from '../templateAnalytics';

describe('Template Analytics Service', () => {
  beforeEach(() => {
    resetAnalytics();
  });

  describe('Event Recording', () => {
    it('records selection events', () => {
      const event: SelectionEvent = {
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        selectionMethod: 'auto',
        confidence: 0.95,
        selectionDurationMs: 150,
      };

      recordSelectionEvent(event);
      
      const events = getSelectionEvents('PE_LOLER_EXAM_V1');
      expect(events.length).toBe(1);
      expect(events[0].documentId).toBe('doc-1');
    });

    it('records validation events', () => {
      const event: ValidationEvent = {
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        outcome: 'PASS',
        reasonCodes: [],
        fieldsPassed: 25,
        fieldsFailed: 0,
        validationDurationMs: 500,
        overridden: false,
      };

      recordValidationEvent(event);
      
      const events = getValidationEvents('PE_LOLER_EXAM_V1');
      expect(events.length).toBe(1);
      expect(events[0].outcome).toBe('PASS');
    });

    it('records feedback events', () => {
      const event: FeedbackEvent = {
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        feedbackType: 'false_positive',
        fieldId: 'expiryDate',
        description: 'Date format is valid but flagged as invalid',
        submittedBy: 'user@example.com',
      };

      recordFeedbackEvent(event);
      
      const events = getFeedbackEvents('PE_LOLER_EXAM_V1');
      expect(events.length).toBe(1);
      expect(events[0].feedbackType).toBe('false_positive');
    });
  });

  describe('Metrics Calculation', () => {
    it('calculates selection metrics', () => {
      // Record some selection events
      for (let i = 0; i < 10; i++) {
        recordSelectionEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          selectionMethod: i < 7 ? 'auto' : 'manual',
          confidence: 0.8 + (i * 0.02),
          selectionDurationMs: 100 + (i * 10),
        });
      }

      const metrics = calculateTemplateMetrics('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(metrics.selectionCount).toBe(10);
      expect(metrics.autoSelectionCount).toBe(7);
      expect(metrics.manualSelectionCount).toBe(3);
      expect(metrics.avgSelectionConfidence).toBeGreaterThan(0.8);
      expect(metrics.avgSelectionDurationMs).toBeGreaterThan(100);
    });

    it('calculates validation metrics', () => {
      // Record validation events
      for (let i = 0; i < 10; i++) {
        recordValidationEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          outcome: i < 8 ? 'PASS' : 'FAIL',
          reasonCodes: i >= 8 ? ['MISSING_FIELD'] : [],
          fieldsPassed: i < 8 ? 25 : 23,
          fieldsFailed: i < 8 ? 0 : 2,
          validationDurationMs: 500,
          overridden: i === 9,
        });
      }

      const metrics = calculateTemplateMetrics('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(metrics.validationCount).toBe(10);
      expect(metrics.passCount).toBe(8);
      expect(metrics.failCount).toBe(2);
      expect(metrics.passRate).toBe(0.8);
      expect(metrics.overrideCount).toBe(1);
      expect(metrics.overrideRate).toBe(0.1);
    });

    it('calculates reason code distribution', () => {
      recordValidationEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        outcome: 'FAIL',
        reasonCodes: ['MISSING_FIELD', 'INVALID_FORMAT'],
        fieldsPassed: 23,
        fieldsFailed: 2,
        validationDurationMs: 500,
        overridden: false,
      });

      recordValidationEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-2',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        outcome: 'FAIL',
        reasonCodes: ['MISSING_FIELD'],
        fieldsPassed: 24,
        fieldsFailed: 1,
        validationDurationMs: 500,
        overridden: false,
      });

      const metrics = calculateTemplateMetrics('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(metrics.reasonCodeDistribution['MISSING_FIELD']).toBe(2);
      expect(metrics.reasonCodeDistribution['INVALID_FORMAT']).toBe(1);
    });

    it('calculates feedback metrics', () => {
      recordFeedbackEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        feedbackType: 'false_positive',
        description: 'Test',
        submittedBy: 'user@example.com',
      });

      recordFeedbackEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-2',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        feedbackType: 'false_negative',
        description: 'Test',
        submittedBy: 'user@example.com',
      });

      recordFeedbackEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-3',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        feedbackType: 'rule_suggestion',
        description: 'Test',
        submittedBy: 'user@example.com',
      });

      const metrics = calculateTemplateMetrics('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(metrics.feedbackCount).toBe(3);
      expect(metrics.falsePositiveCount).toBe(1);
      expect(metrics.falseNegativeCount).toBe(1);
      expect(metrics.ruleSuggestionCount).toBe(1);
    });

    it('returns zero metrics for non-existent template', () => {
      const metrics = calculateTemplateMetrics('NONEXISTENT', '1.0.0');
      
      expect(metrics.selectionCount).toBe(0);
      expect(metrics.validationCount).toBe(0);
      expect(metrics.passRate).toBe(0);
    });
  });

  describe('Drift Detection', () => {
    it('does not alert with insufficient data', () => {
      // Record only a few events (below threshold)
      for (let i = 0; i < 5; i++) {
        recordValidationEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          outcome: 'FAIL',
          reasonCodes: ['MISSING_FIELD'],
          fieldsPassed: 23,
          fieldsFailed: 2,
          validationDurationMs: 500,
          overridden: false,
        });
      }

      const alerts = getDriftAlerts('PE_LOLER_EXAM_V1');
      expect(alerts.length).toBe(0);
    });

    it('detects pass rate drop', () => {
      // Record baseline with high pass rate
      for (let i = 0; i < 15; i++) {
        recordValidationEvent({
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Week ago
          documentId: `doc-baseline-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          outcome: 'PASS',
          reasonCodes: [],
          fieldsPassed: 25,
          fieldsFailed: 0,
          validationDurationMs: 500,
          overridden: false,
        });
      }

      // Record current with low pass rate
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < 5; i++) {
        recordValidationEvent({
          timestamp: `${today}T12:00:00.000Z`,
          documentId: `doc-current-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          outcome: 'FAIL',
          reasonCodes: ['MISSING_FIELD'],
          fieldsPassed: 23,
          fieldsFailed: 2,
          validationDurationMs: 500,
          overridden: false,
        });
      }

      const alerts = checkForDrift('PE_LOLER_EXAM_V1', '1.0.0');
      
      // Should detect pass rate drop
      const passRateAlert = alerts.find(a => a.alertType === 'pass_rate_drop');
      expect(passRateAlert).toBeDefined();
    });
  });

  describe('Dashboard Data', () => {
    it('generates dashboard data', () => {
      // Record some events
      for (let i = 0; i < 5; i++) {
        recordSelectionEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          selectionMethod: 'auto',
          confidence: 0.9,
          selectionDurationMs: 100,
        });

        recordValidationEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          outcome: i < 4 ? 'PASS' : 'FAIL',
          reasonCodes: i >= 4 ? ['MISSING_FIELD'] : [],
          fieldsPassed: 25,
          fieldsFailed: 0,
          validationDurationMs: 500,
          overridden: false,
        });
      }

      const dashboard = generateDashboardData(30);
      
      expect(dashboard.totalDocuments).toBe(5);
      expect(dashboard.totalTemplates).toBe(1);
      expect(dashboard.overallPassRate).toBe(0.8);
      expect(dashboard.templateMetrics.length).toBe(1);
    });

    it('calculates top reason codes', () => {
      recordValidationEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        outcome: 'FAIL',
        reasonCodes: ['MISSING_FIELD', 'INVALID_FORMAT'],
        fieldsPassed: 23,
        fieldsFailed: 2,
        validationDurationMs: 500,
        overridden: false,
      });

      recordValidationEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-2',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        outcome: 'FAIL',
        reasonCodes: ['MISSING_FIELD', 'CONFLICT'],
        fieldsPassed: 23,
        fieldsFailed: 2,
        validationDurationMs: 500,
        overridden: false,
      });

      const dashboard = generateDashboardData(30);
      
      expect(dashboard.topReasonCodes.length).toBeGreaterThan(0);
      expect(dashboard.topReasonCodes[0].code).toBe('MISSING_FIELD');
      expect(dashboard.topReasonCodes[0].count).toBe(2);
    });
  });

  describe('Feedback Analysis', () => {
    it('analyzes feedback by type', () => {
      for (let i = 0; i < 5; i++) {
        recordFeedbackEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          feedbackType: 'false_positive',
          fieldId: 'expiryDate',
          description: 'Test',
          submittedBy: 'user@example.com',
        });
      }

      recordFeedbackEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-6',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        feedbackType: 'false_negative',
        fieldId: 'jobReference',
        description: 'Test',
        submittedBy: 'user@example.com',
      });

      const analysis = analyzeFeedback('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(analysis.totalFeedback).toBe(6);
      expect(analysis.byType['false_positive']).toBe(5);
      expect(analysis.byType['false_negative']).toBe(1);
      expect(analysis.topFields[0].fieldId).toBe('expiryDate');
      expect(analysis.suggestedActions.length).toBeGreaterThan(0);
    });

    it('generates suggested actions for high false positive rate', () => {
      for (let i = 0; i < 5; i++) {
        recordFeedbackEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          feedbackType: 'false_positive',
          description: 'Test',
          submittedBy: 'user@example.com',
        });
      }

      const analysis = analyzeFeedback('PE_LOLER_EXAM_V1', '1.0.0');
      
      expect(analysis.suggestedActions.some(a => a.includes('false positive'))).toBe(true);
    });
  });

  describe('Query Functions', () => {
    it('filters events by template', () => {
      recordSelectionEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-1',
        templateId: 'TEMPLATE_A',
        templateVersion: '1.0.0',
        selectionMethod: 'auto',
        confidence: 0.9,
        selectionDurationMs: 100,
      });

      recordSelectionEvent({
        timestamp: new Date().toISOString(),
        documentId: 'doc-2',
        templateId: 'TEMPLATE_B',
        templateVersion: '1.0.0',
        selectionMethod: 'auto',
        confidence: 0.9,
        selectionDurationMs: 100,
      });

      const eventsA = getSelectionEvents('TEMPLATE_A');
      const eventsB = getSelectionEvents('TEMPLATE_B');
      const eventsAll = getSelectionEvents();

      expect(eventsA.length).toBe(1);
      expect(eventsB.length).toBe(1);
      expect(eventsAll.length).toBe(2);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        recordSelectionEvent({
          timestamp: new Date().toISOString(),
          documentId: `doc-${i}`,
          templateId: 'PE_LOLER_EXAM_V1',
          templateVersion: '1.0.0',
          selectionMethod: 'auto',
          confidence: 0.9,
          selectionDurationMs: 100,
        });
      }

      const events = getSelectionEvents('PE_LOLER_EXAM_V1', 5);
      expect(events.length).toBe(5);
    });
  });

  describe('DRIFT_THRESHOLDS', () => {
    it('has reasonable default thresholds', () => {
      expect(DRIFT_THRESHOLDS.passRateDropPercent).toBe(10);
      expect(DRIFT_THRESHOLDS.selectionConfidenceDropPercent).toBe(15);
      expect(DRIFT_THRESHOLDS.overrideRateSpikePercent).toBe(20);
      expect(DRIFT_THRESHOLDS.minSampleSize).toBe(10);
    });
  });
});
