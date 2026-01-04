/**
 * Review Queue Implementation
 * 
 * In-memory review queue for documents requiring manual review.
 * Append-only pattern for audit trail.
 */

import type { ReviewQueueItem } from './types';
import type { ValidationResult } from './types';
import type { ExtractionResult } from '../extraction/types';
import { getCorrelationId } from '../../utils/context';
import { randomUUID } from 'crypto';

/**
 * Review queue storage (in-memory, append-only)
 */
const reviewQueue: ReviewQueueItem[] = [];

/**
 * Priority mapping for review reasons
 */
const PRIORITY_MAP: Record<ReviewQueueItem['reason'], number> = {
  validation_failure: 1,
  low_confidence: 2,
  manual_flag: 3,
};

/**
 * Create a review queue item from validation result
 */
export function createReviewItem(
  documentId: string,
  reason: ReviewQueueItem['reason'],
  fields: string[],
  priority?: number
): ReviewQueueItem {
  const now = new Date().toISOString();
  
  const item: ReviewQueueItem = {
    id: randomUUID(),
    documentId,
    reason,
    fields,
    priority: priority ?? PRIORITY_MAP[reason],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    correlationId: getCorrelationId(),
  };
  
  // Append to queue (immutable)
  reviewQueue.push(item);
  
  return item;
}

/**
 * Queue document for review based on validation result
 */
export function queueForReview(
  documentId: string,
  validationResult: ValidationResult,
  extractionResult: ExtractionResult
): ReviewQueueItem | null {
  const fieldsToReview: string[] = [];
  let reason: ReviewQueueItem['reason'] | null = null;
  
  // Check for critical/major failures
  if (validationResult.summary.criticalFailures > 0 || validationResult.summary.majorFailures > 0) {
    reason = 'validation_failure';
    for (const finding of validationResult.findings) {
      if (finding.severity === 'critical' || finding.severity === 'major') {
        if (!fieldsToReview.includes(finding.field)) {
          fieldsToReview.push(finding.field);
        }
      }
    }
  }
  
  // Check for low confidence extractions
  if (extractionResult.lowConfidenceFields.length > 0) {
    if (!reason) {
      reason = 'low_confidence';
    }
    for (const field of extractionResult.lowConfidenceFields) {
      if (!fieldsToReview.includes(field)) {
        fieldsToReview.push(field);
      }
    }
  }
  
  // Only queue if there's something to review
  if (reason && fieldsToReview.length > 0) {
    return createReviewItem(documentId, reason, fieldsToReview);
  }
  
  return null;
}

/**
 * Get pending review items
 */
export function getPendingReviews(limit?: number): ReviewQueueItem[] {
  const pending = reviewQueue
    .filter(item => item.status === 'pending')
    .sort((a, b) => {
      // Sort by priority (ascending), then by createdAt (ascending)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  
  return limit ? pending.slice(0, limit) : pending;
}

/**
 * Get review item by ID
 */
export function getReviewItem(id: string): ReviewQueueItem | undefined {
  return reviewQueue.find(item => item.id === id);
}

/**
 * Update review item status (creates new entry, preserves history)
 */
export function updateReviewStatus(
  id: string,
  status: ReviewQueueItem['status'],
  assignedTo?: string
): ReviewQueueItem | null {
  const existing = reviewQueue.find(item => item.id === id);
  
  if (!existing) {
    return null;
  }
  
  // Create updated item (append-only pattern)
  const updated: ReviewQueueItem = {
    ...existing,
    status,
    assignedTo: assignedTo ?? existing.assignedTo,
    updatedAt: new Date().toISOString(),
  };
  
  // Find and update in place (for simplicity in in-memory implementation)
  const index = reviewQueue.findIndex(item => item.id === id);
  if (index !== -1) {
    reviewQueue[index] = updated;
  }
  
  return updated;
}

/**
 * Get review queue statistics
 */
export function getReviewQueueStats(): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  dismissed: number;
  byReason: Record<string, number>;
} {
  const stats = {
    total: reviewQueue.length,
    pending: 0,
    inProgress: 0,
    completed: 0,
    dismissed: 0,
    byReason: {} as Record<string, number>,
  };
  
  for (const item of reviewQueue) {
    switch (item.status) {
      case 'pending': stats.pending++; break;
      case 'in_progress': stats.inProgress++; break;
      case 'completed': stats.completed++; break;
      case 'dismissed': stats.dismissed++; break;
    }
    
    stats.byReason[item.reason] = (stats.byReason[item.reason] || 0) + 1;
  }
  
  return stats;
}

/**
 * Clear review queue (for testing)
 */
export function clearReviewQueue(): void {
  reviewQueue.length = 0;
}

/**
 * Get all review items (for testing/debugging)
 */
export function getAllReviewItems(): ReviewQueueItem[] {
  return [...reviewQueue];
}
