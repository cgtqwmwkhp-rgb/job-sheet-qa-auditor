/**
 * Persistence Service Types
 * 
 * Defines the persistence layer interface for append-only artifact storage.
 */

import type { ExtractionResult, ExtractionArtifact } from '../extraction/types';
import type { ValidationResult, ValidationArtifact } from '../validation/types';

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  /** Enable content hashing for integrity verification */
  enableHashing: boolean;
  /** Pipeline version for tracking */
  pipelineVersion: string;
  /** Enable determinism verification */
  enableDeterminismCheck: boolean;
}

/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  enableHashing: true,
  pipelineVersion: '1.0.0',
  enableDeterminismCheck: true,
};

/**
 * Stored extraction artifact record
 */
export interface StoredExtractionArtifact {
  id: number;
  correlationId: string;
  jobSheetId: number;
  schemaVersion: string;
  extractionJson: ExtractionArtifact;
  contentHash: string;
  extractionMethod: string;
  ocrEngineVersion?: string;
  pageCount: number;
  processingTimeMs: number;
  createdAt: Date;
}

/**
 * Stored validation artifact record
 */
export interface StoredValidationArtifact {
  id: number;
  correlationId: string;
  jobSheetId: number;
  extractionArtifactId: number;
  goldSpecId: number;
  schemaVersion: string;
  validationJson: ValidationArtifact;
  contentHash: string;
  overallResult: string;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  confidenceScore?: number;
  processingTimeMs: number;
  createdAt: Date;
}

/**
 * Stored validated field record
 */
export interface StoredValidatedField {
  id: number;
  validationArtifactId: number;
  ruleId: string;
  field: string;
  status: 'passed' | 'failed' | 'skipped';
  extractedValue?: string;
  confidence?: number;
  pageNumber?: number;
  severity?: string;
  message?: string;
  orderIndex: number;
  createdAt: Date;
}

/**
 * Pipeline run status
 */
export type PipelineStatus = 
  | 'pending'
  | 'extracting'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'review_queue';

/**
 * Pipeline run record
 */
export interface PipelineRunRecord {
  id: number;
  correlationId: string;
  jobSheetId: number;
  pipelineVersion: string;
  status: PipelineStatus;
  extractionArtifactId?: number;
  validationArtifactId?: number;
  errorMessage?: string;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
  totalTimeMs?: number;
}

/**
 * Retention policy record
 */
export interface RetentionPolicyRecord {
  id: number;
  name: string;
  description?: string;
  entityType: string;
  retentionDays: number;
  archiveBeforeDelete: boolean;
  archiveLocation?: string;
  isActive: boolean;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Legal hold record
 */
export interface LegalHoldRecord {
  id: number;
  entityType: string;
  entityId: number;
  reason: string;
  caseReference?: string;
  placedBy: number;
  placedAt: Date;
  releasedAt?: Date;
  releasedBy?: number;
  releaseReason?: string;
}

/**
 * Retention audit action types
 */
export type RetentionAction = 
  | 'ARCHIVE'
  | 'DELETE'
  | 'HOLD_PLACED'
  | 'HOLD_RELEASED'
  | 'POLICY_APPLIED';

/**
 * Retention audit log entry
 */
export interface RetentionAuditEntry {
  id: number;
  action: RetentionAction;
  entityType: string;
  entityId: number;
  policyId?: number;
  archiveLocation?: string;
  archiveHash?: string;
  performedBy?: number;
  details?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Determinism checksum record
 */
export interface DeterminismChecksumRecord {
  id: number;
  entityType: string;
  entityId: number;
  inputHash: string;
  outputHash: string;
  pipelineVersion: string;
  verified: boolean;
  verifiedAt?: Date;
  createdAt: Date;
}

/**
 * Persistence service interface
 */
export interface IPersistenceService {
  /**
   * Store extraction artifact (append-only)
   */
  storeExtractionArtifact(
    jobSheetId: number,
    result: ExtractionResult,
    artifact: ExtractionArtifact
  ): Promise<StoredExtractionArtifact>;

  /**
   * Store validation artifact (append-only)
   */
  storeValidationArtifact(
    jobSheetId: number,
    extractionArtifactId: number,
    goldSpecId: number,
    result: ValidationResult,
    artifact: ValidationArtifact
  ): Promise<StoredValidationArtifact>;

  /**
   * Get extraction artifact by ID
   */
  getExtractionArtifact(id: number): Promise<StoredExtractionArtifact | null>;

  /**
   * Get validation artifact by ID
   */
  getValidationArtifact(id: number): Promise<StoredValidationArtifact | null>;

  /**
   * Get validated fields for a validation artifact
   */
  getValidatedFields(validationArtifactId: number): Promise<StoredValidatedField[]>;

  /**
   * Create pipeline run
   */
  createPipelineRun(jobSheetId: number): Promise<PipelineRunRecord>;

  /**
   * Update pipeline run status
   */
  updatePipelineRun(
    correlationId: string,
    updates: Partial<Pick<PipelineRunRecord, 'status' | 'extractionArtifactId' | 'validationArtifactId' | 'errorMessage' | 'errorCode' | 'completedAt' | 'totalTimeMs'>>
  ): Promise<void>;

  /**
   * Get pipeline run by correlation ID
   */
  getPipelineRun(correlationId: string): Promise<PipelineRunRecord | null>;

  /**
   * Verify determinism of an artifact
   */
  verifyDeterminism(
    entityType: string,
    entityId: number,
    inputHash: string,
    outputHash: string
  ): Promise<boolean>;
}

/**
 * Retention service interface
 */
export interface IRetentionService {
  /**
   * Create retention policy
   */
  createPolicy(policy: Omit<RetentionPolicyRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<RetentionPolicyRecord>;

  /**
   * Get active policies for entity type
   */
  getPoliciesForEntity(entityType: string): Promise<RetentionPolicyRecord[]>;

  /**
   * Place legal hold
   */
  placeLegalHold(hold: Omit<LegalHoldRecord, 'id' | 'placedAt' | 'releasedAt' | 'releasedBy' | 'releaseReason'>): Promise<LegalHoldRecord>;

  /**
   * Release legal hold
   */
  releaseLegalHold(holdId: number, releasedBy: number, releaseReason: string): Promise<void>;

  /**
   * Check if entity has active legal hold
   */
  hasActiveLegalHold(entityType: string, entityId: number): Promise<boolean>;

  /**
   * Get entities eligible for retention action
   */
  getEligibleForRetention(entityType: string, policyId: number): Promise<number[]>;

  /**
   * Log retention action
   */
  logRetentionAction(entry: Omit<RetentionAuditEntry, 'id' | 'createdAt'>): Promise<void>;

  /**
   * Get retention audit log for entity
   */
  getRetentionAuditLog(entityType: string, entityId: number): Promise<RetentionAuditEntry[]>;
}
