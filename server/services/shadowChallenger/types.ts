/**
 * Shadow / champion-challenger types (PR-21 / PR-AI-11)
 *
 * Shadow mode runs a challenger stack in parallel on live traffic without
 * affecting canonical audit results. Canary mode optionally serves the
 * challenger for a sampled percentage of traffic.
 */

export type ShadowMode = "off" | "shadow" | "canary";

/** Challenger strategies. real_model is separately gated and default-off. */
export type ChallengerStrategy = "rule_based" | "real_model";

export type AuditOutcome = "PASS" | "FAIL" | "REVIEW_QUEUE";

export interface JudgmentSnapshot {
  overallResult: AuditOutcome;
  score: number;
  model: string;
  findingCount: number;
  /** Stable fingerprints: `${ruleId}|${fieldName}|${reasonCode}|${severity}` */
  findingFingerprints: string[];
  extractedFieldKeys: string[];
  extractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
}

export interface FieldDisagreement {
  fieldName: string;
  championValue: string | null;
  challengerValue: string | null;
  kind: "value_mismatch" | "only_champion" | "only_challenger";
}

export interface ShadowComparison {
  schemaVersion: "1.0.0";
  mode: Exclude<ShadowMode, "off">;
  strategy: ChallengerStrategy;
  champion: JudgmentSnapshot;
  challenger: JudgmentSnapshot;
  /** True when overallResult matches */
  resultAgreed: boolean;
  resultDisagreement: boolean;
  scoreDelta: number;
  fieldDisagreements: FieldDisagreement[];
  findingDisagreements: {
    onlyInChampion: string[];
    onlyInChallenger: string[];
    shared: string[];
  };
  /** True when any result / field / finding disagreement exists */
  hasDisagreement: boolean;
  latencyMs: number;
  /** True when canary mode applied challenger as the served result */
  canaryApplied: boolean;
  sampled: boolean;
  jobSheetId?: number;
  createdAt: string;
}

/**
 * Champion vs challenger outcome rates in percent (0–100) and
 * percentage-point deltas (challenger − champion). Measured from
 * advisory shadow comparisons before any canary serve.
 */
export interface PassRateMeasurement {
  sampleSize: number;
  minSamplesRequired: number;
  /** True when sampleSize >= minSamplesRequired */
  measurementReady: boolean;
  /** True when no comparison in the set had canaryApplied */
  advisoryOnly: boolean;
  championPassRate: number;
  challengerPassRate: number;
  /** Challenger PASS% − champion PASS% (percentage points) */
  passRatePpDelta: number;
  championFailRate: number;
  challengerFailRate: number;
  failRatePpDelta: number;
  championReviewRate: number;
  challengerReviewRate: number;
  reviewRatePpDelta: number;
}

export interface ShadowDisagreementReport {
  totalComparisons: number;
  disagreementCount: number;
  disagreementRate: number;
  resultDisagreementCount: number;
  resultDisagreementRate: number;
  canaryAppliedCount: number;
  avgScoreDelta: number;
  byOutcomePair: Record<string, number>;
  topFieldDisagreements: Array<{ fieldName: string; count: number }>;
  recentDisagreements: ShadowComparison[];
  /** Pass-rate pp deltas — primary pre-canary measurement */
  passRate: PassRateMeasurement;
}

export interface ShadowChallengerSummary {
  enabled: boolean;
  mode: ShadowMode;
  canaryPercent: number;
  strategy: ChallengerStrategy;
  realModelEnabled: boolean;
  realModelId: string;
  asOf: string;
  report: ShadowDisagreementReport;
  /**
   * Convenience mirror of report.passRate for consumers that only need
   * the pre-canary pp-delta gate.
   */
  passRate: PassRateMeasurement;
}

export const SHADOW_COMPARISON_SCHEMA_VERSION = "1.0.0" as const;
