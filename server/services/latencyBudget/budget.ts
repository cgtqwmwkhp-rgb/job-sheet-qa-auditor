/**
 * Pure end-to-end latency budget evaluation (Phase 3.x)
 */

import type { LatencyBudgetResult, StageLatency } from "./types";

export function evaluateLatencyBudget(
  stages: StageLatency[],
  budgetMs: number
): LatencyBudgetResult {
  const totalMs = stages.reduce((sum, stage) => sum + stage.latencyMs, 0);
  const withinBudget = totalMs <= budgetMs;
  const breaches: string[] = [];

  if (!withinBudget) {
    breaches.push(`total: ${totalMs}ms exceeds ${budgetMs}ms budget`);
  }

  let slowestStage: string | undefined;
  if (stages.length > 0) {
    let maxLatency = -1;
    for (const stage of stages) {
      if (stage.latencyMs > maxLatency) {
        maxLatency = stage.latencyMs;
        slowestStage = stage.stage;
      }
    }
  }

  return {
    totalMs,
    budgetMs,
    withinBudget,
    slowestStage,
    breaches,
  };
}
