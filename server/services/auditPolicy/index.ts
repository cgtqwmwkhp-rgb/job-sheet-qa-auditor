/**
 * Audit policy: classify findings and decide hard-fail vs score-only.
 */

import type { Finding } from "../analyzer";
import { DEFAULT_AUDIT_POLICY, AUDIT_POLICY_SETTING_KEY } from "./defaults";
import type {
  AuditPolicy,
  AuditPolicyRule,
  FailClass,
  AuditFormFamily,
} from "./types";

export type {
  AuditPolicy,
  AuditPolicyRule,
  FailClass,
  AuditFormFamily,
  AuditPolicyWeights,
  AuditPolicyForm,
} from "./types";

export { DEFAULT_AUDIT_POLICY, AUDIT_POLICY_SETTING_KEY } from "./defaults";

/** Extended finding with fail-class annotation (in-pipeline). */
export type PolicyFinding = Finding & {
  failClass?: FailClass;
  blocksOverallPass?: boolean;
};

function isIssueSeverity(severity: Finding["severity"]): boolean {
  return severity === "S0" || severity === "S1" || severity === "S2";
}

function isInformationalFinding(f: Finding): boolean {
  if (f.severity === "S3") return true;
  if (f.severity === "S2" && f.reasonCode === "LOW_CONFIDENCE") return true;
  if (/ocr\s*confidence/i.test(f.fieldName)) return true;
  return false;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findRule(
  policy: AuditPolicy,
  formFamily: string,
  finding: Finding
): AuditPolicyRule | null {
  const form = policy.forms[formFamily];
  if (!form) return null;

  const ruleIdNorm = normalizeKey(finding.ruleId || "");
  for (const rule of form.rules) {
    if (normalizeKey(rule.ruleId) === ruleIdNorm) return rule;
  }

  const fieldNorm = normalizeKey(finding.fieldName || "");
  for (const rule of form.rules) {
    if (normalizeKey(rule.label) === fieldNorm) return rule;
    for (const alias of rule.fieldAliases ?? []) {
      if (normalizeKey(alias) === fieldNorm) return rule;
    }
  }

  return null;
}

/**
 * Resolve form family slug used in policy.forms keys.
 */
export function resolveAuditFormFamily(
  templateSlug: string | null | undefined,
  isWastedJourney: boolean
): AuditFormFamily {
  if (isWastedJourney || templateSlug === "wasted-journey-v1") {
    return "wasted-journey-v1";
  }
  if (
    templateSlug === "job-summary-v1" ||
    templateSlug === "job-summary" ||
    !templateSlug
  ) {
    // Job Summary consistency runs for non-WJ sheets; default family for VOR path
    return "job-summary-v1";
  }
  return "default";
}

/**
 * Deep-merge a partial stored policy onto code defaults (preserves new seed rules).
 */
export function mergeAuditPolicy(
  stored: Partial<AuditPolicy> | null | undefined
): AuditPolicy {
  if (!stored || typeof stored !== "object") {
    return structuredClone(DEFAULT_AUDIT_POLICY);
  }

  const base = structuredClone(DEFAULT_AUDIT_POLICY);
  const weights = {
    ...base.weights,
    ...(stored.weights ?? {}),
  };

  const forms = { ...base.forms };
  if (stored.forms) {
    for (const [formId, formVal] of Object.entries(stored.forms)) {
      const seed = base.forms[formId];
      if (!seed) {
        forms[formId] = formVal as (typeof forms)[string];
        continue;
      }
      const byId = new Map(
        (formVal.rules ?? []).map(r => [r.ruleId, r] as const)
      );
      const mergedRules = seed.rules.map(seedRule => {
        const override = byId.get(seedRule.ruleId);
        if (!override) return seedRule;
        return {
          ...seedRule,
          ...override,
          // Keep seed aliases if override omits them
          fieldAliases: override.fieldAliases ?? seedRule.fieldAliases,
        };
      });
      // Allow admin-added custom rules not in seed
      for (const r of formVal.rules ?? []) {
        if (!seed.rules.some(s => s.ruleId === r.ruleId)) {
          mergedRules.push(r);
        }
      }
      forms[formId] = {
        label: formVal.label || seed.label,
        rules: mergedRules,
      };
    }
  }

  return {
    version: stored.version ?? base.version,
    weights,
    forms,
  };
}

/**
 * Classify a single finding. Unmapped Issues default to Minor (score only).
 * Informational / Passed findings stay informational.
 */
export function classifyFinding(
  finding: Finding,
  formFamily: string,
  policy: AuditPolicy
): FailClass {
  if (isInformationalFinding(finding)) return "informational";
  if (!isIssueSeverity(finding.severity) && finding.severity === "S3") {
    return "informational";
  }

  const rule = findRule(policy, formFamily, finding);
  if (rule) {
    if (!rule.enabled) return "informational";
    return rule.failClass;
  }

  // Unmapped Issue → Minor (never silent hard-fail)
  if (isIssueSeverity(finding.severity)) return "minor";
  return "informational";
}

function severityForFailClass(failClass: FailClass): Finding["severity"] {
  switch (failClass) {
    case "major":
      return "S1";
    case "minor":
      return "S2";
    default:
      return "S3";
  }
}

/**
 * Annotate findings with failClass and remap severity for persistence/UI.
 */
export function classifyFindings(
  findings: Finding[],
  formFamily: string,
  policy: AuditPolicy
): PolicyFinding[] {
  return findings.map(f => {
    const failClass = classifyFinding(f, formFamily, policy);
    // Preserve Passed/informational S3 as-is; remap Issues to Major/Minor severities
    if (isInformationalFinding(f) || failClass === "informational") {
      return {
        ...f,
        failClass: "informational",
        blocksOverallPass: false,
        severity: f.severity === "S3" ? "S3" : severityForFailClass(failClass),
      };
    }
    return {
      ...f,
      failClass,
      blocksOverallPass: failClass === "major",
      severity: severityForFailClass(failClass),
    };
  });
}

export function hasMajorFails(findings: PolicyFinding[]): boolean {
  return findings.some(
    f =>
      f.failClass === "major" ||
      (f.blocksOverallPass === true && f.failClass !== "informational")
  );
}

/**
 * Decide overall result from policy:
 * - Any Major → FAIL
 * - Else do not FAIL from Minor alone (demote Gemini FAIL → REVIEW_QUEUE if minors remain, else PASS)
 */
export function decideOverallResult(input: {
  current: "PASS" | "FAIL" | "REVIEW_QUEUE";
  findings: PolicyFinding[];
}): "PASS" | "FAIL" | "REVIEW_QUEUE" {
  if (hasMajorFails(input.findings)) {
    return "FAIL";
  }

  const hasMinors = input.findings.some(f => f.failClass === "minor");

  if (input.current === "FAIL") {
    // No majors — hard-fail not allowed from minors / LLM alone
    return hasMinors ? "REVIEW_QUEUE" : "PASS";
  }

  return input.current;
}

export function applyAuditPolicy(input: {
  findings: Finding[];
  formFamily: string;
  policy: AuditPolicy;
  currentResult: "PASS" | "FAIL" | "REVIEW_QUEUE";
}): {
  findings: PolicyFinding[];
  overallResult: "PASS" | "FAIL" | "REVIEW_QUEUE";
  hasMajorFails: boolean;
  majorCount: number;
  minorCount: number;
} {
  const findings = classifyFindings(
    input.findings,
    input.formFamily,
    input.policy
  );
  const majors = findings.filter(f => f.failClass === "major");
  const minors = findings.filter(f => f.failClass === "minor");
  const overallResult = decideOverallResult({
    current: input.currentResult,
    findings,
  });

  return {
    findings,
    overallResult,
    hasMajorFails: majors.length > 0,
    majorCount: majors.length,
    minorCount: minors.length,
  };
}

/** Parse raw DB setting value into a partial policy. */
export function parseStoredAuditPolicy(raw: unknown): Partial<AuditPolicy> | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    value = (raw as { value: unknown }).value;
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  return value as Partial<AuditPolicy>;
}
