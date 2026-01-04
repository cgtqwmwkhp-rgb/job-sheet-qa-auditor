/**
 * Review Queue Router - Stage 5
 * 
 * Provides API endpoints for review queue management.
 * Only canonical reason codes: LOW_CONFIDENCE, UNREADABLE_FIELD, CONFLICT
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { REVIEW_QUEUE_REASON_CODES, type ReviewQueueReasonCode } from './auditRouter';

/**
 * Review queue item status
 */
export type ReviewQueueStatus = 'open' | 'in_review' | 'resolved' | 'escalated';

/**
 * Review queue item response
 */
export interface ReviewQueueItemResponse {
  id: number;
  auditId: number;
  jobSheetId: number;
  field: string;
  reasonCode: ReviewQueueReasonCode;
  status: ReviewQueueStatus;
  extractedValue?: string;
  confidence: number;
  pageNumber?: number;
  assignedTo?: number;
  resolvedBy?: number;
  resolvedAt?: string;
  resolution?: string;
  createdAt: string;
}

/**
 * In-memory review queue store for testing
 */
const reviewQueueStore = {
  items: new Map<number, ReviewQueueItemResponse>(),
  nextId: 1,
};

/**
 * Reset review queue store (for testing)
 */
export function resetReviewQueueStore(): void {
  reviewQueueStore.items.clear();
  reviewQueueStore.nextId = 1;
}

/**
 * Create a mock review queue item (for testing)
 */
export function createMockReviewQueueItem(
  auditId: number,
  jobSheetId: number,
  field: string,
  reasonCode: ReviewQueueReasonCode,
  confidence: number = 0.5
): ReviewQueueItemResponse {
  const id = reviewQueueStore.nextId++;
  const item: ReviewQueueItemResponse = {
    id,
    auditId,
    jobSheetId,
    field,
    reasonCode,
    status: 'open',
    confidence,
    createdAt: new Date().toISOString(),
  };
  
  reviewQueueStore.items.set(id, item);
  return item;
}

/**
 * Sort review queue items deterministically
 * Order: by reasonCode priority, then by field name
 */
function sortReviewQueueItems(items: ReviewQueueItemResponse[]): ReviewQueueItemResponse[] {
  const reasonPriority: Record<ReviewQueueReasonCode, number> = {
    'UNREADABLE_FIELD': 0,
    'LOW_CONFIDENCE': 1,
    'CONFLICT': 2,
  };
  
  return [...items].sort((a, b) => {
    const priorityDiff = reasonPriority[a.reasonCode] - reasonPriority[b.reasonCode];
    if (priorityDiff !== 0) return priorityDiff;
    return a.field.localeCompare(b.field);
  });
}

/**
 * Review queue router
 */
export const reviewQueueRouter = router({
  /**
   * List open review queue items
   */
  listOpen: protectedProcedure
    .input(z.object({
      auditId: z.number().optional(),
      jobSheetId: z.number().optional(),
      reasonCode: z.enum(REVIEW_QUEUE_REASON_CODES).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const opts = input ?? { limit: 50, offset: 0 };
      
      // Get all open items
      let items = Array.from(reviewQueueStore.items.values())
        .filter(item => item.status === 'open' || item.status === 'in_review');
      
      // Filter by audit if specified
      if (opts.auditId !== undefined) {
        items = items.filter(item => item.auditId === opts.auditId);
      }
      
      // Filter by job sheet if specified
      if (opts.jobSheetId !== undefined) {
        items = items.filter(item => item.jobSheetId === opts.jobSheetId);
      }
      
      // Filter by reason code if specified
      if (opts.reasonCode) {
        items = items.filter(item => item.reasonCode === opts.reasonCode);
      }
      
      // Sort deterministically
      items = sortReviewQueueItems(items);
      
      // Apply pagination
      const paginated = items.slice(opts.offset, opts.offset + opts.limit);
      
      return {
        items: paginated,
        total: items.length,
        limit: opts.limit,
        offset: opts.offset,
      };
    }),

  /**
   * Get review queue reasons for an audit
   */
  getReasonsForAudit: protectedProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ input }) => {
      const items = Array.from(reviewQueueStore.items.values())
        .filter(item => item.auditId === input.auditId);
      
      // Get unique reason codes (deterministic order)
      const uniqueReasons = new Set(items.map(item => item.reasonCode));
      const reasons = Array.from(uniqueReasons).sort((a, b) => {
        const order: Record<ReviewQueueReasonCode, number> = {
          'UNREADABLE_FIELD': 0,
          'LOW_CONFIDENCE': 1,
          'CONFLICT': 2,
        };
        return order[a] - order[b];
      });
      
      return {
        auditId: input.auditId,
        reasons,
        itemCount: items.length,
      };
    }),

  /**
   * Get review queue item by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return reviewQueueStore.items.get(input.id) ?? null;
    }),

  /**
   * Assign review queue item to user
   */
  assign: protectedProcedure
    .input(z.object({
      id: z.number(),
      assignedTo: z.number(),
    }))
    .mutation(async ({ input }) => {
      const item = reviewQueueStore.items.get(input.id);
      if (!item) {
        return { success: false, error: 'Item not found' };
      }
      
      item.assignedTo = input.assignedTo;
      item.status = 'in_review';
      
      return { success: true, item };
    }),

  /**
   * Resolve review queue item
   */
  resolve: protectedProcedure
    .input(z.object({
      id: z.number(),
      resolution: z.string(),
      correctedValue: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = reviewQueueStore.items.get(input.id);
      if (!item) {
        return { success: false, error: 'Item not found' };
      }
      
      item.status = 'resolved';
      item.resolution = input.resolution;
      item.resolvedBy = ctx.user.id;
      item.resolvedAt = new Date().toISOString();
      
      if (input.correctedValue) {
        item.extractedValue = input.correctedValue;
      }
      
      return { success: true, item };
    }),

  /**
   * Escalate review queue item
   */
  escalate: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const item = reviewQueueStore.items.get(input.id);
      if (!item) {
        return { success: false, error: 'Item not found' };
      }
      
      item.status = 'escalated';
      item.resolution = `Escalated: ${input.reason}`;
      
      return { success: true, item };
    }),

  /**
   * Get review queue statistics
   */
  getStats: protectedProcedure.query(async () => {
    const items = Array.from(reviewQueueStore.items.values());
    
    const stats = {
      total: items.length,
      open: items.filter(i => i.status === 'open').length,
      inReview: items.filter(i => i.status === 'in_review').length,
      resolved: items.filter(i => i.status === 'resolved').length,
      escalated: items.filter(i => i.status === 'escalated').length,
      byReasonCode: {
        LOW_CONFIDENCE: items.filter(i => i.reasonCode === 'LOW_CONFIDENCE').length,
        UNREADABLE_FIELD: items.filter(i => i.reasonCode === 'UNREADABLE_FIELD').length,
        CONFLICT: items.filter(i => i.reasonCode === 'CONFLICT').length,
      },
    };
    
    return stats;
  }),
});

export type ReviewQueueRouter = typeof reviewQueueRouter;
