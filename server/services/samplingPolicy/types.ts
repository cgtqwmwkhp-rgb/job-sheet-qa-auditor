/**
 * Human sampling policy types (Phase 3.x)
 */

export interface SamplingInput {
  confidence: number;
  cohortKey?: string;
}

export interface SamplingDecision {
  sample: boolean;
  rate: number;
  reason: string;
}

export interface SamplingPolicyOptions {
  baseRate?: number;
  lowConfidenceRate?: number;
  lowConfidenceThreshold?: number;
}
