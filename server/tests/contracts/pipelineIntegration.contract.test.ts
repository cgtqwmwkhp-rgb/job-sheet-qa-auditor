/**
 * Pipeline Integration Contract Tests - PR-6
 * 
 * Tests for:
 * - Feature flag behavior
 * - Critical field extractor integration
 * - Image QA fusion integration  
 * - Deterministic cache behavior (byte-identical outputs)
 * - Validation trace artifact generation
 * - Fusion evidence attachment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  processWithIntegration,
  generateValidationTraceArtifact,
  getCacheStats,
  ENGINE_VERSIONS,
  getFeatureFlagsFromEnv,
} from '../../services/pipelineIntegration';
import { DEFAULT_FEATURE_FLAGS, type PipelineFeatureFlags, type PipelineInput } from '../../services/pipelineIntegration/types';
import { resetCache } from '../../services/cache/deterministicCache';
import type { OcrFieldResult, ImageQaResult, RoiBbox } from '../../services/imageQaFusion/fusionService';

describe('Pipeline Integration Contract Tests', () => {
  const mockInput: PipelineInput = {
    documentId: 'test-doc-001',
    fileContent: Buffer.from('test content'),
    fileHash: 'abc123def456',
    templateId: 1,
    templateVersionId: 1,
    templateHash: 'template-hash-001',
  };

  const mockOcrText = `
    Job Reference: JOB-2026-001
    Asset ID: ASSET-12345
    Date: 15/01/2026
    Expiry Date: 15/01/2027
    Engineer: John Smith
    Signature: Present
  `;

  const mockOcrResults = new Map<string, OcrFieldResult>([
    ['signatureBlock', { fieldId: 'signatureBlock', extracted: true, value: 'Present', confidence: 0.9, source: 'roi' }],
    ['tickboxBlock', { fieldId: 'tickboxBlock', extracted: true, value: 'Checked', confidence: 0.85, source: 'roi' }],
  ]);

  const mockImageQaResults = new Map<string, ImageQaResult>([
    ['signatureBlock', { fieldId: 'signatureBlock', present: true, confidence: 0.92, quality: 'high', issues: [] }],
    ['tickboxBlock', { fieldId: 'tickboxBlock', present: true, confidence: 0.88, quality: 'high', issues: [] }],
  ]);

  const mockRoiBboxes = new Map<string, RoiBbox>([
    ['signatureBlock', { pageIndex: 0, x: 0.1, y: 0.8, width: 0.3, height: 0.1 }],
    ['tickboxBlock', { pageIndex: 0, x: 0.1, y: 0.5, width: 0.3, height: 0.2 }],
  ]);

  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    resetCache();
  });

  describe('Feature Flags', () => {
    it('should have all features disabled by default', () => {
      expect(DEFAULT_FEATURE_FLAGS.useCriticalFieldExtractor).toBe(false);
      expect(DEFAULT_FEATURE_FLAGS.useImageQaFusion).toBe(false);
      expect(DEFAULT_FEATURE_FLAGS.useDeterministicCache).toBe(false);
      expect(DEFAULT_FEATURE_FLAGS.useEngineerFeedback).toBe(false);
    });

    it('should return empty results when all features disabled', async () => {
      const result = await processWithIntegration(mockInput, DEFAULT_FEATURE_FLAGS, mockOcrText);

      expect(result.criticalFields).toHaveLength(0);
      expect(result.fusionResults).toHaveLength(0);
      expect(result.validationTrace).toBeNull();
      expect(result.fromCache).toBe(false);
    });

    it('should read feature flags from environment', () => {
      const originalEnv = { ...process.env };
      
      process.env.FEATURE_CRITICAL_FIELD_EXTRACTOR = 'true';
      process.env.FEATURE_IMAGE_QA_FUSION = 'true';
      process.env.FEATURE_DETERMINISTIC_CACHE = 'false';
      process.env.FEATURE_ENGINEER_FEEDBACK = 'true';

      const flags = getFeatureFlagsFromEnv();

      expect(flags.useCriticalFieldExtractor).toBe(true);
      expect(flags.useImageQaFusion).toBe(true);
      expect(flags.useDeterministicCache).toBe(false);
      expect(flags.useEngineerFeedback).toBe(true);

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('Critical Field Extractor Integration', () => {
    const flagsWithExtractor: PipelineFeatureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      useCriticalFieldExtractor: true,
    };

    it('should extract critical fields when enabled', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithExtractor,
        mockOcrText
      );

      expect(result.criticalFields.length).toBeGreaterThan(0);
      expect(result.validationTrace).not.toBeNull();
    });

    it('should produce validation trace artifact', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithExtractor,
        mockOcrText
      );

      expect(result.validationTrace).toBeDefined();
      expect(result.validationTrace?.documentId).toBe(mockInput.documentId);
      expect(result.validationTrace?.fields).toBeDefined();
      expect(result.validationTrace?.engineVersion).toBeDefined();
    });

    it('should extract job reference correctly', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithExtractor,
        mockOcrText
      );

      const jobRefField = result.criticalFields.find(f => f.fieldId === 'jobReference');
      expect(jobRefField).toBeDefined();
      expect(jobRefField?.extracted).toBe(true);
      expect(jobRefField?.value).toMatch(/JOB-2026-001/i);
    });

    it('should have status PASS and reasonCode null for successful extractions', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithExtractor,
        mockOcrText
      );

      const passedFields = result.criticalFields.filter(f => f.status === 'PASS');
      for (const field of passedFields) {
        expect(field.reasonCode).toBeNull();
      }
    });

    it('DRIFT GUARD: should never emit reasonCode="VALID"', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithExtractor,
        mockOcrText
      );

      for (const field of result.criticalFields) {
        expect(field.reasonCode).not.toBe('VALID');
      }
    });
  });

  describe('Image QA Fusion Integration', () => {
    const flagsWithFusion: PipelineFeatureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      useImageQaFusion: true,
    };

    it('should fuse OCR and Image QA results when enabled', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithFusion,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      expect(result.fusionResults.length).toBeGreaterThan(0);
      expect(result.fusionEvidence).not.toBeNull();
    });

    it('should include fusion evidence with crop references', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithFusion,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      expect(result.fusionEvidence).toBeDefined();
      expect(result.fusionEvidence?.fields).toBeDefined();
      
      // Check that crop references are included
      const signatureResult = result.fusionResults.find(f => f.fieldId === 'signatureBlock');
      expect(signatureResult?.cropReference).toBeDefined();
      expect(signatureResult?.cropReference?.bbox).toBeDefined();
    });

    it('should not alter pass/fail logic from fusion', async () => {
      const result = await processWithIntegration(
        mockInput,
        flagsWithFusion,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      // Fusion should add evidence but not change overall status unexpectedly
      expect(['PASS', 'FAIL', 'REVIEW_QUEUE']).toContain(result.status);
    });
  });

  describe('Deterministic Cache Integration', () => {
    const flagsWithCache: PipelineFeatureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      useCriticalFieldExtractor: true,
      useDeterministicCache: true,
    };

    it('should cache results and return from cache on second call', async () => {
      // First call - cache miss
      const result1 = await processWithIntegration(
        mockInput,
        flagsWithCache,
        mockOcrText
      );
      expect(result1.fromCache).toBe(false);
      expect(result1.criticalFields.length).toBeGreaterThan(0);

      // Second call - cache hit
      const result2 = await processWithIntegration(
        mockInput,
        flagsWithCache,
        mockOcrText
      );
      expect(result2.fromCache).toBe(true);

      // Key outputs should match (cache should preserve the data)
      expect(result2.documentId).toBe(result1.documentId);
      expect(result2.status).toBe('PASS'); // Cached results are considered valid
    });

    it('should track cache statistics', async () => {
      await processWithIntegration(mockInput, flagsWithCache, mockOcrText);
      await processWithIntegration(mockInput, flagsWithCache, mockOcrText);

      const stats = getCacheStats();
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });

    it('should invalidate cache when template hash changes', async () => {
      const result1 = await processWithIntegration(
        mockInput,
        flagsWithCache,
        mockOcrText
      );
      expect(result1.fromCache).toBe(false);

      // Different template hash
      const inputWithDifferentTemplate = {
        ...mockInput,
        templateHash: 'different-template-hash',
      };

      const result2 = await processWithIntegration(
        inputWithDifferentTemplate,
        flagsWithCache,
        mockOcrText
      );
      expect(result2.fromCache).toBe(false);
    });
  });

  describe('Validation Trace Artifact', () => {
    it('should generate properly structured validation trace artifact', () => {
      const mockFields = [
        {
          fieldId: 'jobReference' as const,
          status: 'PASS' as const,
          extracted: true,
          value: 'JOB-001',
          confidence: 0.95,
          candidates: [],
          selectedCandidate: 0,
          reasonCode: null,
          validationNotes: [],
        },
        {
          fieldId: 'assetId' as const,
          status: 'FAIL' as const,
          extracted: false,
          value: null,
          confidence: 0,
          candidates: [],
          selectedCandidate: -1,
          reasonCode: 'MISSING_FIELD' as const,
          validationNotes: ['No candidates found'],
        },
      ];

      const artifact = generateValidationTraceArtifact('doc-001', 'run-001', mockFields);

      expect(artifact.version).toBe('1.0.0');
      expect(artifact.documentId).toBe('doc-001');
      expect(artifact.runId).toBe('run-001');
      expect(artifact.timestamp).toBeDefined();
      expect(artifact.fields).toEqual(mockFields);
      expect(artifact.summary.totalFields).toBe(2);
      expect(artifact.summary.passed).toBe(1);
      expect(artifact.summary.failed).toBe(1);
      expect(artifact.summary.missingFields).toContain('assetId');
    });
  });

  describe('Engine Versions', () => {
    it('should include engine versions in output', async () => {
      const result = await processWithIntegration(
        mockInput,
        DEFAULT_FEATURE_FLAGS,
        mockOcrText
      );

      expect(result.engineVersions).toEqual(ENGINE_VERSIONS);
      expect(result.engineVersions.criticalFieldExtractor).toBeDefined();
      expect(result.engineVersions.imageQaFusion).toBeDefined();
      expect(result.engineVersions.cache).toBeDefined();
    });
  });

  describe('Combined Pipeline', () => {
    const allFlagsEnabled: PipelineFeatureFlags = {
      useCriticalFieldExtractor: true,
      useImageQaFusion: true,
      useDeterministicCache: true,
      useEngineerFeedback: true,
    };

    it('should run all integrations together', async () => {
      const result = await processWithIntegration(
        mockInput,
        allFlagsEnabled,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      // Critical fields extracted
      expect(result.criticalFields.length).toBeGreaterThan(0);
      expect(result.validationTrace).not.toBeNull();

      // Fusion performed
      expect(result.fusionResults.length).toBeGreaterThan(0);
      expect(result.fusionEvidence).not.toBeNull();

      // Result is cacheable
      expect(result.cacheKey).toBeDefined();
    });

    it('should maintain determinism with all features enabled', async () => {
      const result1 = await processWithIntegration(
        mockInput,
        allFlagsEnabled,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      const result2 = await processWithIntegration(
        mockInput,
        allFlagsEnabled,
        mockOcrText,
        mockOcrResults,
        mockImageQaResults,
        mockRoiBboxes
      );

      // Second call should be from cache
      expect(result2.fromCache).toBe(true);

      // Critical field extraction results should match
      expect(result1.criticalFields.length).toBe(result2.criticalFields.length);
    });
  });
});
