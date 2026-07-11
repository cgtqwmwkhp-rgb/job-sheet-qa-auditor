/**
 * Wasted Journey documentation coherence judgment.
 *
 * Audits whether an abort/no-show visit was documented completely —
 * not whether any repair succeeded.
 *
 * Policy (ops): engineer must contact control (Scheduling Team) AND booking
 * site contact, and both answers must be Yes. No / blank = Issue.
 * Job number and serial number are out of scope for this form family.
 */

import type { Finding } from "../analyzer";

export const WASTED_JOURNEY_RULE_PREFIX = "WJ-C";
export const WASTED_JOURNEY_TEMPLATE_ID = "wasted-journey-v1";

/** Ensemble / legacy fields that must never block a Wasted Journey audit. */
export const WASTED_JOURNEY_EXCLUDED_FIELDS = new Set([
  "jobNumber",
  "jobReference",
  "job_no",
  "Job Number",
  "Job No",
  "serialNumber",
  "serial_no",
  "serialNo",
  "Serial Number",
  "Serial No",
]);

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
  assetId: string;
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

/** Header / label tokens that must never be treated as an asset id. */
const ASSET_ID_REJECT = new Set([
  "DETAILS",
  "DETAIL",
  "NUMBER",
  "NO",
  "ID",
  "MAKE",
  "MODEL",
  "CUSTOMER",
  "SERIAL",
  "MILES",
  "HOURS",
  "ADDRESS",
  "CONTACT",
  "OPENREACH",
  "GROUPED",
  "ANCILLARIES",
]);

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

export function isWastedJourneyExcludedField(fieldName: string): boolean {
  const raw = fieldName.trim();
  if (WASTED_JOURNEY_EXCLUDED_FIELDS.has(raw)) return true;
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return (
    compact === "jobnumber" ||
    compact === "jobno" ||
    compact === "jobreference" ||
    compact === "serialnumber" ||
    compact === "serialno"
  );
}

/**
 * Extract Asset No robustly — never treat "Asset Details" header as the value.
 */
export function extractAssetNo(text: string): string | null {
  const patterns = [
    /Asset\s*(?:No|Number|ID|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,
    /(?:^|\n)\s*Asset\s*(?:No|Number|ID)\s*[:.]?\s*([A-Z0-9][A-Z0-9_-]{2,})/im,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    const candidate = m?.[1]?.trim().toUpperCase();
    if (!candidate) continue;
    if (ASSET_ID_REJECT.has(candidate)) continue;
    if (/^DETAILS?/i.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function extractWastedJourneySignals(
  text: string
): WastedJourneySignals {
  const isWastedJourneySheet = isWastedJourneyDocument(text);

  const reasonRaw =
    lineValue(text, /Wasted\s*Journey\s*Reason/i) ??
    lineValue(
      text,
      /Repair\s*Issue\s*[-:]?\s*Wasted\s*Journey[\s\S]{0,40}?Reason/i
    );

  let reasonSnippet = (reasonRaw ?? "").replace(/\s+/g, " ").trim();
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

  const assetId = extractAssetNo(text) ?? "";
  const dateRaw = lineValue(text, /\bDate\b/i);
  const techRaw =
    lineValue(text, /Techni(?:ci)?an\s*Name/i) ?? lineValue(text, /Name/i);

  const hasSignOff =
    /signature\s*[-:]?\s*(?:signed|present|yes|[a-z0-9._-]{2,})/i.test(text) ||
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
    hasAssetId: assetId.length > 0,
    assetId,
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
    `AssetId=${s.assetId || "Missing"}`,
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
      "Wasted Journey documentation detected. Checking reason, mandatory Yes contacts, identity, and sign-off — not repair outcome.",
      "This judgment audits abort/no-show paperwork. Job number and serial number are not required on this form.",
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

  // WJ-C020 — scheduling / control room contact must be Yes
  if (!signals.schedulingYes) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}020`,
        "Scheduling Team Contacted",
        signals.schedulingAnswered ? "CONFLICT" : "INCOMPLETE_EVIDENCE",
        signals.schedulingNo
          ? "Scheduling / control room contact is marked No — must be Yes."
          : "Scheduling / control room contact was not confirmed as Yes.",
        "Engineers must contact the control room (Scheduling Team) and record Yes.",
        "Contact the Scheduling Team and set the answer to Yes.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}021`,
        "Scheduling Team Contacted",
        "Consistent: scheduling / control room contact confirmed Yes.",
        "Mandatory control-room contact is documented.",
        raw
      )
    );
  }

  // WJ-C030 — booking site contact must be Yes
  if (!signals.siteContactYes) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}030`,
        "Booking Site Contact Confirmed",
        signals.siteContactAnswered ? "CONFLICT" : "INCOMPLETE_EVIDENCE",
        signals.siteContactNo
          ? "Booking site contact is marked No — must be Yes."
          : "Booking site contact was not confirmed as Yes.",
        "Engineers must contact the booking site contact and record Yes.",
        "Contact the original Booking Site Contact and set the answer to Yes.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}031`,
        "Booking Site Contact Confirmed",
        "Consistent: booking site contact confirmed Yes.",
        "Mandatory booking contact is documented.",
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

  // WJ-C050 — identity (asset + date; never job/serial)
  if (!signals.hasAssetId || !signals.hasDate) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}050`,
        "Asset / Date Identity",
        "MISSING_FIELD",
        `Wasted journey identity incomplete (Asset=${signals.assetId || "Missing"}, Date=${signals.hasDate ? "Yes" : "No"}).`,
        "Asset and date identify which visit was wasted. Job number and serial are not required.",
        "Complete Asset No and Date on the sheet.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}051`,
        "Asset / Date Identity",
        `Consistent: asset ${signals.assetId} and date are present.`,
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
