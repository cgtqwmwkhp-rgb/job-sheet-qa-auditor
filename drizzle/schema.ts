import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "qa_lead", "technician"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Gold Standard Specifications - versioned rule packs for validation
 */
export const goldSpecs = mysqlTable("gold_specs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  description: text("description"),
  /** JSON schema defining required fields and validation rules */
  schema: json("schema").notNull(),
  /** Layering: base, client, contract, workType */
  specType: mysqlEnum("specType", ["base", "client", "contract", "workType"]).default("base").notNull(),
  /** Parent spec ID for layered inheritance */
  parentSpecId: int("parentSpecId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoldSpec = typeof goldSpecs.$inferSelect;
export type InsertGoldSpec = typeof goldSpecs.$inferInsert;

/**
 * Job Sheets - uploaded documents for auditing
 */
export const jobSheets = mysqlTable("job_sheets", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference number from the job sheet */
  referenceNumber: varchar("referenceNumber", { length: 64 }),
  /** S3 URL of the uploaded file */
  fileUrl: varchar("fileUrl", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 256 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 64 }).notNull(),
  fileSizeBytes: int("fileSizeBytes"),
  /** SHA-256 hash for determinism verification */
  fileHash: varchar("fileHash", { length: 64 }),
  /** Processing status */
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "review_queue"]).default("pending").notNull(),
  /** Technician who submitted the job sheet */
  technicianId: int("technicianId"),
  /** Site/location information */
  siteInfo: text("siteInfo"),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type JobSheet = typeof jobSheets.$inferSelect;
export type InsertJobSheet = typeof jobSheets.$inferInsert;

/**
 * Audit Results - outcomes of job sheet validation
 */
export const auditResults = mysqlTable("audit_results", {
  id: int("id").autoincrement().primaryKey(),
  jobSheetId: int("jobSheetId").notNull(),
  /** Which gold spec version was used */
  goldSpecId: int("goldSpecId").notNull(),
  /** Unique run identifier for traceability */
  runId: varchar("runId", { length: 64 }).notNull(),
  /** Overall result */
  result: mysqlEnum("result", ["pass", "fail", "review_queue", "waived"]).notNull(),
  /** Overall confidence score 0-100 */
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }),
  /** Document strategy used: EMBEDDED_TEXT, OCR, HYBRID */
  documentStrategy: mysqlEnum("documentStrategy", ["embedded_text", "ocr", "hybrid"]).notNull(),
  /** OCR engine version used */
  ocrEngineVersion: varchar("ocrEngineVersion", { length: 32 }),
  /** Pipeline version for reproducibility */
  pipelineVersion: varchar("pipelineVersion", { length: 32 }).notNull(),
  /** Full canonical JSON audit report */
  reportJson: json("reportJson").notNull(),
  /** Processing time in milliseconds */
  processingTimeMs: int("processingTimeMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditResult = typeof auditResults.$inferSelect;
export type InsertAuditResult = typeof auditResults.$inferInsert;

/**
 * Audit Findings - individual defects/issues found
 */
export const auditFindings = mysqlTable("audit_findings", {
  id: int("id").autoincrement().primaryKey(),
  auditResultId: int("auditResultId").notNull(),
  /** Severity: S0 Blocker, S1 Critical, S2 Major, S3 Minor */
  severity: mysqlEnum("severity", ["S0", "S1", "S2", "S3"]).notNull(),
  /** Reason code from fixed set */
  reasonCode: mysqlEnum("reasonCode", [
    "MISSING_FIELD", "UNREADABLE_FIELD", "LOW_CONFIDENCE", "INVALID_FORMAT",
    "CONFLICT", "OUT_OF_POLICY", "INCOMPLETE_EVIDENCE", "OCR_FAILURE",
    "PIPELINE_ERROR", "SPEC_GAP", "SECURITY_RISK"
  ]).notNull(),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  /** Page number where issue was found */
  pageNumber: int("pageNumber"),
  /** Bounding box coordinates as JSON */
  boundingBox: json("boundingBox"),
  /** Raw extracted text snippet */
  rawSnippet: text("rawSnippet"),
  /** Normalized/cleaned snippet */
  normalisedSnippet: text("normalisedSnippet"),
  /** Confidence score for this specific finding */
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  /** Rule ID that triggered this finding */
  ruleId: varchar("ruleId", { length: 64 }),
  /** Human-readable explanation */
  whyItMatters: text("whyItMatters"),
  /** Suggested fix action */
  suggestedFix: text("suggestedFix"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditFinding = typeof auditFindings.$inferSelect;
export type InsertAuditFinding = typeof auditFindings.$inferInsert;

/**
 * Disputes - technician challenges to audit findings
 */
export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  auditFindingId: int("auditFindingId").notNull(),
  /** Technician who raised the dispute */
  raisedBy: int("raisedBy").notNull(),
  status: mysqlEnum("status", ["open", "under_review", "accepted", "rejected", "escalated"]).default("open").notNull(),
  /** Technician's explanation */
  reason: text("reason").notNull(),
  /** Supporting evidence URLs */
  evidenceUrls: json("evidenceUrls"),
  /** QA reviewer assigned */
  reviewerId: int("reviewerId"),
  /** Reviewer's decision notes */
  reviewNotes: text("reviewNotes"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;

/**
 * Waivers - approved exceptions to audit rules
 */
export const waivers = mysqlTable("waivers", {
  id: int("id").autoincrement().primaryKey(),
  auditFindingId: int("auditFindingId").notNull(),
  /** Who approved the waiver */
  approverId: int("approverId").notNull(),
  reason: text("reason").notNull(),
  /** When the waiver expires */
  expiresAt: timestamp("expiresAt"),
  /** Audit trail - full history as JSON */
  auditTrail: json("auditTrail").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Waiver = typeof waivers.$inferSelect;
export type InsertWaiver = typeof waivers.$inferInsert;

/**
 * System Audit Log - tracks all significant actions
 */
export const systemAuditLog = mysqlTable("system_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: int("entityId"),
  /** Before/after state as JSON */
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemAuditLog = typeof systemAuditLog.$inferSelect;
export type InsertSystemAuditLog = typeof systemAuditLog.$inferInsert;


/**
 * Processing Settings - configuration for document extraction pipeline
 */
export const processingSettings = mysqlTable("processing_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Setting key identifier */
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  /** Setting value as JSON for flexibility */
  settingValue: json("settingValue").notNull(),
  /** Human-readable description */
  description: text("description"),
  /** Category for grouping in UI */
  category: mysqlEnum("category", ["extraction", "validation", "performance", "notifications"]).default("extraction").notNull(),
  /** Last modified by user */
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessingSetting = typeof processingSettings.$inferSelect;
export type InsertProcessingSetting = typeof processingSettings.$inferInsert;
