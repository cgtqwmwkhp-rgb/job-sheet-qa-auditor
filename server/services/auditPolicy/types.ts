/**
 * Admin-driven Major / Minor fail policy.
 *
 * Major → hard-fails the job card (overallResult FAIL).
 * Minor → Doc Quality % only; never forces FAIL alone.
 * Informational → no penalty (Passed / advisory).
 */

export type FailClass = "major" | "minor" | "informational";

export type AuditFormFamily =
  | "wasted-journey-v1"
  | "job-summary-v1"
  | "default";

export interface AuditPolicyRule {
  ruleId: string;
  label: string;
  description: string;
  failClass: FailClass;
  enabled: boolean;
  /** Optional field-name aliases for matching LLM findings. */
  fieldAliases?: string[];
}

export interface AuditPolicyForm {
  label: string;
  rules: AuditPolicyRule[];
}

export interface AuditPolicyWeights {
  /** Coaching deduction for a Major finding (does not decide pass/fail). */
  major: number;
  /** Deduction for a Minor finding. */
  minor: number;
  informational: number;
}

export interface AuditPolicy {
  /** Semver or date-based string stamped onto every audit for traceability. */
  version: string;
  weights: AuditPolicyWeights;
  forms: Record<string, AuditPolicyForm>;
}

export interface ClassifiedFindingMeta {
  failClass: FailClass;
  blocksOverallPass: boolean;
}
