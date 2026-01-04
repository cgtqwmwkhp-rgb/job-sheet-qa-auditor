/**
 * Audit Router - Stage 5
 * 
 * Provides API endpoints for audit results with deterministic ordering.
 * All responses maintain stable ordering for validatedFields and findings.
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import type { ValidatedField } from '../services/validation/types';
import type { RuleStatus, RuleSeverity } from '../services/specResolver/types';

/**
 * Canonical reason codes for review queue
 * Per requirements: LOW_CONFIDENCE, UNREADABLE_FIELD, CONFLICT only
 */
export const REVIEW_QUEUE_REASON_CODES = [
  'LOW_CONFIDENCE',
  'UNREADABLE_FIELD', 
  'CONFLICT',
] as const;

export type ReviewQueueReasonCode = typeof REVIEW_QUEUE_REASON_CODES[number];

/**
 * Audit result with deterministic ordering
 */
export interface AuditResultResponse {
  id: number;
  jobSheetId: number;
  goldSpecId: number;
  overallResult: 'pass' | 'fail';
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  validatedFields: ValidatedFieldResponse[];
  findings: FindingResponse[];
  reviewQueueReasons: ReviewQueueReasonCode[];
  metadata: {
    processingTimeMs: number;
    specVersion: string;
    extractionVersion: string;
  };
  createdAt: string;
}

/**
 * Validated field response (deterministic order by ruleId)
 */
export interface ValidatedFieldResponse {
  ruleId: string;
  field: string;
  status: RuleStatus;
  value: string | number | boolean | null;
  confidence: number;
  pageNumber?: number;
  severity: RuleSeverity;
  message?: string;
}

/**
 * Finding response (deterministic order by severity then field)
 */
export interface FindingResponse {
  id: number;
  ruleId: string;
  field: string;
  severity: RuleSeverity;
  message: string;
  extractedValue?: string;
  expectedPattern?: string;
  pageNumber?: number;
}

/**
 * In-memory audit store for testing (production uses DB)
 */
const auditStore = {
  results: new Map<number, AuditResultResponse>(),
  nextId: 1,
};

/**
 * Sort validated fields deterministically by ruleId
 */
function sortValidatedFields(fields: ValidatedFieldResponse[]): ValidatedFieldResponse[] {
  return [...fields].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

/**
 * Sort findings deterministically by severity (critical first) then field
 */
function sortFindings(findings: FindingResponse[]): FindingResponse[] {
  const severityOrder: Record<RuleSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  
  return [...findings].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.field.localeCompare(b.field);
  });
}

/**
 * Filter review queue reasons to canonical codes only
 */
function filterReviewQueueReasons(reasons: string[]): ReviewQueueReasonCode[] {
  return reasons.filter(
    (r): r is ReviewQueueReasonCode => 
      REVIEW_QUEUE_REASON_CODES.includes(r as ReviewQueueReasonCode)
  );
}

/**
 * Create a mock audit result for testing
 */
export function createMockAuditResult(
  jobSheetId: number,
  goldSpecId: number,
  validatedFields: ValidatedFieldResponse[],
  findings: FindingResponse[],
  reviewQueueReasons: string[] = []
): AuditResultResponse {
  const id = auditStore.nextId++;
  const passedCount = validatedFields.filter(f => f.status === 'passed').length;
  const failedCount = validatedFields.filter(f => f.status === 'failed' || f.status === 'error').length;
  const skippedCount = validatedFields.filter(f => f.status === 'skipped').length;
  
  const result: AuditResultResponse = {
    id,
    jobSheetId,
    goldSpecId,
    overallResult: failedCount === 0 ? 'pass' : 'fail',
    passedCount,
    failedCount,
    skippedCount,
    validatedFields: sortValidatedFields(validatedFields),
    findings: sortFindings(findings),
    reviewQueueReasons: filterReviewQueueReasons(reviewQueueReasons),
    metadata: {
      processingTimeMs: 100,
      specVersion: '1.0.0',
      extractionVersion: '1.0.0',
    },
    createdAt: new Date().toISOString(),
  };
  
  auditStore.results.set(id, result);
  return result;
}

/**
 * Reset audit store (for testing)
 */
export function resetAuditStore(): void {
  auditStore.results.clear();
  auditStore.nextId = 1;
}

/**
 * Audit router with deterministic responses
 */
export const auditRouter = router({
  /**
   * List all audit results with deterministic ordering
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      result: z.enum(['pass', 'fail']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? { limit: 50, offset: 0 };
      
      // Get all results and sort by ID (deterministic)
      let results = Array.from(auditStore.results.values())
        .sort((a, b) => a.id - b.id);
      
      // Filter by result if specified
      if (opts.result) {
        results = results.filter(r => r.overallResult === opts.result);
      }
      
      // Apply pagination
      const paginated = results.slice(opts.offset, opts.offset + opts.limit);
      
      return {
        items: paginated,
        total: results.length,
        limit: opts.limit,
        offset: opts.offset,
      };
    }),

  /**
   * Get audit result by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const result = auditStore.results.get(input.id);
      if (!result) {
        return null;
      }
      
      // Ensure deterministic ordering on retrieval
      return {
        ...result,
        validatedFields: sortValidatedFields(result.validatedFields),
        findings: sortFindings(result.findings),
      };
    }),

  /**
   * Get audit result by job sheet ID
   */
  getByJobSheet: protectedProcedure
    .input(z.object({ jobSheetId: z.number() }))
    .query(async ({ input }) => {
      const results = Array.from(auditStore.results.values())
        .filter(r => r.jobSheetId === input.jobSheetId)
        .sort((a, b) => a.id - b.id);
      
      if (results.length === 0) {
        return null;
      }
      
      // Return most recent result
      const result = results[results.length - 1];
      return {
        ...result,
        validatedFields: sortValidatedFields(result.validatedFields),
        findings: sortFindings(result.findings),
      };
    }),

  /**
   * Get validated fields for an audit (with tab filtering)
   */
  getValidatedFields: protectedProcedure
    .input(z.object({
      auditId: z.number(),
      tab: z.enum(['all', 'passed', 'failed']).default('all'),
    }))
    .query(async ({ input }) => {
      const result = auditStore.results.get(input.auditId);
      if (!result) {
        return { items: [], total: 0 };
      }
      
      let fields = sortValidatedFields(result.validatedFields);
      
      // Filter by tab
      if (input.tab === 'passed') {
        fields = fields.filter(f => f.status === 'passed');
      } else if (input.tab === 'failed') {
        fields = fields.filter(f => f.status === 'failed' || f.status === 'error');
      }
      
      return {
        items: fields,
        total: fields.length,
      };
    }),

  /**
   * Get findings for an audit
   */
  getFindings: protectedProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ input }) => {
      const result = auditStore.results.get(input.auditId);
      if (!result) {
        return { items: [], total: 0 };
      }
      
      return {
        items: sortFindings(result.findings),
        total: result.findings.length,
      };
    }),
});

export type AuditRouter = typeof auditRouter;
