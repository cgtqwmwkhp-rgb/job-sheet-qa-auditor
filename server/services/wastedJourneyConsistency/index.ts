/**
 * Wasted Journey documentation coherence judgment.
 *
 * Audits whether an abort/no-show visit was documented completely —
 * not whether any repair succeeded. Yes or No on contact questions both
 * count as answered; blank answers are Issues.
 */

import type { Finding } from "../analyzer";

export const WASTED_JOURNEY_RULE_PREFIX = "WJ-C";
export const WASTED_JOURNEY_TEMPLATE_ID = "wasted-journey-v1";

export interface WastedJourneySignals {
  isWastedJourneySheet: boolean;
  hasReason: boolean;
  reasonSnippet: string;
  schedulingAnswered: boolean;
  schedulingYes: boolean;
  schedulingNo: boolean;
  siteContactAnswered: boolean;
  siteContactYes: boolean;
  siteContactNo: boolean;
  hasAssetId: boolean;
  hasDate: boolean;
  hasSignOff: boolean;
  technicianName: string;
}

export interface WastedJourneyJudgmentResult {
  signals: WastedJourneySignals;
  findings: Finding[];
  hasBlockingIssues: boolean;
  summary: string;
}

const YES_NO_TOKEN_RE = /\b(yes|no|true|false)\b/i;

function lineValue(text: string, label: RegExp): string | null {
  const re = new RegExp(`${label.source}\\s*[:?]\\s*([^\\n\\r]{0,80})`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseYesNo(value: string | null): "yes" | "no" | "unknown" {
  if (!value) return "unknown";
  const m = value.match(YES_NO_TOKEN_RE);
  if (!m) return "unknown";
  return /^(yes|true)$/i.test(m[1]!) ? "yes" : "no";
}

/** True when OCR/title clearly identifies a Wasted Journey sheet. */
export function isWastedJourneyDocument(text: string): boolean {
  return /wasted\s*journey/i.test(text);
}

export function extractWastedJourneySignals(
  text: string
): WastedJourneySignals {
  const isWastedJourneySheet = isWastedJourneyDocument(text);

  const reasonRaw =
    lineValue(text, /Wasted\s*Journey\s*Reason/i) ??
    lineValue(
      text,
      /Repair\s*Issue\s*[:\-]?\s*Wasted\s*Journey[\s\S]{0,40}?Reason/i
    );

  let reasonSnippet = (reasonRaw ?? "").replace(/\s+/g, " ").trim();
  // Prefer dedicated reason line; fall back to common no-show phrasing nearby
  if (!reasonSnippet || /^(yes|no)\b/i.test(reasonSnippet)) {
    const noShow = text.match(
      /(?:customer\s*\/\s*driver\s*no[-\s]?show|site\s*inaccessible|no\s*access|cancelled\s*on\s*arrival)[^\n]{0,40}/i
    );
    reasonSnippet = noShow?.[0]?.trim() ?? reasonSnippet;
  }
  const hasReason =
    reasonSnippet.length >= 3 &&
    !/^(n\/a|na|nil|-|none)\.?$/i.test(reasonSnippet);

  const schedulingRaw =
    lineValue(
      text,
      /Have\s+you\s+successfully\s+contacted\s+the\s+Scheduling\s+Team(?:\s+to\s+advise\s+them)?/i
    ) ?? lineValue(text, /Scheduling\s+Team(?:\s+to\s+advise\s+them)?/i);
  const siteRaw =
    lineValue(
      text,
      /Have\s+you\s+successfully\s+contacted\s+the\s+original\s+Booking\s+Site\s+Contact(?:\s+to\s+confirm)?/i
    ) ?? lineValue(text, /Booking\s+Site\s+Contact(?:\s+to\s+confirm)?/i);

  const scheduling = parseYesNo(schedulingRaw);
  const site = parseYesNo(siteRaw);

  const assetRaw = lineValue(text, /Asset\s*No/i);
  const dateRaw = lineValue(text, /\bDate\b/i);
  const techRaw =
    lineValue(text, /Techni(?:ci)?an\s*Name/i) ?? lineValue(text, /Name/i);

  const hasSignOff =
    /signature\s*[:\-]?\s*(?:signed|present|yes|[a-z0-9._-]{2,})/i.test(text) ||
    /(?:technician|technican|engineer)\s+signature/i.test(text);

  return {
    isWastedJourneySheet,
    hasReason,
    reasonSnippet: reasonSnippet.slice(0, 160),
    schedulingAnswered: scheduling !== "unknown",
    schedulingYes: scheduling === "yes",
    schedulingNo: scheduling === "no",
    siteContactAnswered: site !== "unknown",
    siteContactYes: site === "yes",
    siteContactNo: site === "no",
    hasAssetId: Boolean(assetRaw && /[A-Z0-9]/i.test(assetRaw)),
    hasDate: Boolean(dateRaw && /\d/.test(dateRaw)),
    hasSignOff,
    technicianName: (techRaw ?? "").slice(0, 80),
  };
}

function signalSummary(s: WastedJourneySignals): string {
  return [
    `WastedJourney=${s.isWastedJourneySheet ? "Yes" : "No"}`,
    `Reason=${s.hasReason ? "Yes" : "No"}`,
    `SchedulingContacted=${s.schedulingYes ? "Yes" : s.schedulingNo ? "No" : "Unknown"}`,
    `SiteContactConfirmed=${s.siteContactYes ? "Yes" : s.siteContactNo ? "No" : "Unknown"}`,
    `AssetId=${s.hasAssetId ? "Yes" : "No"}`,
    `Date=${s.hasDate ? "Yes" : "No"}`,
    `SignOff=${s.hasSignOff ? "Yes" : "No"}`,
  ].join(" | ");
}

function issue(
  ruleId: string,
  fieldName: string,
  reasonCode: Finding["reasonCode"],
  message: string,
  why: string,
  fix: string,
  raw: string
): Finding {
  return {
    ruleId,
    fieldName,
    severity: "S1",
    reasonCode,
    rawSnippet: raw,
    normalisedSnippet: message,
    confidence: 90,
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
    rawSnippet: raw,
    normalisedSnippet: message,
    confidence: 90,
    pageNumber: 1,
    whyItMatters: why,
    suggestedFix:
      "No action required — wasted journey documentation is coherent.",
  };
}

/**
 * Evaluate Wasted Journey coherence. Call only for wasted-journey family docs.
 */
export function evaluateWastedJourneyConsistency(
  text: string
): WastedJourneyJudgmentResult {
  const signals = extractWastedJourneySignals(text);
  const raw = signalSummary(signals);
  const findings: Finding[] = [];

  if (!signals.isWastedJourneySheet) {
    return {
      signals,
      findings: [],
      hasBlockingIssues: false,
      summary: "Not a wasted journey sheet; skipped WJ consistency.",
    };
  }

  findings.push(
    passed(
      `${WASTED_JOURNEY_RULE_PREFIX}001`,
      "Wasted Journey Judgment",
      "Wasted Journey documentation detected. Checking reason, contact answers, identity, and sign-off — not repair outcome.",
      "This judgment audits whether the abort/no-show visit was recorded completely. A wasted journey is a valid operational outcome.",
      raw
    )
  );

  // WJ-C010 — reason required
  if (!signals.hasReason) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}010`,
        "Wasted Journey Reason",
        "MISSING_FIELD",
        "Sheet claims a wasted journey but the reason is blank.",
        "Ops needs a clear abort/no-show reason for scheduling and billing.",
        "Complete 'Wasted Journey Reason' (e.g. Customer / Driver No-Show).",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}011`,
        "Wasted Journey Reason",
        `Consistent: wasted journey reason recorded (${signals.reasonSnippet}).`,
        "Abort reason is documented.",
        raw
      )
    );
  }

  // WJ-C020 — scheduling contact answered (Yes or No both OK)
  if (!signals.schedulingAnswered) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}020`,
        "Scheduling Team Contacted",
        "INCOMPLETE_EVIDENCE",
        "Scheduling team contact question is present but not answered Yes or No.",
        "Contact attempts must be recorded even when unsuccessful.",
        "Answer 'Have you successfully contacted the Scheduling Team…?' with Yes or No.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}021`,
        "Scheduling Team Contacted",
        `Consistent: scheduling contact answered (${signals.schedulingYes ? "Yes" : "No"}).`,
        "Yes and No are both valid answers.",
        raw
      )
    );
  }

  // WJ-C030 — site contact answered
  if (!signals.siteContactAnswered) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}030`,
        "Booking Site Contact Confirmed",
        "INCOMPLETE_EVIDENCE",
        "Booking site contact question is present but not answered Yes or No.",
        "Site contact confirmation must be recorded even when unsuccessful.",
        "Answer 'Have you successfully contacted the original Booking Site Contact…?' with Yes or No.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}031`,
        "Booking Site Contact Confirmed",
        `Consistent: site contact answered (${signals.siteContactYes ? "Yes" : "No"}).`,
        "Yes and No are both valid answers.",
        raw
      )
    );
  }

  // WJ-C040 — sign-off
  if (!signals.hasSignOff) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}040`,
        "Technician Signature",
        "MISSING_FIELD",
        "Technician name/signature is missing on the wasted journey sheet.",
        "Sign-off confirms the engineer recorded the abort.",
        "Add technician name and signature.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}041`,
        "Technician Signature",
        "Consistent: technician sign-off is present.",
        "Abort documentation is signed.",
        raw
      )
    );
  }

  // WJ-C050 — identity
  if (!signals.hasAssetId || !signals.hasDate) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}050`,
        "Asset / Date Identity",
        "MISSING_FIELD",
        `Wasted journey identity incomplete (Asset=${signals.hasAssetId ? "Yes" : "No"}, Date=${signals.hasDate ? "Yes" : "No"}).`,
        "Asset and date identify which visit was wasted.",
        "Complete Asset No and Date on the sheet.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}051`,
        "Asset / Date Identity",
        "Consistent: asset and date are present.",
        "Visit identity is documented.",
        raw
      )
    );
  }

  const hasBlockingIssues = findings.some(
    f => f.severity === "S0" || f.severity === "S1"
  );

  const summary = hasBlockingIssues
    ? `Wasted journey documentation has Issues. ${raw}`
    : `Wasted journey documentation is coherent. ${raw}`;

  return { signals, findings, hasBlockingIssues, summary };
}
