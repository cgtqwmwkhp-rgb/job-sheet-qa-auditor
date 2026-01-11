/**
 * Contract tests for Feedback Jobs
 * 
 * Validates the scheduled job framework for engineer feedback.
 */

import { describe, it, expect } from 'vitest';
import {
  generateDailySummary,
  generateWeeklyReport,
  generateMonthlyQualityPack,
  executeDailyJob,
  executeWeeklyJob,
  redactOutput,
  JOB_SCHEDULE,
  type DailySummary,
  type WeeklyReport,
  type MonthlyQualityPack,
} from '../../services/scheduledJobs/feedbackJobs';
import type { AuditResult } from '../../services/engineerFeedback/feedbackService';

// Helper to create mock audit data
function createMockAudit(overrides: Partial<AuditResult> = {}): AuditResult {
  const now = new Date();
  return {
    auditId: `audit-${Math.random().toString(36).substring(7)}`,
    jobSheetId: `job-${Math.random().toString(36).substring(7)}`,
    engineerId: 'eng-001',
    engineerName: 'John Smith',
    templateId: 'tmpl-001',
    templateName: 'Standard Form A',
    auditedAt: now.toISOString(),
    outcome: 'VALID',
    reasonCodes: [],
    confidence: 0.95,
    fieldsExtracted: 10,
    fieldsMissing: 0,
    fieldsLowConfidence: 0,
    ...overrides,
  };
}

describe('Feedback Jobs Contract Tests', () => {
  describe('Daily Summary', () => {
    it('should generate deterministic daily summary', () => {
      const referenceDate = new Date('2026-01-11T12:00:00Z');
      const audits: AuditResult[] = [
        createMockAudit({ auditId: 'a1', outcome: 'VALID', auditedAt: '2026-01-11T10:00:00Z' }),
        createMockAudit({ auditId: 'a2', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'], auditedAt: '2026-01-11T11:00:00Z' }),
        createMockAudit({ auditId: 'a3', outcome: 'VALID', auditedAt: '2026-01-11T12:00:00Z' }),
        // Audit from different day - should be excluded
        createMockAudit({ auditId: 'a4', outcome: 'VALID', auditedAt: '2026-01-10T10:00:00Z' }),
      ];

      const summary = generateDailySummary(audits, referenceDate);

      expect(summary.date).toBe('2026-01-11');
      expect(summary.counts.totalAudits).toBe(3);
      expect(summary.counts.validCount).toBe(2);
      expect(summary.counts.invalidCount).toBe(1);
      expect(summary.counts.validRate).toBeCloseTo(0.6667, 2);
    });

    it('should include top issues deterministically sorted', () => {
      const referenceDate = new Date('2026-01-11T12:00:00Z');
      const audits: AuditResult[] = [
        createMockAudit({ auditId: 'a1', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD', 'LOW_CONFIDENCE'], auditedAt: '2026-01-11T10:00:00Z' }),
        createMockAudit({ auditId: 'a2', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'], auditedAt: '2026-01-11T11:00:00Z' }),
        createMockAudit({ auditId: 'a3', outcome: 'INVALID', reasonCodes: ['CONFLICT'], auditedAt: '2026-01-11T12:00:00Z' }),
      ];

      const summary = generateDailySummary(audits, referenceDate);

      expect(summary.topIssues.length).toBeLessThanOrEqual(5);
      expect(summary.topIssues[0].reasonCode).toBe('MISSING_FIELD');
      expect(summary.topIssues[0].count).toBe(2);
    });

    it('should handle empty audits gracefully', () => {
      const referenceDate = new Date('2026-01-11T12:00:00Z');
      const summary = generateDailySummary([], referenceDate);

      expect(summary.counts.totalAudits).toBe(0);
      expect(summary.counts.validRate).toBe(0);
      expect(summary.topIssues).toEqual([]);
    });
  });

  describe('Weekly Report', () => {
    it('should generate engineer scorecards for all engineers', () => {
      const referenceDate = new Date('2026-01-11T12:00:00Z'); // Saturday
      const audits: AuditResult[] = [
        createMockAudit({ engineerId: 'eng-001', engineerName: 'John Smith', auditedAt: '2026-01-06T10:00:00Z' }),
        createMockAudit({ engineerId: 'eng-001', engineerName: 'John Smith', auditedAt: '2026-01-07T10:00:00Z' }),
        createMockAudit({ engineerId: 'eng-002', engineerName: 'Jane Doe', auditedAt: '2026-01-08T10:00:00Z' }),
      ];

      const templateMetrics = new Map([
        ['tmpl-001', { name: 'Standard Form A' }],
      ]);

      const report = generateWeeklyReport(audits, templateMetrics, referenceDate);

      expect(report.engineerScorecards.length).toBe(2);
      expect(report.templateCockpit).toBeDefined();
    });

    it('should generate fix packs only for engineers with issues', () => {
      // Use a date in the middle of the week to ensure audits fall within bounds
      const referenceDate = new Date('2026-01-08T12:00:00Z'); // Wednesday
      const audits: AuditResult[] = [
        createMockAudit({ engineerId: 'eng-001', outcome: 'VALID', auditedAt: '2026-01-06T10:00:00Z' }),
        createMockAudit({ engineerId: 'eng-002', outcome: 'INVALID', reasonCodes: ['MISSING_FIELD'], auditedAt: '2026-01-07T10:00:00Z' }),
      ];

      const report = generateWeeklyReport(audits, new Map(), referenceDate);

      // eng-002 should have a fix pack since they have an INVALID outcome
      const eng002FixPack = report.engineerFixPacks.find(fp => fp.engineerId === 'eng-002');
      expect(eng002FixPack).toBeDefined();
      if (eng002FixPack) {
        expect(eng002FixPack.summary.totalIssues).toBeGreaterThan(0);
      }
    });
  });

  describe('Monthly Quality Pack', () => {
    it('should generate comprehensive monthly report', () => {
      const referenceDate = new Date('2026-01-15T12:00:00Z');
      const audits: AuditResult[] = [
        createMockAudit({ auditId: 'a1', engineerId: 'eng-001', outcome: 'VALID', auditedAt: '2026-01-05T10:00:00Z' }),
        createMockAudit({ auditId: 'a2', engineerId: 'eng-002', outcome: 'INVALID', auditedAt: '2026-01-10T10:00:00Z' }),
      ];

      const customerData = new Map([
        ['a1', { customerId: 'cust-001', customerName: 'Acme Corp' }],
        ['a2', { customerId: 'cust-001', customerName: 'Acme Corp' }],
      ]);

      const assetTypeData = new Map([
        ['a1', 'HVAC'],
        ['a2', 'Electrical'],
      ]);

      const pack = generateMonthlyQualityPack(
        audits,
        new Map(),
        customerData,
        assetTypeData,
        referenceDate
      );

      expect(pack.month).toBe('2026-01');
      expect(pack.overallMetrics.totalAudits).toBe(2);
      expect(pack.customerBreakdown.length).toBe(1);
      expect(pack.assetTypeBreakdown.length).toBe(2);
      expect(pack.recommendations).toBeDefined();
    });
  });

  describe('Job Execution', () => {
    it('should execute daily job successfully', async () => {
      const mockFetchAudits = async () => [
        createMockAudit({ auditedAt: new Date().toISOString() }),
      ];

      const result = await executeDailyJob(mockFetchAudits);

      expect(result.success).toBe(true);
      expect(result.jobName).toBe('daily-summary');
      expect(result.output).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle job failure gracefully', async () => {
      const mockFetchAudits = async () => {
        throw new Error('Database connection failed');
      };

      const result = await executeDailyJob(mockFetchAudits);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });
  });

  describe('Output Redaction', () => {
    it('should redact engineer names', () => {
      const output: DailySummary = {
        date: '2026-01-11',
        generatedAt: '2026-01-11T12:00:00Z',
        counts: { totalAudits: 1, validCount: 1, invalidCount: 0, reviewQueueCount: 0, validRate: 1 },
        topIssues: [],
        topEngineers: [
          { engineerId: 'eng-001', engineerName: 'John Smith', auditCount: 1, validRate: 1 },
        ],
        topTemplates: [],
      };

      const redacted = redactOutput(output);

      expect(redacted.topEngineers[0].engineerName).toBe('J. S.');
    });
  });

  describe('Job Schedule', () => {
    it('should have valid cron expressions', () => {
      expect(JOB_SCHEDULE.daily.cron).toBe('0 6 * * *');
      expect(JOB_SCHEDULE.weekly.cron).toBe('0 7 * * 1');
      expect(JOB_SCHEDULE.monthly.cron).toBe('0 8 1 * *');
    });

    it('should have descriptions for all schedules', () => {
      expect(JOB_SCHEDULE.daily.description).toBeTruthy();
      expect(JOB_SCHEDULE.weekly.description).toBeTruthy();
      expect(JOB_SCHEDULE.monthly.description).toBeTruthy();
    });
  });
});
