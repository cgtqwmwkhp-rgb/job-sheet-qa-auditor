/**
 * Pure FinOps stage cost rollup (Phase 3.x)
 *
 * Aggregates per-stage cost and optional latency observations for
 * FinOps dashboards and cost attribution reports.
 */

import type { FinOpsRollup, StageCostSample } from "./types";

/**
 * Roll up stage cost samples into per-stage totals and averages.
 *
 * - Groups by `stage`
 * - `avgCostUsd` = totalCostUsd / count
 * - `avgLatencyMs` included only when at least one sample has latencyMs
 */
export function rollupStageCosts(samples: StageCostSample[]): FinOpsRollup[] {
  if (samples.length === 0) {
    return [];
  }

  const byStage = new Map<
    string,
    {
      count: number;
      totalCostUsd: number;
      totalLatencyMs: number;
      latencyCount: number;
    }
  >();

  for (const sample of samples) {
    const entry = byStage.get(sample.stage) ?? {
      count: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
      latencyCount: 0,
    };

    entry.count++;
    entry.totalCostUsd += sample.costUsd;

    if (sample.latencyMs !== undefined) {
      entry.totalLatencyMs += sample.latencyMs;
      entry.latencyCount++;
    }

    byStage.set(sample.stage, entry);
  }

  return Array.from(byStage.entries())
    .map(([stage, entry]) => {
      const rollup: FinOpsRollup = {
        stage,
        count: entry.count,
        totalCostUsd: entry.totalCostUsd,
        avgCostUsd: entry.totalCostUsd / entry.count,
      };

      if (entry.latencyCount > 0) {
        rollup.avgLatencyMs = entry.totalLatencyMs / entry.latencyCount;
      }

      return rollup;
    })
    .sort((a, b) => a.stage.localeCompare(b.stage));
}
