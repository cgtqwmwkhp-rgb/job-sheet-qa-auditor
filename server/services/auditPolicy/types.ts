/**
 * Admin-driven Major / Minor fail policy.
 *
 * Major → hard-fails the job card (overallResult FAIL).
 * Minor → Doc Quality % deduction; never hard-fails alone, but may put the
 *         sheet in REVIEW_QUEUE when Doc Quality falls below passMark.
 * Informational → no penalty (Passed / advisory).
 *
 * Best-in-class lock-in (v2): PASS requires no majors AND Doc Quality ≥ passMark.
 */

export type FailClass = "major" | "minor" | "informational";

export type AuditFormFamily =
  | "wasted-journey-v1"
  | "job-summary-v1"
  | "loler-examination-v1"
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
  /** Doc Quality deduction for a Major finding (hard-fail is separate). */
  major: number;
  /** Doc Quality deduction for a Minor finding. */
  minor: number;
  informational: number;
}

export interface AuditPolicy {
  /** Semver or date-based string stamped onto every audit for traceability. */
  version: string;
  weights: AuditPolicyWeights;
  /**
   * Minimum Doc Quality % for a sheet to PASS when there are no majors.
   * Below this (minors only) → REVIEW_QUEUE (Needs review).
   */
  passMark: number;
  forms: Record<string, AuditPolicyForm>;
}

export interface ClassifiedFindingMeta {
  failClass: FailClass;
  blocksOverallPass: boolean;
}
