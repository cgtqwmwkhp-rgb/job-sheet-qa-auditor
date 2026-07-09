/**
 * Pure reviewer load assignment (Phase 3.x)
 *
 * No DB or router wiring — safe to contract test in isolation.
 */

import type { Assignment, ReviewerLoad } from "./types";

function loadRatio(reviewer: ReviewerLoad): number {
  if (reviewer.capacity <= 0) return Number.POSITIVE_INFINITY;
  return reviewer.openItems / reviewer.capacity;
}

/**
 * Assign a job sheet to the least-loaded eligible reviewer.
 *
 * Eligible reviewers have openItems < capacity. Among them, picks the
 * lowest openItems/capacity ratio. Returns null when none are available.
 */
export function assignToLeastLoaded(
  jobSheetId: string,
  reviewers: ReviewerLoad[]
): Assignment | null {
  const eligible = reviewers.filter(r => r.openItems < r.capacity);
  if (eligible.length === 0) return null;

  const chosen = eligible.reduce((best, current) => {
    const bestRatio = loadRatio(best);
    const currentRatio = loadRatio(current);

    if (currentRatio < bestRatio) return current;
    if (currentRatio > bestRatio) return best;

    if (current.openItems < best.openItems) return current;
    if (current.openItems > best.openItems) return best;

    return current.reviewerId.localeCompare(best.reviewerId) < 0
      ? current
      : best;
  });

  return { jobSheetId, reviewerId: chosen.reviewerId };
}
