/**
 * Stage 4 Contract Tests: Persistence + Retention
 * 
 * Tests for:
 * - Append-only artifact storage
 * - Content hashing and integrity
 * - Determinism verification
 * - Retention policies and legal holds
 * - Pipeline run tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPersistenceService,
  resetPersistenceStore,
  createRetentionService,
  resetRetentionStore,
  type IPersistenceService,
  type IRetentionService,
} from '../../services/persistence';
import type { ExtractionResult, ExtractionArtifact } from '../../services/extraction/types';
import type { ValidationResult, ValidationArtifact } from '../../services/validation/types';

describe('Stage 4: Persistence + Retention', () => {
  let persistenceService: IPersistenceService;
  let retentionService: IRetentionService;

  beforeEach(() => {
    resetPersistenceStore();
    resetRetentionStore();
    persistenceService = createPersistenceService({
      pipelineVersion: '1.0.0-test',
      enableHashing: true,
      enableDeterminismCheck: true,
    });
    retentionService = createRetentionService();
  });

  describe('Extraction Artifact Storage', () => {
    const mockExtractionResult: ExtractionResult = {
      success: true,
      correlationId: 'test-correlation-123',
      fields: new Map([
        ['customerName', {
          field: 'customerName',
          value: 'Test Customer',
          confidence: 0.95,
          confidenceLevel: 'high' as const,
          pageNumber: 1,
          method: 'keyword' as const,
          normalized: false,
        }],
      ]),
      missingFields: [],
      lowConfidenceFields: [],
      metadata: {
        totalPages: 2,
        processingTimeMs: 150,
        extractionVersion: '1.0.0',
      },
    };

    const mockExtractionArtifact: ExtractionArtifact = {
      version: '1.0.0',
      generatedAt: '2026-01-04T12:00:00.000Z',
      correlationId: 'test-correlation-123',
      fields: {
        customerName: {
          value: 'Test Customer',
          confidence: 0.95,
          pageNumber: 1,
          method: 'keyword',
        },
      },
      metadata: {
        totalPages: 2,
        processingTimeMs: 150,
        extractionVersion: '1.0.0',
        missingFields: [],
        lowConfidenceFields: [],
      },
    };

    it('should store extraction artifact with content hash', async () => {
      const stored = await persistenceService.storeExtractionArtifact(
        1,
        mockExtractionResult,
        mockExtractionArtifact
      );

      expect(stored.id).toBe(1);
      expect(stored.correlationId).toBe('test-correlation-123');
      expect(stored.jobSheetId).toBe(1);
      expect(stored.contentHash).toBeTruthy();
      expect(stored.contentHash.length).toBe(64); // SHA-256 hex
      expect(stored.extractionMethod).toBe('EMBEDDED_TEXT');
      expect(stored.pageCount).toBe(2);
    });

    it('should retrieve stored extraction artifact', async () => {
      const stored = await persistenceService.storeExtractionArtifact(
        1,
        mockExtractionResult,
        mockExtractionArtifact
      );

      const retrieved = await persistenceService.getExtractionArtifact(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(stored.id);
      expect(retrieved!.extractionJson).toEqual(mockExtractionArtifact);
    });

    it('should return null for non-existent artifact', async () => {
      const retrieved = await persistenceService.getExtractionArtifact(999);
      expect(retrieved).toBeNull();
    });

    it('should generate consistent content hash for same input', async () => {
      const stored1 = await persistenceService.storeExtractionArtifact(
        1,
        mockExtractionResult,
        mockExtractionArtifact
      );

      resetPersistenceStore();
      const newService = createPersistenceService({
        pipelineVersion: '1.0.0-test',
        enableHashing: true,
      });

      const stored2 = await newService.storeExtractionArtifact(
        1,
        mockExtractionResult,
        mockExtractionArtifact
      );

      expect(stored1.contentHash).toBe(stored2.contentHash);
    });
  });

  describe('Validation Artifact Storage', () => {
    const mockValidationResult: ValidationResult = {
      passed: true,
      correlationId: 'test-correlation-456',
      validatedFields: [
        {
          ruleId: 'RULE-001',
          field: 'customerName',
          status: 'passed',
          value: 'Test Customer',
          confidence: 0.95,
          pageNumber: 1,
          severity: 'major',
        },
        {
          ruleId: 'RULE-002',
          field: 'jobDate',
          status: 'failed',
          value: null,
          confidence: 0,
          severity: 'major',
          message: 'Required field missing',
        },
      ],
      findings: [],
      summary: {
        totalRules: 2,
        passedRules: 1,
        failedRules: 1,
        skippedRules: 0,
        criticalFailures: 0,
        majorFailures: 1,
        minorFailures: 0,
        infoFailures: 0,
      },
      metadata: {
        processingTimeMs: 50,
        validationVersion: '1.0.0',
        specPackId: 'base',
        specPackVersion: '1.0.0',
      },
    };

    const mockValidationArtifact: ValidationArtifact = {
      version: '1.0.0',
      generatedAt: '2026-01-04T12:00:00.000Z',
      correlationId: 'test-correlation-456',
      passed: true,
      validatedFields: [
        {
          ruleId: 'RULE-001',
          field: 'customerName',
          status: 'passed',
          value: 'Test Customer',
          confidence: 0.95,
          pageNumber: 1,
          severity: 'major',
        },
        {
          ruleId: 'RULE-002',
          field: 'jobDate',
          status: 'failed',
          value: null,
          confidence: 0,
          severity: 'major',
          message: 'Required field missing',
        },
      ],
      findings: [],
      summary: {
        totalRules: 2,
        passedRules: 1,
        failedRules: 1,
        skippedRules: 0,
        criticalFailures: 0,
        majorFailures: 1,
        minorFailures: 0,
        infoFailures: 0,
      },
      metadata: {
        processingTimeMs: 50,
        validationVersion: '1.0.0',
        specPackId: 'base',
        specPackVersion: '1.0.0',
      },
    };

    it('should store validation artifact with content hash', async () => {
      const stored = await persistenceService.storeValidationArtifact(
        1,
        1,
        1,
        mockValidationResult,
        mockValidationArtifact
      );

      expect(stored.id).toBe(1);
      expect(stored.correlationId).toBe('test-correlation-456');
      expect(stored.contentHash).toBeTruthy();
      expect(stored.overallResult).toBe('pass');
      expect(stored.passedCount).toBe(1);
      expect(stored.failedCount).toBe(1);
    });

    it('should store validated fields with deterministic ordering', async () => {
      const stored = await persistenceService.storeValidationArtifact(
        1,
        1,
        1,
        mockValidationResult,
        mockValidationArtifact
      );

      const fields = await persistenceService.getValidatedFields(stored.id);

      expect(fields).toHaveLength(2);
      expect(fields[0].orderIndex).toBe(0);
      expect(fields[0].ruleId).toBe('RULE-001');
      expect(fields[1].orderIndex).toBe(1);
      expect(fields[1].ruleId).toBe('RULE-002');
    });

    it('should preserve field order across retrievals', async () => {
      const stored = await persistenceService.storeValidationArtifact(
        1,
        1,
        1,
        mockValidationResult,
        mockValidationArtifact
      );

      const fields1 = await persistenceService.getValidatedFields(stored.id);
      const fields2 = await persistenceService.getValidatedFields(stored.id);

      expect(fields1.map(f => f.ruleId)).toEqual(fields2.map(f => f.ruleId));
    });
  });

  describe('Pipeline Run Tracking', () => {
    it('should create pipeline run with correlation ID', async () => {
      const run = await persistenceService.createPipelineRun(1);

      expect(run.id).toBe(1);
      expect(run.correlationId).toBeTruthy();
      expect(run.jobSheetId).toBe(1);
      expect(run.status).toBe('pending');
      expect(run.startedAt).toBeInstanceOf(Date);
    });

    it('should update pipeline run status', async () => {
      const run = await persistenceService.createPipelineRun(1);

      await persistenceService.updatePipelineRun(run.correlationId, {
        status: 'extracting',
      });

      const updated = await persistenceService.getPipelineRun(run.correlationId);
      expect(updated!.status).toBe('extracting');
    });

    it('should track extraction and validation artifact IDs', async () => {
      const run = await persistenceService.createPipelineRun(1);

      await persistenceService.updatePipelineRun(run.correlationId, {
        status: 'completed',
        extractionArtifactId: 1,
        validationArtifactId: 1,
        completedAt: new Date(),
        totalTimeMs: 200,
      });

      const updated = await persistenceService.getPipelineRun(run.correlationId);
      expect(updated!.extractionArtifactId).toBe(1);
      expect(updated!.validationArtifactId).toBe(1);
      expect(updated!.totalTimeMs).toBe(200);
    });

    it('should track pipeline failures', async () => {
      const run = await persistenceService.createPipelineRun(1);

      await persistenceService.updatePipelineRun(run.correlationId, {
        status: 'failed',
        errorMessage: 'OCR service unavailable',
        errorCode: 'OCR_FAILURE',
      });

      const updated = await persistenceService.getPipelineRun(run.correlationId);
      expect(updated!.status).toBe('failed');
      expect(updated!.errorMessage).toBe('OCR service unavailable');
      expect(updated!.errorCode).toBe('OCR_FAILURE');
    });
  });

  describe('Retention Policies', () => {
    it('should create retention policy', async () => {
      const policy = await retentionService.createPolicy({
        name: 'extraction-artifacts-90d',
        description: 'Retain extraction artifacts for 90 days',
        entityType: 'extraction_artifact',
        retentionDays: 90,
        archiveBeforeDelete: true,
        archiveLocation: 's3://archive/extractions/',
        isActive: true,
        createdBy: 1,
      });

      expect(policy.id).toBe(1);
      expect(policy.name).toBe('extraction-artifacts-90d');
      expect(policy.retentionDays).toBe(90);
    });

    it('should get policies for entity type', async () => {
      await retentionService.createPolicy({
        name: 'extraction-90d',
        entityType: 'extraction_artifact',
        retentionDays: 90,
        archiveBeforeDelete: true,
        isActive: true,
        createdBy: 1,
      });

      await retentionService.createPolicy({
        name: 'validation-180d',
        entityType: 'validation_artifact',
        retentionDays: 180,
        archiveBeforeDelete: true,
        isActive: true,
        createdBy: 1,
      });

      const extractionPolicies = await retentionService.getPoliciesForEntity('extraction_artifact');
      expect(extractionPolicies).toHaveLength(1);
      expect(extractionPolicies[0].name).toBe('extraction-90d');
    });

    it('should only return active policies', async () => {
      await retentionService.createPolicy({
        name: 'active-policy',
        entityType: 'test_entity',
        retentionDays: 30,
        archiveBeforeDelete: false,
        isActive: true,
        createdBy: 1,
      });

      await retentionService.createPolicy({
        name: 'inactive-policy',
        entityType: 'test_entity',
        retentionDays: 30,
        archiveBeforeDelete: false,
        isActive: false,
        createdBy: 1,
      });

      const policies = await retentionService.getPoliciesForEntity('test_entity');
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('active-policy');
    });
  });

  describe('Legal Holds', () => {
    it('should place legal hold on entity', async () => {
      const hold = await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        caseReference: 'CASE-2026-001',
        placedBy: 1,
      });

      expect(hold.id).toBe(1);
      expect(hold.entityType).toBe('job_sheet');
      expect(hold.entityId).toBe(1);
      expect(hold.placedAt).toBeInstanceOf(Date);
      expect(hold.releasedAt).toBeUndefined();
    });

    it('should detect active legal hold', async () => {
      await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        placedBy: 1,
      });

      const hasHold = await retentionService.hasActiveLegalHold('job_sheet', 1);
      expect(hasHold).toBe(true);

      const noHold = await retentionService.hasActiveLegalHold('job_sheet', 2);
      expect(noHold).toBe(false);
    });

    it('should release legal hold', async () => {
      const hold = await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        placedBy: 1,
      });

      await retentionService.releaseLegalHold(hold.id, 2, 'Case resolved');

      const hasHold = await retentionService.hasActiveLegalHold('job_sheet', 1);
      expect(hasHold).toBe(false);
    });

    it('should not allow releasing already released hold', async () => {
      const hold = await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        placedBy: 1,
      });

      await retentionService.releaseLegalHold(hold.id, 2, 'Case resolved');

      await expect(
        retentionService.releaseLegalHold(hold.id, 3, 'Duplicate release')
      ).rejects.toThrow('already released');
    });
  });

  describe('Retention Audit Log', () => {
    it('should log legal hold placement', async () => {
      await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        placedBy: 1,
      });

      const log = await retentionService.getRetentionAuditLog('job_sheet', 1);
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe('HOLD_PLACED');
      expect(log[0].performedBy).toBe(1);
    });

    it('should log legal hold release', async () => {
      const hold = await retentionService.placeLegalHold({
        entityType: 'job_sheet',
        entityId: 1,
        reason: 'Pending litigation',
        placedBy: 1,
      });

      await retentionService.releaseLegalHold(hold.id, 2, 'Case resolved');

      const log = await retentionService.getRetentionAuditLog('job_sheet', 1);
      expect(log).toHaveLength(2);
      expect(log[0].action).toBe('HOLD_PLACED');
      expect(log[1].action).toBe('HOLD_RELEASED');
    });

    it('should return audit log in chronological order', async () => {
      await retentionService.logRetentionAction({
        action: 'ARCHIVE',
        entityType: 'job_sheet',
        entityId: 1,
        performedBy: 1,
      });

      await retentionService.logRetentionAction({
        action: 'DELETE',
        entityType: 'job_sheet',
        entityId: 1,
        performedBy: 1,
      });

      const log = await retentionService.getRetentionAuditLog('job_sheet', 1);
      expect(log[0].action).toBe('ARCHIVE');
      expect(log[1].action).toBe('DELETE');
      expect(log[0].createdAt.getTime()).toBeLessThanOrEqual(log[1].createdAt.getTime());
    });
  });

  describe('Determinism Verification', () => {
    it('should verify deterministic output', async () => {
      const isValid = await persistenceService.verifyDeterminism(
        'extraction',
        1,
        'input-hash-123',
        'output-hash-456'
      );

      expect(isValid).toBe(true);
    });
  });

  describe('Append-Only Guarantees', () => {
    it('should assign sequential IDs to extraction artifacts', async () => {
      const mockResult: ExtractionResult = {
        success: true,
        correlationId: 'test-1',
        fields: new Map(),
        missingFields: [],
        lowConfidenceFields: [],
        metadata: {
          totalPages: 1,
          processingTimeMs: 100,
          extractionVersion: '1.0.0',
        },
      };

      const mockArtifact: ExtractionArtifact = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        correlationId: 'test-1',
        fields: {},
        metadata: {
          totalPages: 1,
          processingTimeMs: 100,
          extractionVersion: '1.0.0',
          missingFields: [],
          lowConfidenceFields: [],
        },
      };

      const stored1 = await persistenceService.storeExtractionArtifact(1, mockResult, mockArtifact);
      const stored2 = await persistenceService.storeExtractionArtifact(2, { ...mockResult, correlationId: 'test-2' }, { ...mockArtifact, correlationId: 'test-2' });
      const stored3 = await persistenceService.storeExtractionArtifact(3, { ...mockResult, correlationId: 'test-3' }, { ...mockArtifact, correlationId: 'test-3' });

      expect(stored1.id).toBe(1);
      expect(stored2.id).toBe(2);
      expect(stored3.id).toBe(3);
    });

    it('should preserve immutable creation timestamps', async () => {
      const mockResult: ExtractionResult = {
        success: true,
        correlationId: 'test-immutable',
        fields: new Map(),
        missingFields: [],
        lowConfidenceFields: [],
        metadata: {
          totalPages: 1,
          processingTimeMs: 100,
          extractionVersion: '1.0.0',
        },
      };

      const mockArtifact: ExtractionArtifact = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        correlationId: 'test-immutable',
        fields: {},
        metadata: {
          totalPages: 1,
          processingTimeMs: 100,
          extractionVersion: '1.0.0',
          missingFields: [],
          lowConfidenceFields: [],
        },
      };

      const stored = await persistenceService.storeExtractionArtifact(1, mockResult, mockArtifact);
      const originalTimestamp = stored.createdAt;

      // Retrieve again
      const retrieved = await persistenceService.getExtractionArtifact(stored.id);
      expect(retrieved!.createdAt.getTime()).toBe(originalTimestamp.getTime());
    });
  });
});
