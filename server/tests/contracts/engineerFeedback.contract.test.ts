/**
 * Engineer Feedback Framework - Contract Tests
 * 
 * Tests for:
 * - Engineer scorecards (daily/weekly/monthly)
 * - Fix pack generation
 * - Template quality metrics
 * - Template quality cockpit
 * - Deterministic ordering
 */

import { describe, it, expect } from 'vitest';
import {
  generateEngineerScorecard,
  generateEngineerFixPack,
  generateTemplateQualityMetrics,
  generateTemplateQualityCockpit,
  generateScorecardJson,
  generateFixPackJson,
  generateCockpitJson,
  type AuditResult,
  type AggregationPeriod,
} from '../../services/engineerFeedback';

// Test data factory
function createMockAudit(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    auditId: `audit-${Math.random().toString(36).substring(7)}`,
    jobSheetId: 'js-001',
    engineerId: 'eng-001',
    engineerName: 'John Smith',
    templateId: 'template-001',
    templateName: 'Standard Job Sheet',
    auditedAt: new Date().toISOString(),
    outcome: 'VALID',
    reasonCodes: [],
    confidence: 0.9,
    fieldsExtracted: 10,
    fieldsMissing: 0,
    fieldsLowConfidence: 1,
    ...overrides,
  };
}

describe('Engineer Feedback Framework', () => {
  describe('generateEngineerScorecard', () => {
    it('should generate scorecard with correct metrics', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'VALID', confidence: 0.95 }),
        createMockAudit({ outcome: 'VALID', confidence: 0.85 }),
        createMockAudit({ outcome: 'INVALID', confidence: 0.6, reasonCodes: ['MISSING_FIELD'] }),
        createMockAudit({ outcome: 'REVIEW_QUEUE', confidence: 0.5, reasonCodes: ['LOW_CONFIDENCE'] }),
      ];

      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');

      expect(scorecard.engineerId).toBe('eng-001');
      expect(scorecard.engineerName).toBe('John Smith');
      expect(scorecard.period).toBe('daily');
      expect(scorecard.metrics.totalAudits).toBe(4);
      expect(scorecard.metrics.validCount).toBe(2);
      expect(scorecard.metrics.invalidCount).toBe(1);
      expect(scorecard.metrics.reviewQueueCount).toBe(1);
      expect(scorecard.metrics.validRate).toBe(0.5);
      expect(scorecard.metrics.averageConfidence).toBeCloseTo(0.725, 2);
    });

    it('should include top issues sorted by count', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD', 'LOW_CONFIDENCE'] }),
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['CONFLICT'] }),
      ];

      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');

      expect(scorecard.topIssues[0].reasonCode).toBe('MISSING_FIELD');
      expect(scorecard.topIssues[0].count).toBe(2);
      expect(scorecard.topIssues.length).toBeLessThanOrEqual(5);
    });

    it('should include template breakdown', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-001', templateName: 'Template A', outcome: 'VALID' }),
        createMockAudit({ templateId: 'template-001', templateName: 'Template A', outcome: 'INVALID' }),
        createMockAudit({ templateId: 'template-002', templateName: 'Template B', outcome: 'VALID' }),
      ];

      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');

      expect(scorecard.templateBreakdown).toHaveLength(2);
      
      const templateA = scorecard.templateBreakdown.find(t => t.templateId === 'template-001');
      expect(templateA).toBeDefined();
      expect(templateA!.auditCount).toBe(2);
      expect(templateA!.validRate).toBe(0.5);
    });

    it('should support different aggregation periods', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'VALID' }),
      ];

      const daily = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');
      const weekly = generateEngineerScorecard('eng-001', 'John Smith', audits, 'weekly');
      const monthly = generateEngineerScorecard('eng-001', 'John Smith', audits, 'monthly');

      expect(daily.period).toBe('daily');
      expect(weekly.period).toBe('weekly');
      expect(monthly.period).toBe('monthly');
      
      // Weekly and monthly periods should be longer
      const dailyDuration = new Date(daily.periodEnd).getTime() - new Date(daily.periodStart).getTime();
      const weeklyDuration = new Date(weekly.periodEnd).getTime() - new Date(weekly.periodStart).getTime();
      
      expect(weeklyDuration).toBeGreaterThan(dailyDuration);
    });
  });

  describe('generateEngineerFixPack', () => {
    it('should generate fix pack with categorized issues', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD', 'CONFLICT'] }),
        createMockAudit({ outcome: 'REVIEW_QUEUE', reasonCodes: ['LOW_CONFIDENCE'] }),
      ];

      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');

      expect(fixPack.engineerId).toBe('eng-001');
      expect(fixPack.summary.totalIssues).toBe(4);
      expect(fixPack.issues.length).toBeGreaterThan(0);
      
      // Check that issues are sorted by category (critical first)
      const categories = fixPack.issues.map(i => i.category);
      const criticalIndex = categories.indexOf('critical');
      const warningIndex = categories.indexOf('warning');
      const infoIndex = categories.indexOf('info');
      
      if (criticalIndex >= 0 && warningIndex >= 0) {
        expect(criticalIndex).toBeLessThan(warningIndex);
      }
    });

    it('should include recommendations for each issue', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
      ];

      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');

      expect(fixPack.issues[0].recommendation).toBeDefined();
      expect(fixPack.issues[0].recommendation.length).toBeGreaterThan(0);
    });

    it('should limit example audit IDs', () => {
      const audits: AuditResult[] = Array.from({ length: 10 }, (_, i) => 
        createMockAudit({ auditId: `audit-${i}`, outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] })
      );

      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');

      const missingFieldIssue = fixPack.issues.find(i => i.reasonCode === 'MISSING_FIELD');
      expect(missingFieldIssue!.exampleAuditIds.length).toBeLessThanOrEqual(3);
    });

    it('should exclude valid audits from fix pack', () => {
      const audits: AuditResult[] = [
        createMockAudit({ outcome: 'VALID' }),
        createMockAudit({ outcome: 'VALID' }),
      ];

      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');

      expect(fixPack.summary.totalIssues).toBe(0);
      expect(fixPack.issues).toHaveLength(0);
    });
  });

  describe('generateTemplateQualityMetrics', () => {
    it('should calculate template quality metrics', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-001', outcome: 'VALID', confidence: 0.9 }),
        createMockAudit({ templateId: 'template-001', outcome: 'VALID', confidence: 0.85 }),
        createMockAudit({ templateId: 'template-001', outcome: 'INVALID', confidence: 0.6, reasonCodes: ['LOW_CONFIDENCE'] }),
      ];

      const metrics = generateTemplateQualityMetrics(
        'template-001',
        'Standard Job Sheet',
        audits,
        'daily'
      );

      expect(metrics.templateId).toBe('template-001');
      expect(metrics.metrics.totalAudits).toBe(3);
      expect(metrics.metrics.validRate).toBeCloseTo(0.667, 2);
      expect(metrics.metrics.ambiguityRate).toBeCloseTo(0.333, 2);
    });

    it('should include additional metrics when provided', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-001', outcome: 'VALID' }),
      ];

      const metrics = generateTemplateQualityMetrics(
        'template-001',
        'Standard Job Sheet',
        audits,
        'daily',
        {
          collisionCount: 5,
          overrideCount: 2,
          roiCompleteness: 0.8,
          fixturePassRate: 0.95,
        }
      );

      expect(metrics.metrics.collisionCount).toBe(5);
      expect(metrics.metrics.overrideCount).toBe(2);
      expect(metrics.metrics.roiCompleteness).toBe(0.8);
      expect(metrics.metrics.fixturePassRate).toBe(0.95);
    });
  });

  describe('generateTemplateQualityCockpit', () => {
    it('should generate cockpit with overall metrics', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-001', templateName: 'Template A', outcome: 'VALID' }),
        createMockAudit({ templateId: 'template-001', templateName: 'Template A', outcome: 'INVALID' }),
        createMockAudit({ templateId: 'template-002', templateName: 'Template B', outcome: 'VALID' }),
      ];

      const templateMetrics = new Map([
        ['template-001', { name: 'Template A' }],
        ['template-002', { name: 'Template B' }],
      ]);

      const cockpit = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');

      expect(cockpit.overallMetrics.totalTemplates).toBe(2);
      expect(cockpit.overallMetrics.totalAudits).toBe(3);
      expect(cockpit.templates).toHaveLength(2);
    });

    it('should sort templates by attention needed', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'good-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'good-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'bad-template', outcome: 'INVALID', reasonCodes: ['CONFLICT'] }),
        createMockAudit({ templateId: 'bad-template', outcome: 'INVALID', reasonCodes: ['LOW_CONFIDENCE'] }),
      ];

      const templateMetrics = new Map([
        ['good-template', { name: 'Good Template' }],
        ['bad-template', { name: 'Bad Template' }],
      ]);

      const cockpit = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');

      // Bad template should be first (needs more attention)
      expect(cockpit.templates[0].templateId).toBe('bad-template');
    });

    it('should identify templates needing attention', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'ok-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'ok-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'ok-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'ok-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'ok-template', outcome: 'INVALID' }),
        createMockAudit({ templateId: 'bad-template', outcome: 'VALID' }),
        createMockAudit({ templateId: 'bad-template', outcome: 'INVALID' }),
        createMockAudit({ templateId: 'bad-template', outcome: 'INVALID' }),
        createMockAudit({ templateId: 'bad-template', outcome: 'INVALID' }),
      ];

      const templateMetrics = new Map([
        ['ok-template', { name: 'OK Template' }],
        ['bad-template', { name: 'Bad Template' }],
      ]);

      const cockpit = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');

      // bad-template has < 80% valid rate
      expect(cockpit.overallMetrics.templatesNeedingAttention).toBe(1);
    });

    it('should include top issues across all templates', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-001', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
        createMockAudit({ templateId: 'template-002', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
        createMockAudit({ templateId: 'template-001', outcome: 'INVALID', reasonCodes: ['CONFLICT'] }),
      ];

      const templateMetrics = new Map([
        ['template-001', { name: 'Template 1' }],
        ['template-002', { name: 'Template 2' }],
      ]);

      const cockpit = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');

      expect(cockpit.topIssues.length).toBeGreaterThan(0);
      const missingField = cockpit.topIssues.find(i => i.reasonCode === 'MISSING_FIELD');
      expect(missingField).toBeDefined();
      expect(missingField!.affectedTemplates).toBe(2);
      expect(missingField!.totalOccurrences).toBe(2);
    });
  });

  describe('JSON export', () => {
    it('should generate valid JSON for scorecard', () => {
      const audits: AuditResult[] = [createMockAudit()];
      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');
      const json = generateScorecardJson(scorecard);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should generate valid JSON for fix pack', () => {
      const audits: AuditResult[] = [createMockAudit({ outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] })];
      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');
      const json = generateFixPackJson(fixPack);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should generate valid JSON for cockpit', () => {
      const audits: AuditResult[] = [createMockAudit()];
      const cockpit = generateTemplateQualityCockpit(audits, new Map(), 'daily');
      const json = generateCockpitJson(cockpit);

      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('Determinism', () => {
    it('should produce identical scorecards for identical inputs', () => {
      const audits: AuditResult[] = [
        createMockAudit({ auditId: 'audit-1', outcome: 'VALID' }),
        createMockAudit({ auditId: 'audit-2', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'] }),
      ];

      const scorecard1 = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');
      const scorecard2 = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');

      // Normalize timestamps for comparison
      const normalize = (s: typeof scorecard1) => ({
        ...s,
        generatedAt: 'X',
      });

      expect(normalize(scorecard1)).toEqual(normalize(scorecard2));
    });

    it('should maintain stable ordering in cockpit templates', () => {
      const audits: AuditResult[] = [
        createMockAudit({ templateId: 'template-b', outcome: 'VALID' }),
        createMockAudit({ templateId: 'template-a', outcome: 'VALID' }),
        createMockAudit({ templateId: 'template-c', outcome: 'VALID' }),
      ];

      const templateMetrics = new Map([
        ['template-a', { name: 'Template A' }],
        ['template-b', { name: 'Template B' }],
        ['template-c', { name: 'Template C' }],
      ]);

      const cockpit1 = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');
      const cockpit2 = generateTemplateQualityCockpit(audits, templateMetrics, 'daily');

      // Template order should be identical
      expect(cockpit1.templates.map(t => t.templateId)).toEqual(
        cockpit2.templates.map(t => t.templateId)
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty audit list', () => {
      const audits: AuditResult[] = [];

      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');
      expect(scorecard.metrics.totalAudits).toBe(0);
      expect(scorecard.metrics.validRate).toBe(0);

      const fixPack = generateEngineerFixPack('eng-001', 'John Smith', audits, 'daily');
      expect(fixPack.summary.totalIssues).toBe(0);

      const cockpit = generateTemplateQualityCockpit(audits, new Map(), 'daily');
      expect(cockpit.overallMetrics.totalTemplates).toBe(0);
    });

    it('should handle audits from different engineers', () => {
      const audits: AuditResult[] = [
        createMockAudit({ engineerId: 'eng-001', outcome: 'VALID' }),
        createMockAudit({ engineerId: 'eng-002', outcome: 'INVALID' }),
      ];

      const scorecard = generateEngineerScorecard('eng-001', 'John Smith', audits, 'daily');
      
      // Should only count engineer's own audits
      expect(scorecard.metrics.totalAudits).toBe(1);
      expect(scorecard.metrics.validRate).toBe(1);
    });
  });
});
