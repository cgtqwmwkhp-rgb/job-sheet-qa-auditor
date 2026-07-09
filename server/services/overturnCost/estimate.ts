/**
 * Pure overturn cost estimation (Phase 3.x)
 */

import type { OverturnCostEstimate, OverturnEvent } from "./types";

const DEFAULT_MINUTES_PER_OVERTURN = 8;
const DEFAULT_USD_PER_MINUTE = 1.5;

export interface EstimateOverturnCostOptions {
  minutesPerOverturn?: number;
  usdPerMinute?: number;
}

/**
 * Estimates review cost from overturn events.
 * Uses minutesPerOverturn (default 8) and usdPerMinute (default 1.5).
 */
export function estimateOverturnCost(
  events: OverturnEvent[],
  opts?: EstimateOverturnCostOptions
): OverturnCostEstimate {
  const minutesPerOverturn =
    opts?.minutesPerOverturn ?? DEFAULT_MINUTES_PER_OVERTURN;
  const usdPerMinute = opts?.usdPerMinute ?? DEFAULT_USD_PER_MINUTE;

  const total = events.length;
  const overturned = events.filter((event) => event.overturned).length;

  const overturnRate = total === 0 ? 0 : overturned / total;
  const estimatedMinutes = overturned * minutesPerOverturn;
  const estimatedCostUsd = estimatedMinutes * usdPerMinute;

  return {
    overturnRate,
    estimatedMinutes,
    estimatedCostUsd,
  };
}
