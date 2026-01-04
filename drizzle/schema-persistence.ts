/**
 * Stage 4: Persistence Schema Extension
 * 
 * Append-only tables for audit trail and retention management.
 * These tables follow the immutability pattern - no updates, only inserts.
 */

import { int, mysqlTable, text, timestamp, varchar, json, boolean, decimal, bigint } from "drizzle-orm/mysql-core";

/**
 * Extraction Artifacts - immutable extraction results
 * 
 * Stores the raw extraction output from OCR/text extraction.
 * Each extraction run creates a new record (append-only).
 */
export const extractionArtifacts = mysqlTable("extraction_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  /** Correlation ID for tracing across services */
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  /** Job sheet this extraction belongs to */
  jobSheetId: int("jobSheetId").notNull(),
  /** Version of the extraction schema */
  schemaVersion: varchar("schemaVersion", { length: 16 }).notNull(),
  /** Full extraction result as canonical JSON */
  extractionJson: json("extractionJson").notNull(),
  /** SHA-256 hash of extractionJson for integrity verification */
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  /** Extraction method: EMBEDDED_TEXT, OCR, HYBRID */
  extractionMethod: varchar("extractionMethod", { length: 32 }).notNull(),
  /** OCR engine version if applicable */
  ocrEngineVersion: varchar("ocrEngineVersion", { length: 32 }),
  /** Number of pages processed */
  pageCount: int("pageCount").notNull(),
  /** Processing time in milliseconds */
  processingTimeMs: int("processingTimeMs").notNull(),
  /** Immutable creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExtractionArtifact = typeof extractionArtifacts.$inferSelect;
export type InsertExtractionArtifact = typeof extractionArtifacts.$inferInsert;

/**
 * Validation Artifacts - immutable validation results
 * 
 * Stores the validation output against a specific spec version.
 * Each validation run creates a new record (append-only).
 */
export const validationArtifacts = mysqlTable("validation_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  /** Correlation ID for tracing across services */
  correlationId: varchar("correlationId", { length: 64 }).notNull(),
  /** Job sheet this validation belongs to */
  jobSheetId: int("jobSheetId").notNull(),
  /** Extraction artifact used as input */
  extractionArtifactId: int("extractionArtifactId").notNull(),
  /** Gold spec version used for validation */
  goldSpecId: int("goldSpecId").notNull(),
  /** Version of the validation schema */
  schemaVersion: varchar("schemaVersion", { length: 16 }).notNull(),
  /** Full validation result as canonical JSON */
  validationJson: json("validationJson").notNull(),
  /** SHA-256 hash of validationJson for integrity verification */
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  /** Overall result: pass, fail, review_queue */
  overallResult: varchar("overallResult", { length: 32 }).notNull(),
  /** Count of passed rules */
  passedCount: int("passedCount").notNull(),
  /** Count of failed rules */
  failedCount: int("failedCount").notNull(),
  /** Count of skipped rules */
  skippedCount: int("skippedCount").notNull(),
  /** Overall confidence score 0-100 */
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }),
  /** Processing time in milliseconds */
  processingTimeMs: int("processingTimeMs").notNull(),
  /** Immutable creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ValidationArtifact = typeof validationArtifacts.$inferSelect;
export type InsertValidationArtifact = typeof validationArtifacts.$inferInsert;

/**
 * Validated Fields - individual field validation results
 * 
 * Stores each validated field from a validation run.
 * Supports the validatedFields contract requirement.
 */
export const validatedFields = mysqlTable("validated_fields", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent validation artifact */
  validationArtifactId: int("validationArtifactId").notNull(),
  /** Rule ID that was checked */
  ruleId: varchar("ruleId", { length: 64 }).notNull(),
  /** Canonical field name */
  field: varchar("field", { length: 128 }).notNull(),
  /** Validation status: passed, failed, skipped */
  status: varchar("status", { length: 16 }).notNull(),
  /** Extracted value (if available) */
  extractedValue: text("extractedValue"),
  /** Confidence score 0-1 */
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  /** Page number where field was found */
  pageNumber: int("pageNumber"),
  /** Rule severity: error, warning, info */
  severity: varchar("severity", { length: 16 }),
  /** Validation message */
  message: text("message"),
  /** Deterministic order index within validation */
  orderIndex: int("orderIndex").notNull(),
  /** Immutable creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ValidatedFieldRecord = typeof validatedFields.$inferSelect;
export type InsertValidatedField = typeof validatedFields.$inferInsert;

/**
 * Retention Policies - defines data retention rules
 */
export const retentionPolicies = mysqlTable("retention_policies", {
  id: int("id").autoincrement().primaryKey(),
  /** Policy name */
  name: varchar("name", { length: 128 }).notNull().unique(),
  /** Description of the policy */
  description: text("description"),
  /** Entity type this policy applies to */
  entityType: varchar("entityType", { length: 64 }).notNull(),
  /** Retention period in days */
  retentionDays: int("retentionDays").notNull(),
  /** Whether to archive before deletion */
  archiveBeforeDelete: boolean("archiveBeforeDelete").default(true).notNull(),
  /** Archive storage location (S3 path pattern) */
  archiveLocation: varchar("archiveLocation", { length: 512 }),
  /** Whether policy is active */
  isActive: boolean("isActive").default(true).notNull(),
  /** Created by user */
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RetentionPolicy = typeof retentionPolicies.$inferSelect;
export type InsertRetentionPolicy = typeof retentionPolicies.$inferInsert;

/**
 * Legal Holds - prevents deletion of specific records
 */
export const legalHolds = mysqlTable("legal_holds", {
  id: int("id").autoincrement().primaryKey(),
  /** Entity type being held */
  entityType: varchar("entityType", { length: 64 }).notNull(),
  /** Entity ID being held */
  entityId: int("entityId").notNull(),
  /** Reason for the hold */
  reason: text("reason").notNull(),
  /** Case/matter reference */
  caseReference: varchar("caseReference", { length: 128 }),
  /** Who placed the hold */
  placedBy: int("placedBy").notNull(),
  /** When the hold was placed */
  placedAt: timestamp("placedAt").defaultNow().notNull(),
  /** When the hold was released (null if still active) */
  releasedAt: timestamp("releasedAt"),
  /** Who released the hold */
  releasedBy: int("releasedBy"),
  /** Release reason */
  releaseReason: text("releaseReason"),
});

export type LegalHold = typeof legalHolds.$inferSelect;
export type InsertLegalHold = typeof legalHolds.$inferInsert;

/**
 * Retention Audit Log - tracks all retention actions (append-only)
 */
export const retentionAuditLog = mysqlTable("retention_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Action type: ARCHIVE, DELETE, HOLD_PLACED, HOLD_RELEASED */
  action: varchar("action", { length: 32 }).notNull(),
  /** Entity type affected */
  entityType: varchar("entityType", { length: 64 }).notNull(),
  /** Entity ID affected */
  entityId: int("entityId").notNull(),
  /** Policy that triggered the action (if applicable) */
  policyId: int("policyId"),
  /** Archive location (if archived) */
  archiveLocation: varchar("archiveLocation", { length: 512 }),
  /** SHA-256 hash of archived content */
  archiveHash: varchar("archiveHash", { length: 64 }),
  /** User who performed the action */
  performedBy: int("performedBy"),
  /** Additional details as JSON */
  details: json("details"),
  /** Immutable creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RetentionAuditLogEntry = typeof retentionAuditLog.$inferSelect;
export type InsertRetentionAuditLog = typeof retentionAuditLog.$inferInsert;

/**
 * Pipeline Runs - tracks document processing pipeline executions
 */
export const pipelineRuns = mysqlTable("pipeline_runs", {
  id: int("id").autoincrement().primaryKey(),
  /** Correlation ID for the entire pipeline run */
  correlationId: varchar("correlationId", { length: 64 }).notNull().unique(),
  /** Job sheet being processed */
  jobSheetId: int("jobSheetId").notNull(),
  /** Pipeline version */
  pipelineVersion: varchar("pipelineVersion", { length: 32 }).notNull(),
  /** Current status */
  status: varchar("status", { length: 32 }).notNull(),
  /** Extraction artifact ID (when extraction completes) */
  extractionArtifactId: int("extractionArtifactId"),
  /** Validation artifact ID (when validation completes) */
  validationArtifactId: int("validationArtifactId"),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** Error code if failed */
  errorCode: varchar("errorCode", { length: 32 }),
  /** Start time */
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  /** Completion time */
  completedAt: timestamp("completedAt"),
  /** Total processing time in milliseconds */
  totalTimeMs: int("totalTimeMs"),
});

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRun = typeof pipelineRuns.$inferInsert;

/**
 * Determinism Checksums - tracks output determinism for verification
 */
export const determinismChecksums = mysqlTable("determinism_checksums", {
  id: int("id").autoincrement().primaryKey(),
  /** Entity type being tracked */
  entityType: varchar("entityType", { length: 64 }).notNull(),
  /** Entity ID being tracked */
  entityId: int("entityId").notNull(),
  /** Input hash (for reproducibility verification) */
  inputHash: varchar("inputHash", { length: 64 }).notNull(),
  /** Output hash */
  outputHash: varchar("outputHash", { length: 64 }).notNull(),
  /** Pipeline version that produced this output */
  pipelineVersion: varchar("pipelineVersion", { length: 32 }).notNull(),
  /** Verification status */
  verified: boolean("verified").default(false).notNull(),
  /** Verification timestamp */
  verifiedAt: timestamp("verifiedAt"),
  /** Immutable creation timestamp */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeterminismChecksum = typeof determinismChecksums.$inferSelect;
export type InsertDeterminismChecksum = typeof determinismChecksums.$inferInsert;
