/**
 * End-to-end latency budget types (Phase 3.x)
 */

export interface StageLatency {
  stage: string;
  latencyMs: number;
}

export interface LatencyBudgetResult {
  totalMs: number;
  budgetMs: number;
  withinBudget: boolean;
  slowestStage?: string;
  breaches: string[];
}
