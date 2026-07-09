/**
 * Shadow / champion-challenger types (PR-21)
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
}

export interface ShadowChallengerSummary {
  enabled: boolean;
  mode: ShadowMode;
  canaryPercent: number;
  asOf: string;
  report: ShadowDisagreementReport;
}

export const SHADOW_COMPARISON_SCHEMA_VERSION = "1.0.0" as const;
