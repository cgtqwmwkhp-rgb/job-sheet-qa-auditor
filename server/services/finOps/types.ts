/**
 * FinOps stage cost rollup types (Phase 3.x)
 */

export interface StageCostSample {
  stage: string;
  costUsd: number;
  latencyMs?: number;
}

export interface FinOpsRollup {
  stage: string;
  count: number;
  totalCostUsd: number;
  avgCostUsd: number;
  avgLatencyMs?: number;
}
