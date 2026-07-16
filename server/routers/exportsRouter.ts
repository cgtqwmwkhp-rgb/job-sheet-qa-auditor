/**
 * Exports Router - Stage 5 / PR-IO-EXPORTS
 *
 * Provides API endpoints for generating exports (CSV, bundle).
 * All exports are redacted by default for PII safety.
 * Resolves real audits from DB (mock store kept for unit tests).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import type { DbUserRole } from "../_core/azureRoles";
import * as db from "../db";
import { enforceAuditAccess } from "../utils/authorization";
import type {
  AuditResultResponse,
  ValidatedFieldResponse,
  FindingResponse,
  ReviewQueueReasonCode,
} from "./auditRouter";
import { REVIEW_QUEUE_REASON_CODES } from "./auditRouter";
import type { RuleSeverity, RuleStatus } from "../services/specResolver/types";

/**
 * Export format options
 */
export type ExportFormat = "csv" | "json" | "bundle";

type ExportUser = { id: number; role: DbUserRole };

/**
 * Redaction patterns for PII
 */
const PII_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Phone numbers (various formats)
  /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // Social Security Numbers
  /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g,
  // Credit card numbers
  /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
  // IP addresses
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
];

/**
 * Redact PII from a string value
 */
function redactPII(value: string | null | undefined): string {
  if (!value) return "";

  let redacted = value;
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

/**
 * Redact PII from a validated field
 */
function redactValidatedField(
  field: ValidatedFieldResponse,
  redact: boolean
): ValidatedFieldResponse {
  if (!redact) return field;

  return {
    ...field,
    value:
      typeof field.value === "string" ? redactPII(field.value) : field.value,
    message: field.message ? redactPII(field.message) : undefined,
  };
}

/**
 * Redact PII from a finding
 */
function redactFinding(
  finding: FindingResponse,
  redact: boolean
): FindingResponse {
  if (!redact) return finding;

  return {
    ...finding,
    message: redactPII(finding.message),
    extractedValue: finding.extractedValue
      ? redactPII(finding.extractedValue)
      : undefined,
  };
}

/**
 * Generate CSV content from validated fields
 */
function generateValidatedFieldsCSV(
  fields: ValidatedFieldResponse[],
  redact: boolean
): string {
  const headers = [
    "Rule ID",
    "Field",
    "Status",
    "Value",
    "Confidence",
    "Page",
    "Severity",
    "Message",
  ];
  const rows = fields.map(f => {
    const redacted = redactValidatedField(f, redact);
    return [
      redacted.ruleId,
      redacted.field,
      redacted.status,
      String(redacted.value ?? ""),
      String(redacted.confidence),
      String(redacted.pageNumber ?? ""),
      redacted.severity,
      redacted.message ?? "",
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate CSV content from findings
 */
function generateFindingsCSV(
  findings: FindingResponse[],
  redact: boolean
): string {
  const headers = [
    "ID",
    "Rule ID",
    "Field",
    "Severity",
    "Message",
    "Extracted Value",
    "Expected Pattern",
    "Page",
  ];
  const rows = findings.map(f => {
    const redacted = redactFinding(f, redact);
    return [
      String(redacted.id),
      redacted.ruleId,
      redacted.field,
      redacted.severity,
      redacted.message,
      redacted.extractedValue ?? "",
      redacted.expectedPattern ?? "",
      String(redacted.pageNumber ?? ""),
    ]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate bundle content (JSON with all audit data)
 */
function generateBundle(audit: AuditResultResponse, redact: boolean): object {
  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    redacted: redact,
    audit: {
      id: audit.id,
      jobSheetId: audit.jobSheetId,
      goldSpecId: audit.goldSpecId,
      overallResult: audit.overallResult,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      skippedCount: audit.skippedCount,
      createdAt: audit.createdAt,
      metadata: audit.metadata,
    },
    validatedFields: audit.validatedFields.map(f =>
      redactValidatedField(f, redact)
    ),
    findings: audit.findings.map(f => redactFinding(f, redact)),
    reviewQueueReasons: audit.reviewQueueReasons,
    isRedacted: redact,
  };
}

/**
 * In-memory audit store for unit tests (setMockAuditForExport).
 * Live requests fall through to the database.
 */
const mockAuditStore = new Map<number, AuditResultResponse>();

/**
 * Set mock audit data (for testing)
 */
export function setMockAuditForExport(audit: AuditResultResponse): void {
  mockAuditStore.set(audit.id, audit);
}

/**
 * Reset mock audit store (for testing)
 */
export function resetExportStore(): void {
  mockAuditStore.clear();
}

function mapDbSeverity(severity: string | null | undefined): RuleSeverity {
  switch (severity) {
    case "S0":
    case "S1":
    case "critical":
      return "critical";
    case "S2":
    case "major":
      return "major";
    case "S3":
    case "minor":
      return "minor";
    default:
      return "info";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractFieldValue(entry: unknown): string | number | boolean | null {
  if (entry == null) return null;
  if (
    typeof entry === "string" ||
    typeof entry === "number" ||
    typeof entry === "boolean"
  ) {
    return entry;
  }
  const rec = asRecord(entry);
  if (!rec) return null;
  const raw = rec.value ?? rec.text ?? rec.normalised ?? rec.normalized;
  if (
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean"
  ) {
    return raw;
  }
  if (raw == null) return null;
  return String(raw);
}

function extractFieldConfidence(entry: unknown): number {
  const rec = asRecord(entry);
  const raw = rec?.confidence ?? rec?.score;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function extractPageNumber(entry: unknown): number | undefined {
  const rec = asRecord(entry);
  const raw = rec?.pageNumber ?? rec?.page;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function mapDbFindingsToExport(
  findings: Awaited<ReturnType<typeof db.getAuditFindingsByResultId>>
): FindingResponse[] {
  return findings.map(f => ({
    id: f.id,
    ruleId: f.ruleId || f.reasonCode || `finding-${f.id}`,
    field: f.fieldName,
    severity: mapDbSeverity(f.severity),
    message: f.whyItMatters || f.suggestedFix || f.reasonCode,
    extractedValue: f.normalisedSnippet || f.rawSnippet || undefined,
    expectedPattern: undefined,
    pageNumber: f.pageNumber ?? undefined,
  }));
}

function mapExtractedFieldsToValidated(
  reportJson: unknown,
  findings: FindingResponse[]
): ValidatedFieldResponse[] {
  const report = asRecord(reportJson);
  const extracted = asRecord(report?.extractedFields) ?? {};
  const failedFields = new Set(findings.map(f => f.field));

  const fromExtracted: ValidatedFieldResponse[] = Object.entries(extracted).map(
    ([field, entry]) => {
      const rec = asRecord(entry);
      const status: RuleStatus = failedFields.has(field) ? "failed" : "passed";
      const ruleId =
        (typeof rec?.ruleId === "string" && rec.ruleId) || `field:${field}`;
      return {
        ruleId,
        field,
        status,
        value: extractFieldValue(entry),
        confidence: extractFieldConfidence(entry),
        pageNumber: extractPageNumber(entry),
        severity: failedFields.has(field)
          ? findings.find(f => f.field === field)?.severity || "major"
          : "info",
        message: failedFields.has(field)
          ? findings.find(f => f.field === field)?.message
          : undefined,
      };
    }
  );

  // Include finding-only fields that were not present in extractedFields
  const known = new Set(fromExtracted.map(f => f.field));
  const fromFindingsOnly: ValidatedFieldResponse[] = findings
    .filter(f => !known.has(f.field))
    .map(f => ({
      ruleId: f.ruleId,
      field: f.field,
      status: "failed" as const,
      value: f.extractedValue ?? null,
      confidence: 0,
      pageNumber: f.pageNumber,
      severity: f.severity,
      message: f.message,
    }));

  return [...fromExtracted, ...fromFindingsOnly].sort((a, b) =>
    a.ruleId.localeCompare(b.ruleId)
  );
}

function mapReviewQueueReasons(
  findings: FindingResponse[]
): ReviewQueueReasonCode[] {
  const codes = new Set<ReviewQueueReasonCode>();
  for (const f of findings) {
    if (REVIEW_QUEUE_REASON_CODES.includes(f.ruleId as ReviewQueueReasonCode)) {
      codes.add(f.ruleId as ReviewQueueReasonCode);
    }
  }
  return Array.from(codes);
}

function mapDbAuditToExportShape(
  audit: NonNullable<Awaited<ReturnType<typeof db.getAuditResultById>>>,
  dbFindings: Awaited<ReturnType<typeof db.getAuditFindingsByResultId>>,
  upstreamIdentity?: {
    externalJobId?: string | null;
    sourceSystem?: string | null;
    deviceId?: string | null;
  }
): AuditResultResponse {
  const findings = mapDbFindingsToExport(dbFindings);
  const validatedFields = mapExtractedFieldsToValidated(
    audit.reportJson,
    findings
  );
  const passedCount = validatedFields.filter(f => f.status === "passed").length;
  const failedCount = validatedFields.filter(
    f => f.status === "failed" || f.status === "error"
  ).length;
  const skippedCount = validatedFields.filter(
    f => f.status === "skipped"
  ).length;

  return {
    id: audit.id,
    jobSheetId: audit.jobSheetId,
    goldSpecId: audit.goldSpecId,
    overallResult: audit.result === "pass" ? "pass" : "fail",
    passedCount,
    failedCount,
    skippedCount,
    validatedFields,
    findings,
    reviewQueueReasons: mapReviewQueueReasons(findings),
    metadata: {
      processingTimeMs: audit.processingTimeMs ?? 0,
      specVersion: audit.pipelineVersion || "unknown",
      extractionVersion: audit.ocrEngineVersion || "unknown",
      ...(upstreamIdentity?.externalJobId
        ? { externalJobId: upstreamIdentity.externalJobId }
        : {}),
      ...(upstreamIdentity?.sourceSystem
        ? { sourceSystem: upstreamIdentity.sourceSystem }
        : {}),
      ...(upstreamIdentity?.deviceId
        ? { deviceId: upstreamIdentity.deviceId }
        : {}),
      ...(() => {
        const report =
          audit.reportJson && typeof audit.reportJson === "object"
            ? (audit.reportJson as Record<string, unknown>)
            : {};
        const policy = report.auditPolicyDecision as
          | { policyVersion?: string }
          | undefined;
        const persona = report.personaDecision as
          | {
              version?: string;
              snapshotHash?: string;
            }
          | undefined;
        return {
          ...(policy?.policyVersion
            ? { policyVersion: policy.policyVersion }
            : {}),
          ...(persona?.version ? { personaVersion: persona.version } : {}),
          ...(persona?.snapshotHash
            ? { personaSnapshotHash: persona.snapshotHash }
            : {}),
        };
      })(),
    },
    createdAt:
      audit.createdAt instanceof Date
        ? audit.createdAt.toISOString()
        : String(audit.createdAt),
  };
}

/**
 * Resolve audit for export: mock store (tests) → DB (live).
 */
async function resolveAuditForExport(
  auditId: number,
  user: ExportUser
): Promise<AuditResultResponse> {
  const mock = mockAuditStore.get(auditId);
  if (mock) return mock;

  const audit = await db.getAuditResultById(auditId);
  if (!audit) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Audit result not found",
    });
  }

  const jobSheet = await db.getJobSheetById(audit.jobSheetId);
  enforceAuditAccess(audit, jobSheet, user);

  const findings = await db.getAuditFindingsByResultId(auditId);
  return mapDbAuditToExportShape(audit, findings, jobSheet);
}

/**
 * Exports router
 */
export const exportsRouter = router({
  /**
   * Generate CSV export of validated fields
   */
  validatedFieldsCSV: protectedProcedure
    .input(
      z.object({
        auditId: z.number(),
        redacted: z.boolean().default(true), // Redacted by default
        tab: z.enum(["all", "passed", "failed"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const audit = await resolveAuditForExport(input.auditId, ctx.user);

      let fields = audit.validatedFields;

      // Filter by tab
      if (input.tab === "passed") {
        fields = fields.filter(f => f.status === "passed");
      } else if (input.tab === "failed") {
        fields = fields.filter(
          f => f.status === "failed" || f.status === "error"
        );
      }

      const csv = generateValidatedFieldsCSV(fields, input.redacted);

      return {
        success: true,
        content: csv,
        filename: `audit-${input.auditId}-validated-fields-${input.tab}.csv`,
        redacted: input.redacted,
      };
    }),

  /**
   * Generate CSV export of findings
   */
  findingsCSV: protectedProcedure
    .input(
      z.object({
        auditId: z.number(),
        redacted: z.boolean().default(true), // Redacted by default
      })
    )
    .query(async ({ ctx, input }) => {
      const audit = await resolveAuditForExport(input.auditId, ctx.user);

      const csv = generateFindingsCSV(audit.findings, input.redacted);

      return {
        success: true,
        content: csv,
        filename: `audit-${input.auditId}-findings.csv`,
        redacted: input.redacted,
      };
    }),

  /**
   * Generate full audit bundle (JSON)
   */
  bundle: protectedProcedure
    .input(
      z.object({
        auditId: z.number(),
        redacted: z.boolean().default(true), // Redacted by default
      })
    )
    .query(async ({ ctx, input }) => {
      const audit = await resolveAuditForExport(input.auditId, ctx.user);

      const bundle = generateBundle(audit, input.redacted);

      return {
        success: true,
        content: bundle,
        filename: `audit-${input.auditId}-bundle.json`,
        redacted: input.redacted,
      };
    }),

  /**
   * Get export options for an audit
   */
  getOptions: protectedProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const audit = await resolveAuditForExport(input.auditId, ctx.user);
        return {
          auditId: input.auditId,
          availableFormats: ["csv", "json", "bundle"] as ExportFormat[],
          tabs: ["all", "passed", "failed"] as const,
          defaultRedacted: true,
          fieldCount: audit.validatedFields.length,
          findingCount: audit.findings.length,
        };
      } catch (error) {
        if (error instanceof TRPCError && error.code === "NOT_FOUND") {
          return null;
        }
        throw error;
      }
    }),
});

export type ExportsRouter = typeof exportsRouter;
