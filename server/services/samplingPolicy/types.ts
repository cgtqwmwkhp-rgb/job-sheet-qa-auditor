/**
 * Human sampling policy types (Phase 3.x / Wave-4 A3)
 */

export type AuditOutcomeForSampling = "PASS" | "FAIL" | "REVIEW_QUEUE";

export interface SamplingInput {
  confidence: number;
  cohortKey?: string;
  /** When set, PASS-only sampling helpers use this outcome. */
  overallResult?: AuditOutcomeForSampling;
  /** Stable id for deterministic bucketing (e.g. jobSheetId). */
  subjectId?: string | number;
}

export interface SamplingDecision {
  sample: boolean;
  rate: number;
  reason: string;
  /** True when the decision applies to a PASS sheet selected for human audit. */
  passSample?: boolean;
}

export interface SamplingPolicyOptions {
  baseRate?: number;
  lowConfidenceRate?: number;
  lowConfidenceThreshold?: number;
  /** Override rate used specifically for PASS human sampling. */
  passSampleRate?: number;
}

/**
 * Outcome of a human review of a sampled AUTO_PASS sheet.
 * A miss = human found a real defect the model marked PASS.
 */
export interface PassSampleReviewOutcome {
  sampled: boolean;
  /** True when human review found a defect on a sampled PASS. */
  humanFoundDefect: boolean;
}

export type PassSampleMissRateStatus = "pass" | "fail" | "unavailable";

export interface PassSampleMissRateMetrics {
  sampledCount: number;
  missCount: number;
  missRate: number | null;
  minSamplesRequired: number;
  measurementReady: boolean;
  provisionalMissRate?: number;
  note?: string;
}

export interface PassSampleMissRateResult {
  status: PassSampleMissRateStatus;
  metrics: PassSampleMissRateMetrics;
  maxMissRate: number;
  blockers: string[];
}

export interface PassSampleMissRateOptions {
  maxMissRate?: number;
  minSamplesRequired?: number;
}
