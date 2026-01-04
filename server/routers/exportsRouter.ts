/**
 * Exports Router - Stage 5
 * 
 * Provides API endpoints for generating exports (CSV, bundle).
 * All exports are redacted by default for PII safety.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import type { AuditResultResponse, ValidatedFieldResponse, FindingResponse } from './auditRouter';

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json' | 'bundle';

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
  if (!value) return '';
  
  let redacted = value;
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Redact PII from a validated field
 */
function redactValidatedField(field: ValidatedFieldResponse, redact: boolean): ValidatedFieldResponse {
  if (!redact) return field;
  
  return {
    ...field,
    value: typeof field.value === 'string' ? redactPII(field.value) : field.value,
    message: field.message ? redactPII(field.message) : undefined,
  };
}

/**
 * Redact PII from a finding
 */
function redactFinding(finding: FindingResponse, redact: boolean): FindingResponse {
  if (!redact) return finding;
  
  return {
    ...finding,
    message: redactPII(finding.message),
    extractedValue: finding.extractedValue ? redactPII(finding.extractedValue) : undefined,
  };
}

/**
 * Generate CSV content from validated fields
 */
function generateValidatedFieldsCSV(
  fields: ValidatedFieldResponse[],
  redact: boolean
): string {
  const headers = ['Rule ID', 'Field', 'Status', 'Value', 'Confidence', 'Page', 'Severity', 'Message'];
  const rows = fields.map(f => {
    const redacted = redactValidatedField(f, redact);
    return [
      redacted.ruleId,
      redacted.field,
      redacted.status,
      String(redacted.value ?? ''),
      String(redacted.confidence),
      String(redacted.pageNumber ?? ''),
      redacted.severity,
      redacted.message ?? '',
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate CSV content from findings
 */
function generateFindingsCSV(
  findings: FindingResponse[],
  redact: boolean
): string {
  const headers = ['ID', 'Rule ID', 'Field', 'Severity', 'Message', 'Extracted Value', 'Expected Pattern', 'Page'];
  const rows = findings.map(f => {
    const redacted = redactFinding(f, redact);
    return [
      String(redacted.id),
      redacted.ruleId,
      redacted.field,
      redacted.severity,
      redacted.message,
      redacted.extractedValue ?? '',
      redacted.expectedPattern ?? '',
      String(redacted.pageNumber ?? ''),
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate bundle content (JSON with all audit data)
 */
function generateBundle(
  audit: AuditResultResponse,
  redact: boolean
): object {
  return {
    version: '1.0.0',
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
    validatedFields: audit.validatedFields.map(f => redactValidatedField(f, redact)),
    findings: audit.findings.map(f => redactFinding(f, redact)),
    reviewQueueReasons: audit.reviewQueueReasons,
    isRedacted: redact,
  };
}

/**
 * In-memory audit store reference (shared with auditRouter)
 * In production, this would query the database
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

/**
 * Exports router
 */
export const exportsRouter = router({
  /**
   * Generate CSV export of validated fields
   */
  validatedFieldsCSV: protectedProcedure
    .input(z.object({
      auditId: z.number(),
      redacted: z.boolean().default(true), // Redacted by default
      tab: z.enum(['all', 'passed', 'failed']).default('all'),
    }))
    .query(async ({ input }) => {
      const audit = mockAuditStore.get(input.auditId);
      if (!audit) {
        return { success: false, error: 'Audit not found', content: '' };
      }
      
      let fields = audit.validatedFields;
      
      // Filter by tab
      if (input.tab === 'passed') {
        fields = fields.filter(f => f.status === 'passed');
      } else if (input.tab === 'failed') {
        fields = fields.filter(f => f.status === 'failed' || f.status === 'error');
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
    .input(z.object({
      auditId: z.number(),
      redacted: z.boolean().default(true), // Redacted by default
    }))
    .query(async ({ input }) => {
      const audit = mockAuditStore.get(input.auditId);
      if (!audit) {
        return { success: false, error: 'Audit not found', content: '' };
      }
      
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
    .input(z.object({
      auditId: z.number(),
      redacted: z.boolean().default(true), // Redacted by default
    }))
    .query(async ({ input }) => {
      const audit = mockAuditStore.get(input.auditId);
      if (!audit) {
        return { success: false, error: 'Audit not found', content: null };
      }
      
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
    .query(async ({ input }) => {
      const audit = mockAuditStore.get(input.auditId);
      if (!audit) {
        return null;
      }
      
      return {
        auditId: input.auditId,
        availableFormats: ['csv', 'json', 'bundle'] as ExportFormat[],
        tabs: ['all', 'passed', 'failed'] as const,
        defaultRedacted: true,
        fieldCount: audit.validatedFields.length,
        findingCount: audit.findings.length,
      };
    }),
});

export type ExportsRouter = typeof exportsRouter;
