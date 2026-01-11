/**
 * Feedback Cadence Contract Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateEngineerScorecard,
  generateCustomerScorecard,
  generateAssetTypeScorecard,
  generateTemplateScorecard,
  generateFixPack,
  generateFeedbackReport,
  generateCockpitData,
  exportFeedbackReport,
} from '../../../server/services/feedback/generator';
import { DEFAULT_EXPORT_CONFIG } from '../../../server/services/feedback/types';

describe('Feedback Cadence Contract Tests', () => {
  describe('Engineer Scorecards', () => {
    it('should generate engineer scorecard with all required fields', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      
      expect(scorecard.scorecardId).toBeDefined();
      expect(scorecard.period).toBe('weekly');
      expect(scorecard.periodStart).toBeDefined();
      expect(scorecard.periodEnd).toBeDefined();
      expect(scorecard.engineer.id).toBe('eng-001');
      expect(scorecard.metrics.totalDocuments).toBeGreaterThan(0);
      expect(scorecard.metrics.passRate).toBeGreaterThan(0);
      expect(scorecard.metrics.passRate).toBeLessThanOrEqual(1);
    });

    it('should redact engineer name by default', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      
      expect(scorecard.engineer.redacted).toBe(true);
      expect(scorecard.engineer.name).toBeUndefined();
    });

    it('should include engineer name when not redacted', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly', {
        ...DEFAULT_EXPORT_CONFIG,
        redactPii: false,
      });
      
      expect(scorecard.engineer.redacted).toBe(false);
      expect(scorecard.engineer.name).toBeDefined();
    });

    it('should include breakdown by asset type and template', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      
      expect(Object.keys(scorecard.byAssetType).length).toBeGreaterThan(0);
      expect(Object.keys(scorecard.byTemplateId).length).toBeGreaterThan(0);
    });

    it('should include top issues', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      
      expect(scorecard.topIssues.length).toBeGreaterThan(0);
      expect(scorecard.topIssues[0].reasonCode).toBeDefined();
      expect(scorecard.topIssues[0].count).toBeGreaterThanOrEqual(0);
    });

    it('should include trend data', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      
      expect(scorecard.trend.direction).toMatch(/improving|stable|declining/);
      expect(typeof scorecard.trend.passRateDelta).toBe('number');
    });
  });

  describe('Customer Scorecards', () => {
    it('should generate customer scorecard with all required fields', () => {
      const scorecard = generateCustomerScorecard('cust-001', 'monthly');
      
      expect(scorecard.scorecardId).toBeDefined();
      expect(scorecard.period).toBe('monthly');
      expect(scorecard.customer.id).toBe('cust-001');
      expect(scorecard.metrics.totalDocuments).toBeGreaterThan(0);
    });

    it('should redact customer name by default', () => {
      const scorecard = generateCustomerScorecard('cust-001', 'weekly');
      
      expect(scorecard.customer.redacted).toBe(true);
      expect(scorecard.customer.name).toBeUndefined();
    });
  });

  describe('Asset Type Scorecards', () => {
    it('should generate asset type scorecard', () => {
      const scorecard = generateAssetTypeScorecard('job_sheet', 'weekly');
      
      expect(scorecard.scorecardId).toBeDefined();
      expect(scorecard.assetType).toBe('job_sheet');
      expect(scorecard.metrics.totalDocuments).toBeGreaterThan(0);
      expect(scorecard.metrics.averageConfidence).toBeGreaterThan(0);
    });

    it('should include breakdown by template', () => {
      const scorecard = generateAssetTypeScorecard('job_sheet', 'weekly');
      
      expect(Object.keys(scorecard.byTemplateId).length).toBeGreaterThan(0);
    });
  });

  describe('Template Scorecards', () => {
    it('should generate template scorecard', () => {
      const scorecard = generateTemplateScorecard('template-a', 'weekly');
      
      expect(scorecard.scorecardId).toBeDefined();
      expect(scorecard.templateId).toBe('template-a');
      expect(scorecard.metrics.selectionAccuracy).toBeGreaterThan(0);
      expect(scorecard.metrics.ambiguityRate).toBeGreaterThanOrEqual(0);
    });

    it('should include field-level breakdown', () => {
      const scorecard = generateTemplateScorecard('template-a', 'weekly');
      
      expect(Object.keys(scorecard.byField).length).toBeGreaterThan(0);
      
      const field = Object.values(scorecard.byField)[0];
      expect(field.total).toBeGreaterThan(0);
      expect(field.accuracy).toBeGreaterThan(0);
    });
  });

  describe('Fix Packs', () => {
    it('should generate fix pack with issues', () => {
      const fixPack = generateFixPack('engineer', 'eng-001', 'weekly');
      
      expect(fixPack.fixPackId).toBeDefined();
      expect(fixPack.target.type).toBe('engineer');
      expect(fixPack.target.id).toBe('eng-001');
      expect(fixPack.issues.length).toBeGreaterThan(0);
    });

    it('should redact issue context by default', () => {
      const fixPack = generateFixPack('engineer', 'eng-001', 'weekly');
      
      expect(fixPack.target.redacted).toBe(true);
      expect(fixPack.issues[0].context.redacted).toBe(true);
    });

    it('should include summary with severity breakdown', () => {
      const fixPack = generateFixPack('engineer', 'eng-001', 'weekly');
      
      expect(fixPack.summary.totalIssues).toBe(fixPack.issues.length);
      expect(Object.keys(fixPack.summary.bySeverity).length).toBeGreaterThan(0);
      expect(Object.keys(fixPack.summary.byReasonCode).length).toBeGreaterThan(0);
    });

    it('should assign priority based on critical issues', () => {
      const fixPack = generateFixPack('engineer', 'eng-001', 'weekly');
      
      expect(fixPack.priority).toMatch(/critical|high|medium|low/);
    });

    it('should generate fix packs for different target types', () => {
      const engineerPack = generateFixPack('engineer', 'eng-001', 'weekly');
      const customerPack = generateFixPack('customer', 'cust-001', 'weekly');
      const assetPack = generateFixPack('assetType', 'job_sheet', 'weekly');
      const templatePack = generateFixPack('templateId', 'template-a', 'weekly');
      
      expect(engineerPack.target.type).toBe('engineer');
      expect(customerPack.target.type).toBe('customer');
      expect(assetPack.target.type).toBe('assetType');
      expect(templatePack.target.type).toBe('templateId');
    });
  });

  describe('Feedback Report', () => {
    it('should generate complete feedback report', () => {
      const report = generateFeedbackReport('weekly');
      
      expect(report.reportId).toBeDefined();
      expect(report.period).toBe('weekly');
      expect(report.generatedAt).toBeDefined();
    });

    it('should include all scorecard types', () => {
      const report = generateFeedbackReport('weekly');
      
      expect(report.engineerScorecards.length).toBeGreaterThan(0);
      expect(report.customerScorecards.length).toBeGreaterThan(0);
      expect(report.assetTypeScorecards.length).toBeGreaterThan(0);
      expect(report.templateScorecards.length).toBeGreaterThan(0);
    });

    it('should include fix packs', () => {
      const report = generateFeedbackReport('weekly');
      
      expect(report.fixPacks.length).toBeGreaterThan(0);
    });

    it('should include overall metrics', () => {
      const report = generateFeedbackReport('weekly');
      
      expect(report.overall.totalDocuments).toBeGreaterThan(0);
      expect(report.overall.passRate).toBeGreaterThan(0);
    });

    it('should include summary statistics', () => {
      const report = generateFeedbackReport('weekly');
      
      expect(report.summary.totalEngineers).toBeGreaterThan(0);
      expect(report.summary.totalCustomers).toBeGreaterThan(0);
      expect(report.summary.totalAssetTypes).toBeGreaterThan(0);
      expect(report.summary.totalTemplates).toBeGreaterThan(0);
    });
  });

  describe('Cockpit Data', () => {
    it('should generate cockpit data', () => {
      const data = generateCockpitData('weekly');
      
      expect(data.currentPeriod).toBeDefined();
      expect(data.trends).toBeDefined();
      expect(data.topIssues).toBeDefined();
      expect(data.recentFixPacks).toBeDefined();
    });

    it('should include trend data points', () => {
      const data = generateCockpitData('weekly');
      
      expect(data.trends.length).toBeGreaterThan(0);
      expect(data.trends[0].date).toBeDefined();
      expect(data.trends[0].passRate).toBeGreaterThan(0);
      expect(data.trends[0].volume).toBeGreaterThan(0);
    });

    it('should include top issues with trends', () => {
      const data = generateCockpitData('weekly');
      
      expect(data.topIssues.length).toBeGreaterThan(0);
      expect(data.topIssues[0].reasonCode).toBeDefined();
      expect(data.topIssues[0].trend).toMatch(/up|down|stable/);
    });
  });

  describe('Export', () => {
    it('should export as JSON', () => {
      const report = generateFeedbackReport('weekly');
      const exported = exportFeedbackReport(report, { ...DEFAULT_EXPORT_CONFIG, format: 'json' });
      
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should export as CSV', () => {
      const report = generateFeedbackReport('weekly');
      const exported = exportFeedbackReport(report, { ...DEFAULT_EXPORT_CONFIG, format: 'csv' });
      
      expect(exported).toContain('Metric,Value');
      expect(exported).toContain('Pass Rate');
    });
  });

  describe('Cadence Periods', () => {
    it('should generate for daily period', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'daily');
      expect(scorecard.period).toBe('daily');
    });

    it('should generate for weekly period', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'weekly');
      expect(scorecard.period).toBe('weekly');
    });

    it('should generate for monthly period', () => {
      const scorecard = generateEngineerScorecard('eng-001', 'monthly');
      expect(scorecard.period).toBe('monthly');
    });
  });
});
