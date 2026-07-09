/**
 * Overturn cost estimator types (Phase 3.x)
 */

export interface OverturnEvent {
  overturned: boolean;
  reviewMinutes?: number;
}

export interface OverturnCostEstimate {
  overturnRate: number;
  estimatedMinutes: number;
  estimatedCostUsd: number;
}
