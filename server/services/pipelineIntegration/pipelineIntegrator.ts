/**
 * Pipeline Integrator
 * 
 * PR-6: Central integration layer that wires enhancement modules
 * into the document processing pipeline with feature flags.
 */

import { createHash } from 'crypto';
import {
  extractAllCriticalFields,
  type FieldExtractionResult,
  type ValidationTrace,
} from '../extraction/criticalFieldExtractor';
import {
  fuseAllFields,
  type OcrFieldResult,
  type ImageQaResult,
  type FusedFieldResult,
  type FusionEvidence,
  type RoiBbox,
} from '../imageQaFusion/fusionService';
import {
  getProcessingCache,
  getCachedResult,
  cacheResult,
  CacheStore,
  getCurrentEngineVersions,
  type CacheKeyComponents,
  type ProcessingResult,
  type CacheStats,
} from '../cache/deterministicCache';
import {
  generateEngineerScorecard,
  generateEngineerFixPack,
} from '../engineerFeedback/feedbackService';
import type {
  PipelineFeatureFlags,
  PipelineInput,
  PipelineOutput,
  PipelineContext,
  ValidationTraceArtifact,
} from './types';
import { DEFAULT_FEATURE_FLAGS } from './types';

/**
 * Engine version constants for cache invalidation
 */
export const ENGINE_VERSIONS = {
  criticalFieldExtractor: '1.0.0',
  imageQaFusion: '1.0.0',
  cache: '1.0.0',
} as const;

/**
 * Process document through integrated pipeline
 */
export async function processWithIntegration(
  input: PipelineInput,
  flags: PipelineFeatureFlags = DEFAULT_FEATURE_FLAGS,
  ocrText?: string,
  ocrResults?: Map<string, OcrFieldResult>,
  imageQaResults?: Map<string, ImageQaResult>,
  roiBboxes?: Map<string, RoiBbox>,
): Promise<PipelineOutput> {
  const startTime = Date.now();
  const context: PipelineContext = {
    flags,
    runId: `run-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    startedAt: new Date(),
  };

  // Check cache if enabled
  if (flags.useDeterministicCache && input.templateHash) {
    const cached = getCachedResult(input.fileContent, { templateHash: input.templateHash });
    
    if (cached.fromCache && cached.result) {
      return {
        documentId: input.documentId,
        status: 'PASS', // Cached results were previously validated
        criticalFields: cached.result.extractedFields as unknown as FieldExtractionResult[],
        validationTrace: cached.result.validationTrace as ValidationTrace | null,
        fusionResults: cached.result.fusionResults as unknown as FusedFieldResult[],
        fusionEvidence: null,
        fromCache: true,
        cacheKey: `${input.fileHash}:${input.templateHash}`,
        processingTimeMs: cached.cacheCheckTimeMs,
        engineVersions: { ...ENGINE_VERSIONS },
      };
    }
  }

  // Initialize results
  let criticalFields: FieldExtractionResult[] = [];
  let validationTrace: ValidationTrace | null = null;
  let fusionResults: FusedFieldResult[] = [];
  let fusionEvidence: FusionEvidence | null = null;

  // Critical field extraction
  if (flags.useCriticalFieldExtractor && ocrText) {
    validationTrace = extractAllCriticalFields(input.documentId, ocrText);
    criticalFields = validationTrace.fields;
  }

  // Image QA fusion for tickboxes/signatures
  if (flags.useImageQaFusion && ocrResults && imageQaResults && roiBboxes) {
    fusionEvidence = fuseAllFields(
      input.documentId,
      ocrResults,
      imageQaResults,
      roiBboxes
    );
    fusionResults = fusionEvidence.fields;
  }

  // Determine overall status
  const status = determineStatus(criticalFields, fusionResults);

  // Build output
  const output: PipelineOutput = {
    documentId: input.documentId,
    status,
    criticalFields,
    validationTrace,
    fusionResults,
    fusionEvidence,
    fromCache: false,
    processingTimeMs: Date.now() - startTime,
    engineVersions: { ...ENGINE_VERSIONS },
  };

  // Store in cache if enabled
  if (flags.useDeterministicCache && input.templateHash) {
    const processingResult: ProcessingResult = {
      documentId: input.documentId,
      extractedFields: criticalFields as unknown as Record<string, unknown>,
      fusionResults: fusionResults as unknown as Record<string, unknown>,
      validationTrace,
      processingTimeMs: output.processingTimeMs,
    };
    cacheResult(input.fileContent, { templateHash: input.templateHash }, processingResult);
    output.cacheKey = `${input.fileHash}:${input.templateHash}`;
  }

  return output;
}

/**
 * Determine overall document status from extraction and fusion results
 */
function determineStatus(
  criticalFields: FieldExtractionResult[],
  fusionResults: FusedFieldResult[],
): 'PASS' | 'FAIL' | 'REVIEW_QUEUE' {
  // Check for any failures in critical fields
  const failedFields = criticalFields.filter(f => f.status === 'FAIL');
  const missingRequired = failedFields.filter(
    f => f.reasonCode === 'MISSING_FIELD' && isRequiredField(f.fieldId)
  );

  if (missingRequired.length > 0) {
    return 'FAIL';
  }

  // Check for conflicts or low confidence
  const hasConflicts = failedFields.some(f => f.reasonCode === 'CONFLICT');
  const hasLowConfidence = failedFields.some(f => f.reasonCode === 'LOW_CONFIDENCE');

  if (hasConflicts || hasLowConfidence) {
    return 'REVIEW_QUEUE';
  }

  // Check fusion results for issues
  const fusionIssues = fusionResults.filter(
    r => r.fusedOutcome === 'CONFLICT' || r.fusedOutcome === 'LOW_CONFIDENCE'
  );

  if (fusionIssues.length > 0) {
    return 'REVIEW_QUEUE';
  }

  return 'PASS';
}

/**
 * Check if a field is required
 */
function isRequiredField(fieldId: string): boolean {
  const requiredFields = [
    'jobReference',
    'assetId',
    'date',
    'engineerSignOff',
  ];
  return requiredFields.includes(fieldId);
}

/**
 * Generate validation trace artifact for persistence
 */
export function generateValidationTraceArtifact(
  documentId: string,
  runId: string,
  fields: FieldExtractionResult[],
): ValidationTraceArtifact {
  const passed = fields.filter(f => f.status === 'PASS');
  const failed = fields.filter(f => f.status === 'FAIL');

  return {
    version: '1.0.0',
    documentId,
    runId,
    timestamp: new Date().toISOString(),
    fields,
    summary: {
      totalFields: fields.length,
      extracted: fields.filter(f => f.extracted).length,
      passed: passed.length,
      failed: failed.length,
      missingFields: failed
        .filter(f => f.reasonCode === 'MISSING_FIELD')
        .map(f => f.fieldId),
      lowConfidenceFields: failed
        .filter(f => f.reasonCode === 'LOW_CONFIDENCE')
        .map(f => f.fieldId),
      conflictFields: failed
        .filter(f => f.reasonCode === 'CONFLICT')
        .map(f => f.fieldId),
    },
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const cache = getProcessingCache();
  return cache.getStats();
}

/**
 * Generate feature flags from environment
 */
export function getFeatureFlagsFromEnv(): PipelineFeatureFlags {
  return {
    useCriticalFieldExtractor:
      process.env.FEATURE_CRITICAL_FIELD_EXTRACTOR === 'true',
    useImageQaFusion: process.env.FEATURE_IMAGE_QA_FUSION === 'true',
    useDeterministicCache: process.env.FEATURE_DETERMINISTIC_CACHE === 'true',
    useEngineerFeedback: process.env.FEATURE_ENGINEER_FEEDBACK === 'true',
  };
}
