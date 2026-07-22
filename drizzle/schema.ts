import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  decimal,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "qa_lead", "technician"])
    .default("user")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Gold Standard Specifications - versioned rule packs for validation
 */
export const goldSpecs: any = mysqlTable("gold_specs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  description: text("description"),
  /** JSON schema defining required fields and validation rules */
  schema: json("schema").notNull(),
  /** Layering: base, client, contract, workType */
  specType: mysqlEnum("specType", ["base", "client", "contract", "workType"])
    .default("base")
    .notNull(),
  /** Parent spec ID for layered inheritance */
  parentSpecId: int("parentSpecId").references((): any => goldSpecs.id),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoldSpec = typeof goldSpecs.$inferSelect;
export type InsertGoldSpec = typeof goldSpecs.$inferInsert;

/**
 * Job Sheets - uploaded documents for auditing
 */
export const jobSheets = mysqlTable(
  "job_sheets",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Reference number from the job sheet */
    referenceNumber: varchar("referenceNumber", { length: 64 }),
    /** Stable identity supplied by an upstream ERP / ingest client. */
    externalJobId: varchar("externalJobId", { length: 128 }),
    sourceSystem: varchar("sourceSystem", { length: 64 }),
    deviceId: varchar("deviceId", { length: 128 }),
    /** S3 URL of the uploaded file */
    fileUrl: varchar("fileUrl", { length: 512 }).notNull(),
    fileKey: varchar("fileKey", { length: 256 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileType: varchar("fileType", { length: 64 }).notNull(),
    fileSizeBytes: int("fileSizeBytes"),
    /** SHA-256 hash for determinism verification */
    fileHash: varchar("fileHash", { length: 64 }),
    /** Processing status */
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "completed",
      "failed",
      "review_queue",
    ])
      .default("pending")
      .notNull(),
    /** Technician who submitted the job sheet */
    technicianId: int("technicianId").references(() => users.id),
    /** Site/location information */
    siteInfo: text("siteInfo"),
    uploadedBy: int("uploadedBy")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    externalJobIdIdx: index("job_sheets_externalJobId_idx").on(
      table.externalJobId
    ),
    sourceSystemIdx: index("job_sheets_sourceSystem_idx").on(
      table.sourceSystem
    ),
    deviceIdIdx: index("job_sheets_deviceId_idx").on(table.deviceId),
  })
);

export type JobSheet = typeof jobSheets.$inferSelect;
export type InsertJobSheet = typeof jobSheets.$inferInsert;

/**
 * Audit Results - outcomes of job sheet validation
 */
export const auditResults = mysqlTable("audit_results", {
  id: int("id").autoincrement().primaryKey(),
  jobSheetId: int("jobSheetId")
    .notNull()
    .references(() => jobSheets.id),
  /** Which gold spec version was used */
  goldSpecId: int("goldSpecId")
    .notNull()
    .references(() => goldSpecs.id),
  /** Unique run identifier for traceability */
  runId: varchar("runId", { length: 64 }).notNull(),
  /** Overall result */
  result: mysqlEnum("result", [
    "pass",
    "fail",
    "review_queue",
    "waived",
  ]).notNull(),
  /** Overall confidence score 0-100 */
  confidenceScore: decimal("confidenceScore", { precision: 5, scale: 2 }),
  /** Document strategy used: EMBEDDED_TEXT, OCR, HYBRID */
  documentStrategy: mysqlEnum("documentStrategy", [
    "embedded_text",
    "ocr",
    "hybrid",
  ]).notNull(),
  /** OCR engine version used */
  ocrEngineVersion: varchar("ocrEngineVersion", { length: 32 }),
  /** Pipeline version for reproducibility */
  pipelineVersion: varchar("pipelineVersion", { length: 32 }).notNull(),
  /**
   * Canonical JSON audit report. It intentionally excludes the full raw OCR text;
   * authorized reviewers retrieve the original job sheet on demand instead.
   */
  reportJson: json("reportJson").notNull(),
  /** Processing time in milliseconds */
  processingTimeMs: int("processingTimeMs"),
  /**
   * Wave-7: template lineage for closed-loop memory.
   * Nullable for legacy rows; new audits should populate from selection.
   * FKs declared in drizzle/0012_template_memory.sql (tables defined later in this file).
   */
  templateId: int("templateId"),
  templateVersionId: int("templateVersionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditResult = typeof auditResults.$inferSelect;
export type InsertAuditResult = typeof auditResults.$inferInsert;

/**
 * Normalized before/after pair-comparison output. reportJson retains the
 * complete legacy artifact; this table supports indexed evidence queries.
 */
export const photoEvidencePairs = mysqlTable(
  "photo_evidence_pairs",
  {
    id: int("id").autoincrement().primaryKey(),
    jobSheetId: int("jobSheetId")
      .notNull()
      .references(() => jobSheets.id),
    auditResultId: int("auditResultId")
      .notNull()
      .references(() => auditResults.id),
    pairIndex: int("pairIndex").notNull(),
    beforePage: int("beforePage"),
    afterPage: int("afterPage"),
    axes: json("axes").$type<Record<string, string>>().notNull(),
    confidence: decimal("confidence", { precision: 5, scale: 4 }),
    confidenceBand: varchar("confidenceBand", { length: 16 }),
    provider: varchar("provider", { length: 32 }).notNull(),
    model: varchar("model", { length: 128 }),
    reasoning: text("reasoning"),
    fileHash: varchar("fileHash", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    auditPairUnique: uniqueIndex("photo_evidence_pairs_audit_pair_unique").on(
      table.auditResultId,
      table.pairIndex
    ),
    jobAuditIdx: index("photo_evidence_pairs_job_audit_idx").on(
      table.jobSheetId,
      table.auditResultId
    ),
  })
);

export type PhotoEvidencePair = typeof photoEvidencePairs.$inferSelect;
export type InsertPhotoEvidencePair = typeof photoEvidencePairs.$inferInsert;

/**
 * Parsed Parts Used lines. reportJson remains the backwards-compatible
 * processor snapshot; these rows are the queryable reconciliation surface.
 */
export const partsLines = mysqlTable(
  "parts_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    jobSheetId: int("jobSheetId")
      .notNull()
      .references(() => jobSheets.id),
    auditResultId: int("auditResultId")
      .notNull()
      .references(() => auditResults.id),
    lineIndex: int("lineIndex").notNull(),
    partNumber: varchar("partNumber", { length: 128 }),
    description: text("description"),
    quantity: varchar("quantity", { length: 32 }),
    rawLine: text("rawLine").notNull(),
    isComplete: boolean("isComplete").notNull(),
    source: varchar("source", { length: 32 }).notNull().default("parts_used"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    auditLineUnique: uniqueIndex("parts_lines_audit_line_unique").on(
      table.auditResultId,
      table.lineIndex
    ),
    jobAuditIdx: index("parts_lines_job_audit_idx").on(
      table.jobSheetId,
      table.auditResultId
    ),
  })
);

export type PartsLine = typeof partsLines.$inferSelect;
export type InsertPartsLine = typeof partsLines.$inferInsert;

/**
 * Audit Findings - individual defects/issues found
 */
export const auditFindings = mysqlTable("audit_findings", {
  id: int("id").autoincrement().primaryKey(),
  auditResultId: int("auditResultId")
    .notNull()
    .references(() => auditResults.id),
  /** Severity: S0 Blocker, S1 Critical, S2 Major, S3 Minor */
  severity: mysqlEnum("severity", ["S0", "S1", "S2", "S3"]).notNull(),
  /** Reason code from fixed set */
  reasonCode: mysqlEnum("reasonCode", [
    "MISSING_FIELD",
    "UNREADABLE_FIELD",
    "LOW_CONFIDENCE",
    "INVALID_FORMAT",
    "CONFLICT",
    "OUT_OF_POLICY",
    "INCOMPLETE_EVIDENCE",
    "OCR_FAILURE",
    "PIPELINE_ERROR",
    "SPEC_GAP",
    "SECURITY_RISK",
    "EXTRACTED",
    "INK_UNVERIFIED",
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
  /**
   * PR-10: reviewer resolution on this finding.
   * open = unresolved; waived/overridden/flagged/approved = action applied.
   */
  resolutionStatus: mysqlEnum("resolutionStatus", [
    "open",
    "waived",
    "overridden",
    "flagged",
    "approved",
  ])
    .default("open")
    .notNull(),
  /** Reason captured with the resolution action */
  resolutionReason: text("resolutionReason"),
  /** User who applied the resolution */
  resolvedBy: int("resolvedBy").references(() => users.id),
  resolvedAt: timestamp("resolvedAt"),
  /** Prior status for soft-undo */
  previousResolutionStatus: mysqlEnum("previousResolutionStatus", [
    "open",
    "waived",
    "overridden",
    "flagged",
    "approved",
  ]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditFinding = typeof auditFindings.$inferSelect;
export type InsertAuditFinding = typeof auditFindings.$inferInsert;
export type FindingResolutionStatus =
  | "open"
  | "waived"
  | "overridden"
  | "flagged"
  | "approved";

/**
 * Disputes - technician challenges to audit findings
 */
export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  auditFindingId: int("auditFindingId")
    .notNull()
    .references(() => auditFindings.id),
  /** Technician who raised the dispute */
  raisedBy: int("raisedBy")
    .notNull()
    .references(() => users.id),
  status: mysqlEnum("status", [
    "open",
    "under_review",
    "accepted",
    "rejected",
    "escalated",
  ])
    .default("open")
    .notNull(),
  /** Technician's explanation */
  reason: text("reason").notNull(),
  /** Supporting evidence URLs */
  evidenceUrls: json("evidenceUrls"),
  /** QA reviewer assigned */
  reviewerId: int("reviewerId").references(() => users.id),
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
  auditFindingId: int("auditFindingId")
    .notNull()
    .references(() => auditFindings.id),
  /** Who approved the waiver */
  approverId: int("approverId")
    .notNull()
    .references(() => users.id),
  reason: text("reason").notNull(),
  /** When the waiver expires */
  expiresAt: timestamp("expiresAt"),
  /** Audit trail - full history as JSON */
  auditTrail: json("auditTrail").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Undo revokes a waiver instead of deleting its audit evidence. */
  revokedAt: timestamp("revokedAt"),
  revokedBy: int("revokedBy").references(() => users.id),
});

export type Waiver = typeof waivers.$inferSelect;
export type InsertWaiver = typeof waivers.$inferInsert;

/**
 * System Audit Log - tracks all significant actions
 */
export const systemAuditLog = mysqlTable("system_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
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
  category: mysqlEnum("category", [
    "extraction",
    "validation",
    "performance",
    "notifications",
  ])
    .default("extraction")
    .notNull(),
  /** Last modified by user */
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessingSetting = typeof processingSettings.$inferSelect;
export type InsertProcessingSetting = typeof processingSettings.$inferInsert;

// ============================================================================
// TEMPLATE SYSTEM (PR-A)
// ============================================================================

/**
 * Templates - document type templates for validation
 * Replaces hardcoded goldStandardSpec with DB-driven templates
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique template identifier (e.g., 'job-sheet-standard', 'repair-report-v2') */
  templateId: varchar("templateId", { length: 128 }).notNull().unique(),
  /** Human-readable name */
  name: varchar("name", { length: 255 }).notNull(),
  /** Client/customer this template is for (null = global) */
  client: varchar("client", { length: 128 }),
  /** Asset type this template applies to */
  assetType: varchar("assetType", { length: 128 }),
  /** Work type this template applies to */
  workType: varchar("workType", { length: 128 }),
  /** Template status: draft, active, deprecated, archived */
  status: mysqlEnum("status", ["draft", "active", "deprecated", "archived"])
    .default("draft")
    .notNull(),
  /** Description of the template */
  description: text("description"),
  createdBy: int("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

/**
 * Template Versions - versioned specification packs
 * Each version is immutable once created; new versions are appended
 */
export const templateVersions = mysqlTable("template_versions", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent template ID */
  templateId: int("templateId")
    .notNull()
    .references(() => templates.id),
  /** Semantic version (e.g., '1.0.0', '1.1.0') */
  version: varchar("version", { length: 32 }).notNull(),
  /** SHA-256 hash of specJson + selectionConfigJson for determinism */
  hashSha256: varchar("hashSha256", { length: 64 }).notNull(),
  /** The full specification JSON (fields, rules, etc.) */
  specJson: json("specJson").notNull(),
  /** Selection configuration for template matching */
  selectionConfigJson: json("selectionConfigJson").notNull(),
  /** ROI (Region of Interest) configuration for document zones (nullable) */
  roiJson: json("roiJson"),
  /** Whether this version is currently active for this template */
  isActive: boolean("isActive").default(false).notNull(),
  /** Change notes for this version */
  changeNotes: text("changeNotes"),
  createdBy: int("createdBy")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TemplateVersion = typeof templateVersions.$inferSelect;
export type InsertTemplateVersion = typeof templateVersions.$inferInsert;

/**
 * Selection Traces - audit trail for template selection decisions
 * Records why a particular template was selected (or not) for a job sheet
 */
export const selectionTraces = mysqlTable("selection_traces", {
  id: int("id").autoincrement().primaryKey(),
  /** Job sheet this selection was for */
  jobSheetId: int("jobSheetId")
    .notNull()
    .references(() => jobSheets.id),
  /** Selected template ID (null if no selection made) */
  templateId: int("templateId").references(() => templates.id),
  /** Selected version ID (null if no selection made) */
  versionId: int("versionId").references(() => templateVersions.id),
  /** Confidence band: HIGH (>=80), MEDIUM (50-79), LOW (<50) */
  confidenceBand: mysqlEnum("confidenceBand", [
    "HIGH",
    "MEDIUM",
    "LOW",
  ]).notNull(),
  /** Top confidence score (0-100) */
  topScore: decimal("topScore", { precision: 5, scale: 2 }).notNull(),
  /** Runner-up score for ambiguity detection */
  runnerUpScore: decimal("runnerUpScore", { precision: 5, scale: 2 }),
  /** Gap between top and runner-up */
  scoreGap: decimal("scoreGap", { precision: 5, scale: 2 }),
  /** Detailed scores for all candidates as JSON */
  scoresJson: json("scoresJson").notNull(),
  /** Matched tokens for the selected template */
  tokensJson: json("tokensJson").notNull(),
  /** Whether auto-processing was allowed based on selection */
  autoProcessingAllowed: boolean("autoProcessingAllowed")
    .default(false)
    .notNull(),
  /** Reason if auto-processing was blocked */
  blockReason: varchar("blockReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SelectionTrace = typeof selectionTraces.$inferSelect;
export type InsertSelectionTrace = typeof selectionTraces.$inferInsert;

/**
 * Failed Jobs — durable dead-letter queue for processing failures (PR-3)
 * Write-through from in-memory DLQ when DATABASE_URL is available.
 */
export const failedJobs = mysqlTable("failed_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobSheetId: int("jobSheetId")
    .notNull()
    .references(() => jobSheets.id),
  correlationId: varchar("correlationId", { length: 64 }),
  stage: mysqlEnum("stage", ["upload", "ocr", "analysis", "storage"]).notNull(),
  errorMessage: text("errorMessage").notNull(),
  errorCode: varchar("errorCode", { length: 64 }),
  errorStack: text("errorStack"),
  attempts: int("attempts").default(1).notNull(),
  maxAttempts: int("maxAttempts").default(3).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt").defaultNow().notNull(),
  metadata: json("metadata"),
  recoverable: boolean("recoverable").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type FailedJobRow = typeof failedJobs.$inferSelect;
export type InsertFailedJob = typeof failedJobs.$inferInsert;

/**
 * API Cost Events — durable FinOps ledger (PR-DATA-FINOPS)
 * Write-through from in-memory cost ledger when DATABASE_URL is available.
 * Restored on boot so restarts / scale-out do not wipe cost history.
 */
export const apiCostEvents = mysqlTable("api_cost_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  recordedAt: timestamp("recordedAt").notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  tool: varchar("tool", { length: 128 }).notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),
  jobSheetId: int("jobSheetId"),
  inputTokens: int("inputTokens").default(0).notNull(),
  outputTokens: int("outputTokens").default(0).notNull(),
  estimatedCostUsd: decimal("estimatedCostUsd", {
    precision: 12,
    scale: 6,
  }).notNull(),
  latencyMs: int("latencyMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiCostEventRow = typeof apiCostEvents.$inferSelect;
export type InsertApiCostEvent = typeof apiCostEvents.$inferInsert;

// ============================================================================
// COMMS — email outbox, FCM device tokens, notification inbox (PR-IO-COMMS)
// ============================================================================

/**
 * Email outbox — durable send ledger for ACS / Graph / SMTP / log providers.
 */
export const emailOutbox = mysqlTable("email_outbox", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").references(() => users.id),
  toEmail: varchar("toEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  bodyHtml: text("bodyHtml"),
  bodyText: text("bodyText"),
  provider: varchar("provider", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["queued", "sent", "failed"]).notNull(),
  error: text("error"),
  providerMessageId: varchar("providerMessageId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
});

export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
export type InsertEmailOutbox = typeof emailOutbox.$inferInsert;

/**
 * Device tokens — FCM registration for web/native push (J-TECH-03).
 */
export const deviceTokens = mysqlTable("device_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id),
  token: varchar("token", { length: 512 }).notNull().unique(),
  platform: mysqlEnum("platform", ["web", "ios", "android"])
    .default("web")
    .notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
export type InsertDeviceToken = typeof deviceTokens.$inferInsert;

/**
 * User notifications — DB-backed inbox for the header bell (J-NOTIF-01).
 */
export const userNotifications = mysqlTable("user_notifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["info", "success", "warning", "error"])
    .default("info")
    .notNull(),
  readAt: timestamp("readAt"),
  dismissedAt: timestamp("dismissedAt"),
  meta: json("meta"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserNotificationRow = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

/**
 * Webhook Subscriptions — durable registry (PR-IO-WEBHOOKS)
 * Write-through from in-memory webhook registry when DATABASE_URL is available.
 * Restored on boot so subscriptions survive process restarts.
 */
export const webhookSubscriptions = mysqlTable("webhook_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  url: text("url").notNull(),
  secret: varchar("secret", { length: 128 }).notNull(),
  events: json("events").$type<string[]>().notNull(),
  active: boolean("active").default(true).notNull(),
  retryCount: int("retryCount").default(3).notNull(),
  timeoutMs: int("timeoutMs").default(10000).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WebhookSubscriptionRow = typeof webhookSubscriptions.$inferSelect;
export type InsertWebhookSubscription =
  typeof webhookSubscriptions.$inferInsert;

/**
 * Webhook Delivery Log — durable signed delivery history (PR-IO-WEBHOOKS)
 * Stores HMAC signature + payload hash for each delivery attempt so
 * receivers (and ops) can verify what was signed and sent.
 */
export const webhookDeliveryLog = mysqlTable("webhook_delivery_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  webhookId: varchar("webhookId", { length: 36 }).notNull(),
  event: varchar("event", { length: 64 }).notNull(),
  payloadId: varchar("payloadId", { length: 36 }),
  success: boolean("success").notNull(),
  statusCode: int("statusCode"),
  responseTimeMs: int("responseTimeMs"),
  error: text("error"),
  retryCount: int("retryCount").default(0).notNull(),
  signature: varchar("signature", { length: 80 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
});

export type WebhookDeliveryLogRow = typeof webhookDeliveryLog.$inferSelect;
export type InsertWebhookDeliveryLog = typeof webhookDeliveryLog.$inferInsert;

/**
 * Webhook Delivery Outbox — persist-before-POST queue for subscriber, ERP,
 * and Teams deliveries. Failed rows back off and eventually enter the DLQ.
 */
export const webhookDeliveryOutbox = mysqlTable(
  "webhook_delivery_outbox",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    targetType: mysqlEnum("targetType", ["webhook", "erp", "teams"]).notNull(),
    webhookId: varchar("webhookId", { length: 36 }),
    event: varchar("event", { length: 64 }).notNull(),
    payloadId: varchar("payloadId", { length: 36 }),
    url: text("url").notNull(),
    secret: varchar("secret", { length: 256 }),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    headers: json("headers").$type<Record<string, string>>(),
    status: mysqlEnum("status", ["pending", "processing", "delivered", "dlq"])
      .default("pending")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(4).notNull(),
    nextAttemptAt: timestamp("nextAttemptAt").notNull(),
    lastError: text("lastError"),
    statusCode: int("statusCode"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    deliveredAt: timestamp("deliveredAt"),
  },
  table => ({
    dueIdx: index("webhook_delivery_outbox_due_idx").on(
      table.status,
      table.nextAttemptAt
    ),
    eventIdx: index("webhook_delivery_outbox_event_idx").on(table.event),
  })
);

export type WebhookDeliveryOutboxRow =
  typeof webhookDeliveryOutbox.$inferSelect;
export type InsertWebhookDeliveryOutbox =
  typeof webhookDeliveryOutbox.$inferInsert;

/**
 * Review Claims — exclusive reviewer lease on a job sheet (Wave-4 D1).
 * Runtime also CREATE IF NOT EXISTS via reviewClaim/store.ts.
 */
export const reviewClaims = mysqlTable(
  "review_claims",
  {
    jobSheetId: int("jobSheetId")
      .primaryKey()
      .references(() => jobSheets.id),
    claimedBy: int("claimedBy")
      .notNull()
      .references(() => users.id),
    claimToken: varchar("claimToken", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
  },
  table => ({
    expiresIdx: index("idx_review_claims_expires").on(table.expiresAt),
    claimedByIdx: index("idx_review_claims_claimed_by").on(table.claimedBy),
  })
);

export type ReviewClaimRow = typeof reviewClaims.$inferSelect;
export type InsertReviewClaim = typeof reviewClaims.$inferInsert;

/**
 * Process Idempotency Outbox — durable Idempotency-Key ledger for jobSheets.process (Wave-4 C2).
 * Runtime also CREATE IF NOT EXISTS via processOutbox.ts (same pattern as job queue).
 */
export const processIdempotencyOutbox = mysqlTable(
  "process_idempotency_outbox",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    scope: varchar("scope", { length: 191 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    requestFingerprint: varchar("requestFingerprint", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "completed"]).notNull(),
    jobSheetId: int("jobSheetId"),
    responseJson: json("responseJson"),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  table => ({
    scopeKey: uniqueIndex("uq_process_idempotency_scope_key").on(
      table.scope,
      table.idempotencyKey
    ),
  })
);

export type ProcessIdempotencyOutboxRow =
  typeof processIdempotencyOutbox.$inferSelect;
export type InsertProcessIdempotencyOutbox =
  typeof processIdempotencyOutbox.$inferInsert;

/**
 * Wave-7: immutable reviewer correction events (TrainLoop source of truth).
 */
export const reviewCorrections = mysqlTable(
  "review_corrections",
  {
    id: int("id").autoincrement().primaryKey(),
    correctionType: mysqlEnum("correctionType", [
      "field_correction",
      "override",
      "waive",
      "flag",
      "approve",
    ]).notNull(),
    trainingReasonCode: mysqlEnum("trainingReasonCode", [
      "ocr_misread",
      "roi_misaligned",
      "rule_wrong",
      "template_mismatch",
      "true_defect",
    ]).notNull(),
    findingId: int("findingId")
      .notNull()
      .references(() => auditFindings.id),
    auditResultId: int("auditResultId")
      .notNull()
      .references(() => auditResults.id),
    jobSheetId: int("jobSheetId")
      .notNull()
      .references(() => jobSheets.id),
    templateId: int("templateId").references(() => templates.id),
    templateVersionId: int("templateVersionId").references(
      () => templateVersions.id
    ),
    fieldKey: varchar("fieldKey", { length: 128 }).notNull(),
    ruleId: varchar("ruleId", { length: 64 }),
    originalValue: text("originalValue"),
    correctedValue: text("correctedValue"),
    reviewerId: int("reviewerId")
      .notNull()
      .references(() => users.id),
    reviewerReason: text("reviewerReason"),
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    supersedesCorrectionId: int("supersedesCorrectionId"),
    undoneAt: timestamp("undoneAt"),
    undoneBy: int("undoneBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    idempotencyUnique: uniqueIndex(
      "review_corrections_idempotencyKey_unique"
    ).on(table.idempotencyKey),
    templateFieldRuleIdx: index(
      "review_corrections_template_field_rule_idx"
    ).on(table.templateId, table.fieldKey, table.ruleId, table.createdAt),
  })
);

export type ReviewCorrection = typeof reviewCorrections.$inferSelect;
export type InsertReviewCorrection = typeof reviewCorrections.$inferInsert;

/**
 * Wave-7: aggregated template memory candidates (promotable).
 */
export const templateMemoryCandidates = mysqlTable(
  "template_memory_candidates",
  {
    id: int("id").autoincrement().primaryKey(),
    templateId: int("templateId")
      .notNull()
      .references(() => templates.id),
    templateVersionId: int("templateVersionId").references(
      () => templateVersions.id
    ),
    memoryKind: mysqlEnum("memoryKind", [
      "suppress_rule",
      "value_alias",
      "ocr_hint",
      "roi_adjust",
      "spec_gap",
    ]).notNull(),
    fieldKey: varchar("fieldKey", { length: 128 }).notNull(),
    ruleId: varchar("ruleId", { length: 64 }),
    payloadJson: json("payloadJson").notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    evidenceCount: int("evidenceCount").notNull().default(0),
    agreeCount: int("agreeCount").notNull().default(0),
    disagreeCount: int("disagreeCount").notNull().default(0),
    promotionStatus: mysqlEnum("promotionStatus", [
      "collecting",
      "candidate",
      "shadow",
      "approved",
      "rejected",
      "retired",
    ])
      .notNull()
      .default("collecting"),
    promotedToVersionId: int("promotedToVersionId"),
    createdFromCorrectionId: int("createdFromCorrectionId"),
    lastEvidenceAt: timestamp("lastEvidenceAt"),
    createdBy: int("createdBy"),
    approvedBy: int("approvedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    uniqueCandidate: uniqueIndex("template_memory_candidates_unique").on(
      table.templateId,
      table.memoryKind,
      table.fieldKey,
      table.ruleId,
      table.payloadHash
    ),
    statusTemplateIdx: index(
      "template_memory_candidates_status_template_idx"
    ).on(table.promotionStatus, table.templateId),
  })
);

export type TemplateMemoryCandidate =
  typeof templateMemoryCandidates.$inferSelect;
export type InsertTemplateMemoryCandidate =
  typeof templateMemoryCandidates.$inferInsert;

export const templateMemoryEvidence = mysqlTable(
  "template_memory_evidence",
  {
    id: int("id").autoincrement().primaryKey(),
    candidateId: int("candidateId")
      .notNull()
      .references(() => templateMemoryCandidates.id),
    correctionId: int("correctionId")
      .notNull()
      .references(() => reviewCorrections.id),
    weight: decimal("weight", { precision: 5, scale: 2 })
      .notNull()
      .default("1.00"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    uniqueEvidence: uniqueIndex("template_memory_evidence_unique").on(
      table.candidateId,
      table.correctionId
    ),
  })
);

export type TemplateMemoryEvidence = typeof templateMemoryEvidence.$inferSelect;
export type InsertTemplateMemoryEvidence =
  typeof templateMemoryEvidence.$inferInsert;

export const templateMemoryPromotions = mysqlTable(
  "template_memory_promotions",
  {
    id: int("id").autoincrement().primaryKey(),
    candidateId: int("candidateId")
      .notNull()
      .references(() => templateMemoryCandidates.id),
    fromStatus: varchar("fromStatus", { length: 32 }).notNull(),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    fromVersionId: int("fromVersionId"),
    toVersionId: int("toVersionId"),
    diffJson: json("diffJson"),
    promotedBy: int("promotedBy"),
    promotedAt: timestamp("promotedAt").defaultNow().notNull(),
  }
);

export type TemplateMemoryPromotion =
  typeof templateMemoryPromotions.$inferSelect;
export type InsertTemplateMemoryPromotion =
  typeof templateMemoryPromotions.$inferInsert;

/**
 * Wave C / PR6: durable signed-ingest receipts (externalJobId + contentHash idempotency).
 */
export const ingestReceipts = mysqlTable(
  "ingest_receipts",
  {
    ingestId: varchar("ingestId", { length: 64 }).primaryKey(),
    externalJobId: varchar("externalJobId", { length: 128 }).notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    deviceId: varchar("deviceId", { length: 128 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileType: varchar("fileType", { length: 64 }).notNull(),
    fileSizeBytes: int("fileSizeBytes").notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileUrl: text("fileUrl").notNull(),
    jobSheetId: int("jobSheetId"),
    createdAt: timestamp("createdAt").notNull(),
  },
  table => ({
    externalHashUnique: uniqueIndex("ingest_receipts_external_hash_unique").on(
      table.externalJobId,
      table.contentHash
    ),
    externalJobIdIdx: index("ingest_receipts_externalJobId_idx").on(
      table.externalJobId
    ),
    contentHashIdx: index("ingest_receipts_contentHash_idx").on(
      table.contentHash
    ),
  })
);

export type IngestReceiptRow = typeof ingestReceipts.$inferSelect;
export type InsertIngestReceipt = typeof ingestReceipts.$inferInsert;
