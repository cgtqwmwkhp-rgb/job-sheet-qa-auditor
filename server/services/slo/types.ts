/**
 * Stage cost/latency SLO types (Phase 3.7)
 */

export type StageName = "ocr" | "ensemble" | "judgment" | "vlm";

export interface StageBudget {
  maxLatencyMs: number;
  maxCostUsd: number;
}

export interface StageObservation {
  stage: StageName;
  latencyMs: number;
  costUsd?: number;
  ok: boolean;
}

export interface StageSloResult {
  stage: StageName;
  withinLatency: boolean;
  withinCost: boolean;
  withinBudget: boolean;
  breaches: string[];
}

export type StageBudgetMap = Record<StageName, StageBudget>;
