/**
 * Engineer / technician name attribution gap findings (ATTR-C010–C012).
 *
 * ATTR-C010 (S2) — no usable extracted engineer/technician name
 * ATTR-C011 (S2) — name extracted but user match failed
 * ATTR-C012 (S3) — matched technicianId (informational pass)
 */

import type { Finding } from "../analyzer";
import {
  extractTechnicianNameFromReport,
  isPhantomOnlyRoster,
  prettifyExtractedName,
  resolveTechnicianMatch,
  type TechnicianCandidate,
} from "../technicianAttribution";
import type {
  EngineerAttributionResult,
  EngineerAttributionSignals,
  ReportAttributionStamp,
} from "./types";

export const ENGINEER_ATTR_RULE_PREFIX = "ATTR-C";
export const FEATURE_ENGINEER_ATTR_FINDING = "FEATURE_ENGINEER_ATTR_FINDING";

export function isEngineerAttrFindingEnabled(): boolean {
  const raw = process.env[FEATURE_ENGINEER_ATTR_FINDING];
  if (raw === undefined || raw === "") return true;
  return raw !== "false" && raw !== "0";
}

function issue(
  ruleId: string,
  fieldName: string,
  severity: Finding["severity"],
  reasonCode: Finding["reasonCode"],
  message: string,
  why: string,
  fix: string,
  raw: string,
  confidence = 88
): Finding {
  return {
    ruleId,
    fieldName,
    severity,
    reasonCode,
    rawSnippet: raw.slice(0, 300),
    normalisedSnippet: message,
    confidence,
    pageNumber: 1,
    whyItMatters: why,
    suggestedFix: fix,
  };
}

function passed(
  ruleId: string,
  fieldName: string,
  message: string,
  why: string,
  raw: string
): Finding {
  return {
    ruleId,
    fieldName,
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    rawSnippet: raw.slice(0, 300),
    normalisedSnippet: message,
    confidence: 90,
    pageNumber: 1,
    whyItMatters: why,
    suggestedFix:
      "No action required — engineer name matched a known technician.",
  };
}

export interface EvaluateEngineerAttributionInput {
  report: unknown;
  candidates?: TechnicianCandidate[];
}

function buildAttributionStamp(
  extractedName: string | null,
  match: ReturnType<typeof resolveTechnicianMatch>
): ReportAttributionStamp {
  return {
    extractedName,
    displayName: extractedName ? prettifyExtractedName(extractedName) : null,
    technicianId: match.technicianId,
    confidence: match.confidence,
    matchedOn: match.matchedOn,
  };
}

function buildSignals(
  stamp: ReportAttributionStamp
): EngineerAttributionSignals {
  return {
    extractedName: stamp.extractedName,
    displayName: stamp.displayName,
    technicianId: stamp.technicianId,
    matchConfidence: stamp.confidence,
    matchedOn: stamp.matchedOn,
  };
}

/**
 * Evaluate engineer/technician name extraction and user-match attribution gaps.
 */
export function evaluateEngineerAttribution(
  input: EvaluateEngineerAttributionInput
): EngineerAttributionResult {
  const emptyStamp: ReportAttributionStamp = {
    extractedName: null,
    displayName: null,
    technicianId: null,
    confidence: "none",
    matchedOn: null,
  };

  if (!isEngineerAttrFindingEnabled()) {
    return {
      signals: buildSignals(emptyStamp),
      findings: [],
      summary:
        "Engineer attribution findings disabled (FEATURE_ENGINEER_ATTR_FINDING off).",
      attribution: emptyStamp,
    };
  }

  const candidates = input.candidates ?? [];
  const extractedName = extractTechnicianNameFromReport(input.report);
  const rawSnippet = extractedName ?? "(no engineer name)";

  if (!extractedName) {
    const stamp = buildAttributionStamp(null, {
      technicianId: null,
      confidence: "none",
      matchedOn: null,
    });
    return {
      signals: buildSignals(stamp),
      findings: [
        issue(
          "ATTR-C010",
          "Engineer Attribution",
          "S2",
          "INCOMPLETE_EVIDENCE",
          "No usable engineer or technician name was extracted from the job sheet.",
          "Engineer attribution and coaching analytics require a named technician on the sheet.",
          "Ensure the Technician Name / Engineer field is legible and completed, or add a clear name label in the OCR pack.",
          rawSnippet
        ),
      ],
      summary: "No engineer name extracted; ATTR-C010 emitted.",
      attribution: stamp,
    };
  }

  const match = resolveTechnicianMatch(extractedName, candidates);
  const stamp = buildAttributionStamp(extractedName, match);
  const display = stamp.displayName ?? extractedName;

  if (match.technicianId == null) {
    // PR-A/PX-067: with no real technician roster candidates — either the
    // roster is empty, or every candidate is a synthetic OCR-attribution
    // phantom (no genuine registered technician to match against) — a match
    // failure is a roster artifact, not a genuine unmatched-name defect.
    // Skip ATTR-C011 rather than false-flag every spotless report.
    if (isPhantomOnlyRoster(candidates)) {
      return {
        signals: buildSignals(stamp),
        findings: [],
        summary: `Engineer name "${display}" extracted but no real technician roster candidates were available to match against; ATTR-C011 skipped.`,
        attribution: stamp,
      };
    }
    return {
      signals: buildSignals(stamp),
      findings: [
        issue(
          "ATTR-C011",
          "Engineer Attribution (Unmatched)",
          "S2",
          "INCOMPLETE_EVIDENCE",
          `Extracted engineer name "${display}" could not be matched to a known technician user.`,
          "Unmatched names block reliable engineer attribution, coaching, and cohort analytics.",
          `Verify "${display}" is a registered technician (check spelling, email local-part, or add the user). Prefer structured technicianName/engineer_name fields over free-text repair notes.`,
          rawSnippet
        ),
      ],
      summary: `Engineer name "${display}" unmatched; ATTR-C011 emitted.`,
      attribution: stamp,
    };
  }

  const matchedUser =
    candidates.find(c => c.id === match.technicianId)?.name ?? display;

  return {
    signals: buildSignals(stamp),
    findings: [
      passed(
        "ATTR-C012",
        "Engineer Attribution (Matched)",
        `Engineer name "${display}" matched to ${matchedUser} (${match.confidence} confidence).`,
        "Confirmed technician attribution supports coaching analytics and engineer-specific QA trends.",
        rawSnippet
      ),
    ],
    summary: `Engineer name matched to user ${match.technicianId}; ATTR-C012 emitted.`,
    attribution: stamp,
  };
}

/**
 * After pipeline auto-provisions a technician stub for an unmatched OCR name,
 * replace ATTR-C011 with informational ATTR-C012 and stamp technicianId.
 * Real roster matches still win first — this only runs on C011 paths.
 */
export function stampAutoProvisionedTechnician(
  prior: EngineerAttributionResult,
  technicianId: number,
  options: { created?: boolean } = {}
): EngineerAttributionResult {
  const name = prior.attribution.extractedName;
  if (!name || technicianId <= 0) return prior;

  const display = prior.attribution.displayName ?? prettifyExtractedName(name);
  const stamp: ReportAttributionStamp = {
    extractedName: name,
    displayName: display,
    technicianId,
    confidence: "probable",
    matchedOn: options.created ? "auto_provisioned" : "attribution_stub",
  };

  return {
    signals: buildSignals(stamp),
    findings: [
      passed(
        "ATTR-C012",
        "Engineer Attribution (Provisioned)",
        `Engineer name "${display}" attributed via ${
          options.created ? "auto-created" : "existing"
        } technician account for analytics.`,
        "Clear OCR names should attribute the sheet even when the engineer is not yet on the AAD/seed roster. Prefer seeding real engineers so coaching joins a durable identity.",
        name
      ),
    ],
    summary: `Engineer name "${display}" auto-provisioned to user ${technicianId}; ATTR-C011 suppressed.`,
    attribution: stamp,
  };
}
