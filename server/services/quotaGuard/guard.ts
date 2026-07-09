import type { QuotaDecision, QuotaWindow } from "./types";

/**
 * Pure quota check — allowed when used + requestCost <= limit.
 * Remaining capacity is max(0, limit - used) regardless of request outcome.
 */
export function checkQuota(
  window: QuotaWindow,
  requestCost = 1
): QuotaDecision {
  const remaining = Math.max(0, window.limit - window.used);
  const projected = window.used + requestCost;
  const allowed = projected <= window.limit;
  const reason = allowed
    ? `within quota (${projected}/${window.limit} ${window.unit})`
    : `quota exceeded (${projected}/${window.limit} ${window.unit})`;

  return { allowed, remaining, reason };
}
