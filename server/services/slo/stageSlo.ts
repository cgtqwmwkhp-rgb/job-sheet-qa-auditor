/**
 * Stage cost/latency SLO evaluation (Phase 3.7)
 */

import { DEFAULT_STAGE_BUDGETS } from "./budgets";
import type { StageBudgetMap, StageObservation, StageSloResult } from "./types";

export function evaluateStageSlo(
  obs: StageObservation,
  budgets: StageBudgetMap = DEFAULT_STAGE_BUDGETS
): StageSloResult {
  const budget = budgets[obs.stage];
  const withinLatency = obs.latencyMs <= budget.maxLatencyMs;
  const withinCost =
    obs.costUsd === undefined || obs.costUsd <= budget.maxCostUsd;
  const breaches: string[] = [];

  if (!withinLatency) {
    breaches.push(
      `latency: ${obs.latencyMs}ms exceeds ${budget.maxLatencyMs}ms budget`
    );
  }

  if (obs.costUsd !== undefined && obs.costUsd > budget.maxCostUsd) {
    breaches.push(
      `cost: $${obs.costUsd.toFixed(4)} exceeds $${budget.maxCostUsd.toFixed(4)} budget`
    );
  }

  return {
    stage: obs.stage,
    withinLatency,
    withinCost,
    withinBudget: withinLatency && withinCost,
    breaches,
  };
}
