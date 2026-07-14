/**
 * FinOps stage cost rollup types (Phase 3.x) + admin API cost dimensions.
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

/** Single recorded LLM/API usage observation for admin cost tracking. */
export interface ApiCostEvent {
  id: string;
  recordedAt: string;
  provider: string;
  model: string;
  /**
   * Stable AI tool id for FinOps (e.g. gemini_judgment, anthropic_coaching).
   * Prefer explicit tool; otherwise derived from stage + provider.
   */
  tool: string;
  /** Pipeline stage / feature attribution (judgment, coaching, vlm, …). */
  stage: string;
  /** Job sheet under review when the call was made (if known). */
  jobSheetId?: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs?: number;
}

export interface ApiCostBucket {
  key: string;
  /** Optional display label (AI tool human name). */
  label?: string;
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  /** Share of parent total (0–1) when computed. */
  share?: number;
}

/** Per–job-sheet (review) cost rollup, including AI tools used. */
export interface JobSheetCostBucket {
  jobSheetId: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  /** Tools used while reviewing this job sheet. */
  byTool: ApiCostBucket[];
}

/** Calendar day (YYYY-MM-DD) or month (YYYY-MM) cost rollup. */
export interface PeriodCostBucket {
  period: string;
  callCount: number;
  jobSheetsReviewed: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  avgCostPerJobSheetUsd: number;
  byTool: ApiCostBucket[];
}

export interface ApiCostSummary {
  /** Lookback window in hours; null means all retained events. */
  windowHours: number | null;
  since: string | null;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** Mean estimated cost across all recorded API calls in the window. */
  avgCostPerCallUsd: number;
  /** Unique job sheets with at least one attributed cost event. */
  jobSheetsReviewed: number;
  /** Mean estimated cost per attributed job sheet (0 when none). */
  avgCostPerJobSheetUsd: number;
  /** Cost by AI tool (primary FinOps dimension). */
  byTool: ApiCostBucket[];
  byProvider: ApiCostBucket[];
  byModel: ApiCostBucket[];
  byStage: ApiCostBucket[];
  /** Cost by job sheet review. */
  byJobSheet: JobSheetCostBucket[];
  /** Calendar-day spend (UTC). */
  byDay: PeriodCostBucket[];
  /** Calendar-month spend (UTC). */
  byMonth: PeriodCostBucket[];
  recentEvents: ApiCostEvent[];
  /** Retention / durability note for operators. */
  retentionNote: string;
}
