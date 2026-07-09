/**
 * Default per-stage cost/latency budgets (Phase 3.7)
 */

import type { StageBudgetMap } from "./types";

export const DEFAULT_STAGE_BUDGETS: StageBudgetMap = {
  ocr: { maxLatencyMs: 30_000, maxCostUsd: 0.05 },
  ensemble: { maxLatencyMs: 45_000, maxCostUsd: 0.1 },
  judgment: { maxLatencyMs: 60_000, maxCostUsd: 0.15 },
  vlm: { maxLatencyMs: 45_000, maxCostUsd: 0.2 },
};
