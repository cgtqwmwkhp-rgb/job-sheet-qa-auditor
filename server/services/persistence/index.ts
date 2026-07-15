/**
 * Persistence Service Module
 *
 * Provides append-only artifact storage and retention management.
 */

// Types
export type {
  PersistenceConfig,
  StoredExtractionArtifact,
  StoredValidationArtifact,
  StoredValidatedField,
  PipelineRunRecord,
  PipelineStatus,
  RetentionPolicyRecord,
  LegalHoldRecord,
  RetentionAuditEntry,
  RetentionAction,
  RetentionOperationalStatus,
  DeterminismChecksumRecord,
  IPersistenceService,
  IRetentionService,
} from "./types";

export { DEFAULT_PERSISTENCE_CONFIG } from "./types";

// Persistence service
export {
  InMemoryPersistenceService,
  createPersistenceService,
  getPersistenceService,
  resetPersistenceService,
  resetPersistenceStore,
} from "./persistenceService";

// Retention service
export {
  InMemoryRetentionService,
  createRetentionService,
  getRetentionService,
  resetRetentionService,
  resetRetentionStore,
  RETENTION_LEGAL_HOLD_NOTE,
} from "./retentionService";
