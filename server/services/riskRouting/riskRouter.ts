/**
 * Pure risk-based routing logic (Phase 3.1)
 *
 * No DB, no documentProcessor — safe to unit/contract test in isolation.
 */

import {
  DEFAULT_RISK_ROUTING_THRESHOLDS,
  type EvidencePack,
  type RiskRoutingFinding,
  type RiskRoutingInput,
  type RiskRoutingResult,
  type RiskRoutingThresholds,
  type RoutingDecision,
} from "./types";

const CRITICAL_SEVERITIES = new Set(["S0", "S1", "critical"]);

export function isCriticalFinding(finding: RiskRoutingFinding): boolean {
  const severity = finding.severity.trim().toLowerCase();
  if (severity === "critical") return true;
  return CRITICAL_SEVERITIES.has(finding.severity.toUpperCase());
}

function hasCriticalFindings(findings: RiskRoutingFinding[]): boolean {
  return findings.some(isCriticalFinding);
}

function resolveThresholds(
  partial?: Partial<RiskRoutingThresholds>
): RiskRoutingThresholds {
  return {
    highThreshold:
      partial?.highThreshold ?? DEFAULT_RISK_ROUTING_THRESHOLDS.highThreshold,
    midThreshold:
      partial?.midThreshold ?? DEFAULT_RISK_ROUTING_THRESHOLDS.midThreshold,
  };
}

function buildFindingsSummary(findings: RiskRoutingFinding[]): string {
  if (findings.length === 0) return "No findings";
  return findings
    .map(f => {
      const field = f.fieldName ? `${f.fieldName}: ` : "";
      const code = f.reasonCode ?? "finding";
      return `${field}${code} (${f.severity})`;
    })
    .join("; ");
}

function buildEvidencePack(
  input: RiskRoutingInput,
  reasons: string[]
): EvidencePack {
  return {
    jobSheetId: input.jobSheetId,
    findingsSummary:
      input.findingsSummary ?? buildFindingsSummary(input.findings),
    confidence: input.confidence,
    reasons,
  };
}

/**
 * Route a job sheet by confidence and finding severity.
 *
 * - critical finding → human_review (even at high confidence)
 * - confidence ≥ highThreshold, no critical → auto_pass
 * - confidence ≥ midThreshold → evidence_pack
 * - else → human_review
 */
export function routeByRisk(input: RiskRoutingInput): RiskRoutingResult {
  const thresholds = resolveThresholds(input.thresholds);
  const { confidence, findings } = input;
  const reasons: string[] = [];

  if (hasCriticalFindings(findings)) {
    reasons.push("Critical finding requires human review");
    return {
      decision: "human_review",
      confidence,
      reasons,
    };
  }

  let decision: RoutingDecision;

  if (confidence >= thresholds.highThreshold) {
    decision = "auto_pass";
    reasons.push(
      `Confidence ${confidence.toFixed(2)} ≥ high threshold ${thresholds.highThreshold}`
    );
    return { decision, confidence, reasons };
  }

  if (confidence >= thresholds.midThreshold) {
    decision = "evidence_pack";
    reasons.push(
      `Confidence ${confidence.toFixed(2)} ≥ mid threshold ${thresholds.midThreshold}`
    );
    return {
      decision,
      confidence,
      reasons,
      evidencePack: buildEvidencePack(input, reasons),
    };
  }

  decision = "human_review";
  reasons.push(
    `Confidence ${confidence.toFixed(2)} below mid threshold ${thresholds.midThreshold}`
  );
  return { decision, confidence, reasons };
}
