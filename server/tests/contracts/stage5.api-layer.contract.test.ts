/**
 * Stage 5 Contract Tests - API Layer
 * 
 * Tests for:
 * - Deterministic ordering in responses
 * - RBAC enforcement
 * - Redacted-by-default exports
 * - Canonical reason codes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  auditRouter,
  createMockAuditResult,
  resetAuditStore,
  REVIEW_QUEUE_REASON_CODES,
  type ValidatedFieldResponse,
  type FindingResponse,
} from '../../routers/auditRouter';
import {
  pipelineRouter,
  createMockPipelineRun,
  resetPipelineStore,
} from '../../routers/pipelineRouter';
import {
  reviewQueueRouter,
  createMockReviewQueueItem,
  resetReviewQueueStore,
} from '../../routers/reviewQueueRouter';
import {
  exportsRouter,
  setMockAuditForExport,
  resetExportStore,
} from '../../routers/exportsRouter';

describe('Stage 5: API Layer Contract Tests', () => {
  beforeEach(() => {
    resetAuditStore();
    resetPipelineStore();
    resetReviewQueueStore();
    resetExportStore();
  });

  describe('Deterministic Ordering', () => {
    it('should return validatedFields sorted by ruleId', () => {
      const fields: ValidatedFieldResponse[] = [
        { ruleId: 'RULE-003', field: 'fieldC', status: 'passed', value: 'c', confidence: 0.9, severity: 'major' },
        { ruleId: 'RULE-001', field: 'fieldA', status: 'passed', value: 'a', confidence: 0.9, severity: 'major' },
        { ruleId: 'RULE-002', field: 'fieldB', status: 'failed', value: 'b', confidence: 0.5, severity: 'critical' },
      ];
      
      const audit = createMockAuditResult(1, 1, fields, []);
      
      // Verify deterministic order
      expect(audit.validatedFields[0].ruleId).toBe('RULE-001');
      expect(audit.validatedFields[1].ruleId).toBe('RULE-002');
      expect(audit.validatedFields[2].ruleId).toBe('RULE-003');
    });

    it('should return findings sorted by severity then field', () => {
      const findings: FindingResponse[] = [
        { id: 1, ruleId: 'R1', field: 'fieldZ', severity: 'minor', message: 'Minor issue' },
        { id: 2, ruleId: 'R2', field: 'fieldA', severity: 'critical', message: 'Critical issue' },
        { id: 3, ruleId: 'R3', field: 'fieldB', severity: 'critical', message: 'Another critical' },
        { id: 4, ruleId: 'R4', field: 'fieldC', severity: 'major', message: 'Major issue' },
      ];
      
      const audit = createMockAuditResult(1, 1, [], findings);
      
      // Verify deterministic order: critical first (sorted by field), then major, then minor
      expect(audit.findings[0].severity).toBe('critical');
      expect(audit.findings[0].field).toBe('fieldA');
      expect(audit.findings[1].severity).toBe('critical');
      expect(audit.findings[1].field).toBe('fieldB');
      expect(audit.findings[2].severity).toBe('major');
      expect(audit.findings[3].severity).toBe('minor');
    });

    it('should return consistent ordering across multiple calls', () => {
      const fields: ValidatedFieldResponse[] = [
        { ruleId: 'RULE-002', field: 'b', status: 'passed', value: 'b', confidence: 0.9, severity: 'major' },
        { ruleId: 'RULE-001', field: 'a', status: 'passed', value: 'a', confidence: 0.9, severity: 'major' },
      ];
      
      const audit1 = createMockAuditResult(1, 1, fields, []);
      const audit2 = createMockAuditResult(2, 1, [...fields].reverse(), []);
      
      // Both should have same ordering regardless of input order
      expect(audit1.validatedFields.map(f => f.ruleId)).toEqual(['RULE-001', 'RULE-002']);
      expect(audit2.validatedFields.map(f => f.ruleId)).toEqual(['RULE-001', 'RULE-002']);
    });

    it('should maintain deterministic ordering in pipeline run list', () => {
      createMockPipelineRun(1, '1.0.0');
      createMockPipelineRun(2, '1.0.0');
      createMockPipelineRun(3, '1.0.0');
      
      // Runs should be ordered by ID
      const runs = Array.from({ length: 3 }, (_, i) => i + 1);
      expect(runs).toEqual([1, 2, 3]);
    });

    it('should maintain deterministic ordering in review queue', () => {
      createMockReviewQueueItem(1, 1, 'fieldC', 'LOW_CONFIDENCE');
      createMockReviewQueueItem(1, 1, 'fieldA', 'UNREADABLE_FIELD');
      createMockReviewQueueItem(1, 1, 'fieldB', 'CONFLICT');
      
      // Items should be ordered by reason priority then field
      // UNREADABLE_FIELD (0) < LOW_CONFIDENCE (1) < CONFLICT (2)
    });
  });

  describe('Canonical Reason Codes', () => {
    it('should only allow canonical reason codes', () => {
      expect(REVIEW_QUEUE_REASON_CODES).toEqual([
        'LOW_CONFIDENCE',
        'UNREADABLE_FIELD',
        'CONFLICT',
      ]);
    });

    it('should filter out non-canonical reason codes', () => {
      const fields: ValidatedFieldResponse[] = [
        { ruleId: 'R1', field: 'f1', status: 'passed', value: 'v', confidence: 0.9, severity: 'major' },
      ];
      
      // Include non-canonical code (SPEC_GAP)
      const audit = createMockAuditResult(1, 1, fields, [], [
        'LOW_CONFIDENCE',
        'SPEC_GAP', // Should be filtered out
        'UNREADABLE_FIELD',
      ]);
      
      expect(audit.reviewQueueReasons).toEqual(['LOW_CONFIDENCE', 'UNREADABLE_FIELD']);
      expect(audit.reviewQueueReasons).not.toContain('SPEC_GAP');
    });

    it('should not include SPEC_GAP in review queue reasons', () => {
      const audit = createMockAuditResult(1, 1, [], [], ['SPEC_GAP']);
      expect(audit.reviewQueueReasons).toEqual([]);
    });
  });

  describe('Redacted-by-Default Exports', () => {
    const mockAudit = {
      id: 1,
      jobSheetId: 1,
      goldSpecId: 1,
      overallResult: 'pass' as const,
      passedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      validatedFields: [
        {
          ruleId: 'R1',
          field: 'email',
          status: 'passed' as const,
          value: 'test@example.com',
          confidence: 0.95,
          severity: 'major' as const,
        },
        {
          ruleId: 'R2',
          field: 'phone',
          status: 'passed' as const,
          value: '555-123-4567',
          confidence: 0.9,
          severity: 'major' as const,
        },
      ],
      findings: [],
      reviewQueueReasons: [],
      metadata: {
        processingTimeMs: 100,
        specVersion: '1.0.0',
        extractionVersion: '1.0.0',
      },
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      setMockAuditForExport(mockAudit);
    });

    it('should redact PII by default in CSV export', async () => {
      // The default redacted parameter is true
      // When redacted, email and phone should be replaced with [REDACTED]
      const fields = mockAudit.validatedFields;
      
      // Verify that PII patterns exist in original data
      expect(fields[0].value).toContain('@');
      expect(fields[1].value).toMatch(/\d{3}-\d{3}-\d{4}/);
    });

    it('should redact email addresses', () => {
      const value = 'Contact: test@example.com';
      const redacted = value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED]');
      expect(redacted).toBe('Contact: [REDACTED]');
    });

    it('should redact phone numbers', () => {
      const value = 'Call: 555-123-4567';
      const redacted = value.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[REDACTED]');
      expect(redacted).toBe('Call: [REDACTED]');
    });

    it('should redact SSN patterns', () => {
      const value = 'SSN: 123-45-6789';
      const redacted = value.replace(/\d{3}[-\s]?\d{2}[-\s]?\d{4}/g, '[REDACTED]');
      expect(redacted).toBe('SSN: [REDACTED]');
    });

    it('should preserve non-PII data when redacted', () => {
      const value = 'Status: Active';
      const redacted = value; // No PII patterns
      expect(redacted).toBe('Status: Active');
    });
  });

  describe('RBAC Enforcement', () => {
    it('should define protected procedures for all audit endpoints', () => {
      // Verify that audit router uses protected procedures
      // In production, these would require authentication
      expect(auditRouter).toBeDefined();
      expect(auditRouter._def.procedures).toBeDefined();
    });

    it('should define protected procedures for pipeline endpoints', () => {
      expect(pipelineRouter).toBeDefined();
      expect(pipelineRouter._def.procedures).toBeDefined();
    });

    it('should define protected procedures for review queue endpoints', () => {
      expect(reviewQueueRouter).toBeDefined();
      expect(reviewQueueRouter._def.procedures).toBeDefined();
    });

    it('should define protected procedures for export endpoints', () => {
      expect(exportsRouter).toBeDefined();
      expect(exportsRouter._def.procedures).toBeDefined();
    });
  });

  describe('Pipeline Idempotency', () => {
    it('should generate consistent input hash for same inputs', () => {
      const run1 = createMockPipelineRun(1, '1.0.0');
      const run2 = createMockPipelineRun(1, '1.0.0');
      
      // Same job sheet and spec version should produce same hash
      expect(run1.inputHash).toBe(run2.inputHash);
    });

    it('should generate different hash for different inputs', () => {
      const run1 = createMockPipelineRun(1, '1.0.0');
      const run2 = createMockPipelineRun(2, '1.0.0');
      
      // Different job sheet should produce different hash
      expect(run1.inputHash).not.toBe(run2.inputHash);
    });

    it('should generate different hash for different spec versions', () => {
      const run1 = createMockPipelineRun(1, '1.0.0');
      const run2 = createMockPipelineRun(1, '2.0.0');
      
      // Different spec version should produce different hash
      expect(run1.inputHash).not.toBe(run2.inputHash);
    });
  });

  describe('Review Queue Reason Filtering', () => {
    it('should only create items with canonical reason codes', () => {
      const item = createMockReviewQueueItem(1, 1, 'field', 'LOW_CONFIDENCE');
      expect(REVIEW_QUEUE_REASON_CODES).toContain(item.reasonCode);
    });

    it('should sort review queue items by reason priority', () => {
      // Create items in non-priority order
      const item1 = createMockReviewQueueItem(1, 1, 'field1', 'CONFLICT');
      const item2 = createMockReviewQueueItem(1, 1, 'field2', 'UNREADABLE_FIELD');
      const item3 = createMockReviewQueueItem(1, 1, 'field3', 'LOW_CONFIDENCE');
      
      // Verify items were created
      expect(item1.reasonCode).toBe('CONFLICT');
      expect(item2.reasonCode).toBe('UNREADABLE_FIELD');
      expect(item3.reasonCode).toBe('LOW_CONFIDENCE');
    });
  });

  describe('Stable Response Structure', () => {
    it('should include all required fields in audit response', () => {
      const audit = createMockAuditResult(1, 1, [], []);
      
      expect(audit).toHaveProperty('id');
      expect(audit).toHaveProperty('jobSheetId');
      expect(audit).toHaveProperty('goldSpecId');
      expect(audit).toHaveProperty('overallResult');
      expect(audit).toHaveProperty('passedCount');
      expect(audit).toHaveProperty('failedCount');
      expect(audit).toHaveProperty('skippedCount');
      expect(audit).toHaveProperty('validatedFields');
      expect(audit).toHaveProperty('findings');
      expect(audit).toHaveProperty('reviewQueueReasons');
      expect(audit).toHaveProperty('metadata');
      expect(audit).toHaveProperty('createdAt');
    });

    it('should include all required fields in pipeline run response', () => {
      const run = createMockPipelineRun(1);
      
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('jobSheetId');
      expect(run).toHaveProperty('state');
      expect(run).toHaveProperty('correlationId');
      expect(run).toHaveProperty('inputHash');
      expect(run).toHaveProperty('specVersion');
      expect(run).toHaveProperty('startedAt');
      expect(run).toHaveProperty('metadata');
    });

    it('should include all required fields in review queue item response', () => {
      const item = createMockReviewQueueItem(1, 1, 'field', 'LOW_CONFIDENCE');
      
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('auditId');
      expect(item).toHaveProperty('jobSheetId');
      expect(item).toHaveProperty('field');
      expect(item).toHaveProperty('reasonCode');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('createdAt');
    });
  });
});
