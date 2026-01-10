/**
 * Pipeline Integration Types
 * 
 * PR-6: Types for the integrated pipeline with enhancement modules.
 */

import type { FieldExtractionResult, ValidationTrace } from '../extraction/criticalFieldExtractor';
import type { FusedFieldResult, FusionEvidence } from '../imageQaFusion/fusionService';

/**
 * Feature flags for pipeline enhancements
 */
export interface PipelineFeatureFlags {
  /** Enable critical field extraction engine */
  useCriticalFieldExtractor: boolean;
  /** Enable OCR + Image QA fusion for signatures/tickboxes */
  useImageQaFusion: boolean;
  /** Enable deterministic caching */
  useDeterministicCache: boolean;
  /** Enable engineer feedback/scorecard generation */
  useEngineerFeedback: boolean;
}

/**
 * Default feature flags (all disabled for safe rollout)
 */
export const DEFAULT_FEATURE_FLAGS: PipelineFeatureFlags = {
  useCriticalFieldExtractor: false,
  useImageQaFusion: false,
  useDeterministicCache: false,
  useEngineerFeedback: false,
};

/**
 * Pipeline input for processing
 */
export interface PipelineInput {
  /** Unique document ID */
  documentId: string;
  /** File content as buffer */
  fileContent: Buffer;
  /** SHA256 hash of file content */
  fileHash: string;
  /** Template ID (if known) */
  templateId?: number;
  /** Template version ID (if known) */
  templateVersionId?: number;
  /** Template spec hash for caching */
  templateHash?: string;
}

/**
 * Pipeline output from processing
 */
export interface PipelineOutput {
  /** Document ID */
  documentId: string;
  /** Overall status */
  status: 'PASS' | 'FAIL' | 'REVIEW_QUEUE';
  /** Critical field extraction results */
  criticalFields: FieldExtractionResult[];
  /** Validation trace artifact */
  validationTrace: ValidationTrace | null;
  /** Fusion results for tickboxes/signatures */
  fusionResults: FusedFieldResult[];
  /** Full fusion evidence artifact */
  fusionEvidence: FusionEvidence | null;
  /** Whether result was from cache */
  fromCache: boolean;
  /** Cache key if cached */
  cacheKey?: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Engine versions used */
  engineVersions: {
    criticalFieldExtractor: string;
    imageQaFusion: string;
    cache: string;
  };
}

/**
 * Cache key components for deterministic caching
 */
export interface PipelineCacheKey {
  fileHash: string;
  templateHash: string;
  engineVersions: string;
}

/**
 * Pipeline processing context
 */
export interface PipelineContext {
  /** Feature flags */
  flags: PipelineFeatureFlags;
  /** Run ID for tracing */
  runId: string;
  /** Start timestamp */
  startedAt: Date;
}

/**
 * Validation trace artifact format
 */
export interface ValidationTraceArtifact {
  version: string;
  documentId: string;
  runId: string;
  timestamp: string;
  fields: FieldExtractionResult[];
  summary: {
    totalFields: number;
    extracted: number;
    passed: number;
    failed: number;
    missingFields: string[];
    lowConfidenceFields: string[];
    conflictFields: string[];
  };
}
