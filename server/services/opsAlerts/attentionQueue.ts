/**
 * Predictive attention queue ranking (Phase 3.5)
 */

import type { AttentionItem } from "./types";

/**
 * Rank attention items by score descending, returning at most `limit` items.
 * Stable tie-break: lower jobSheetId first when scores match.
 */
export function rankAttention(
  items: AttentionItem[],
  limit = 20
): AttentionItem[] {
  if (items.length === 0) {
    return [];
  }

  const safeLimit = Math.max(0, limit);

  return [...items]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.jobSheetId - b.jobSheetId;
    })
    .slice(0, safeLimit);
}
