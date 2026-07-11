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

/**
 * Contact fields judged solely by WJ-C020 / WJ-C030.
 * Gemini / ensemble findings on these fields are duplicates and double-penalise.
 */
const WASTED_JOURNEY_CONTACT_FIELD_KEYS = new Set([
  "schedulingcontacted",
  "schedulingteamcontacted",
  "sitecontactconfirmed",
  "bookingsitecontactconfirmed",
  "bookingsitecontact",
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

/** Header / label tokens that must never be treated as an asset number. */
const ASSET_NUMBER_REJECT = new Set([
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
  "COMPLETION",
  "REPAIR",
  "ISSUE",
  "WASTED",
  "JOURNEY",
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

/** True when a finding is about scheduling/control or booking-site contact. */
export function isWastedJourneyContactField(fieldName: string): boolean {
  const compact = fieldName
    .trim()
    .toLowerCase()
    .replace(/[\s_/-]+/g, "");
  if (WASTED_JOURNEY_CONTACT_FIELD_KEYS.has(compact)) return true;
  // Phrase forms from WJ-C findings / Gemini labels
  if (
    compact.includes("scheduling") &&
    (compact.includes("contact") || compact.includes("team"))
  ) {
    return true;
  }
  if (compact.includes("booking") && compact.includes("contact")) {
    return true;
  }
  if (compact.includes("sitecontact")) return true;
  return false;
}

/**
 * Merge WJ-C findings as SSOT for contact Yes policy.
 * Drops prior Gemini/ensemble Issues on the same contact fields so engineers
 * are not double-penalised (4 Issues for 2 failures).
 */
export function mergeWastedJourneyFindings(
  existing: Finding[],
  consistencyFindings: Finding[]
): Finding[] {
  const hasContactConsistency = consistencyFindings.some(
    f =>
      f.ruleId === `${WASTED_JOURNEY_RULE_PREFIX}020` ||
      f.ruleId === `${WASTED_JOURNEY_RULE_PREFIX}021` ||
      f.ruleId === `${WASTED_JOURNEY_RULE_PREFIX}030` ||
      f.ruleId === `${WASTED_JOURNEY_RULE_PREFIX}031`
  );

  const filtered = hasContactConsistency
    ? existing.filter(f => {
        // Keep Passed / informational noise off contacts; drop Issue duplicates
        if (!isWastedJourneyContactField(f.fieldName)) return true;
        // Always drop non-WJ-C findings on contact fields when WJ-C ran
        if (!f.ruleId?.startsWith(WASTED_JOURNEY_RULE_PREFIX)) return false;
        return true;
      })
    : existing;

  return [...filtered, ...consistencyFindings];
}

/**
 * True for PlantExpand-style asset numbers (e.g. YH23WKA_1C, BN21ACO_TL).
 * Rejects plain words like DETAILS / MAKE.
 */
function looksLikeAssetNumber(raw: string): boolean {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (v.length < 4 || v.length > 32) return false;
  if (ASSET_NUMBER_REJECT.has(v)) return false;
  if (/^DETAILS?/i.test(v)) return false;
  // Must mix letters + digits (registration / fleet style)
  if (!/[A-Z]/.test(v) || !/\d/.test(v)) return false;
  return /^[A-Z0-9][A-Z0-9_-]*$/i.test(v);
}

function normalizeAssetCandidate(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    // OCR sometimes splits underscore segments with spaces
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[^A-Z0-9]+|[^A-Z0-9_]+$/g, "");
  if (!looksLikeAssetNumber(cleaned)) return null;
  return cleaned;
}

/**
 * Extract Asset Number (Asset No) — never "Asset Details", never require Asset ID.
 * Handles same-line, next-line, and two-column OCR layouts.
 */
export function extractAssetNo(text: string): string | null {
  const normalized = text.replace(/\u00a0/g, " ");

  const patterns: RegExp[] = [
    // Asset No / Asset Number / Asset #  (explicitly not "Asset Details")
    /Asset\s*(?:No\.?|Number|#)\b\s*[:.|]?\s*([A-Z0-9][A-Z0-9 _-]{2,})/gi,
    // Value on the following line
    /Asset\s*(?:No\.?|Number|#)\b\s*[:.|]?\s*[\r\n]+\s*([A-Z0-9][A-Z0-9 _-]{2,})/gi,
    // Two-column / pipe tables: Asset No | YH23WKA_1C |
    /Asset\s*(?:No\.?|Number|#)\b\s*[|:]\s*([A-Z0-9][A-Z0-9 _-]{2,})/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      const candidate = normalizeAssetCandidate(match[1] ?? "");
      if (candidate) return candidate;
    }
  }

  // Nearby window after "Asset No" / "Asset Number" (skip "Asset Details")
  const labelHits: RegExpExecArray[] = [];
  const labelRe = /Asset\s*(?:No\.?|Number|#)\b/gi;
  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = labelRe.exec(normalized)) !== null) {
    labelHits.push(labelMatch);
  }
  for (const hit of labelHits) {
    const start = hit.index ?? 0;
    const window = normalized.slice(start, start + 120);
    if (/^Asset\s*Details/i.test(window)) continue;
    const tokenPatterns = [
      /\b([A-Z]{1,3}\d{2}[A-Z]{3}(?:[_\s-]?[A-Z0-9]+)?)\b/gi,
      /\b([A-Z0-9]{5,}(?:[_\s-][A-Z0-9]+)+)\b/gi,
    ];
    for (const tokenRe of tokenPatterns) {
      let tm: RegExpExecArray | null;
      while ((tm = tokenRe.exec(window)) !== null) {
        const candidate = normalizeAssetCandidate(tm[1] ?? "");
        if (candidate) return candidate;
      }
    }
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

  const assetNumber = extractAssetNo(text) ?? "";
  const dateRaw =
    lineValue(text, /\bDate\b/i) ??
    lineValue(text, /Completion\s*Details[\s\S]{0,40}?\bDate\b/i);
  // Prefer an explicit dd/mm/yyyy near Completion Details when label parse is noisy
  const dateFallback = normalizedDateFromText(text);
  const techRaw =
    lineValue(text, /Techni(?:ci)?an\s*Name/i) ?? lineValue(text, /Name/i);

  const hasSignOff =
    /signature\s*[-:]?\s*(?:signed|present|yes|[a-z0-9._-]{2,})/i.test(text) ||
    /(?:technician|technican|engineer)\s+signature/i.test(text);

  const hasDate = Boolean(
    (dateRaw && /\d/.test(dateRaw)) || dateFallback != null
  );

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
    hasAssetId: assetNumber.length > 0,
    assetId: assetNumber,
    hasDate,
    hasSignOff,
    technicianName: (techRaw ?? "").slice(0, 80),
  };
}

/** Prefer UK-style dates that appear on wasted journey completion blocks. */
function normalizedDateFromText(text: string): string | null {
  const m = text.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/);
  return m?.[1] ?? null;
}

function signalSummary(s: WastedJourneySignals): string {
  return [
    `WastedJourney=${s.isWastedJourneySheet ? "Yes" : "No"}`,
    `Reason=${s.hasReason ? "Yes" : "No"}`,
    `SchedulingContacted=${s.schedulingYes ? "Yes" : s.schedulingNo ? "No" : "Unknown"}`,
    `SiteContactConfirmed=${s.siteContactYes ? "Yes" : s.siteContactNo ? "No" : "Unknown"}`,
    `AssetNumber=${s.assetId || "Missing"}`,
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

  // WJ-C050 — identity (Asset Number + date; never job/serial; never "Asset ID")
  if (!signals.hasAssetId || !signals.hasDate) {
    findings.push(
      issue(
        `${WASTED_JOURNEY_RULE_PREFIX}050`,
        "Asset Number / Date",
        "MISSING_FIELD",
        `Wasted journey identity incomplete (Asset Number=${signals.assetId || "Missing"}, Date=${signals.hasDate ? "Yes" : "No"}).`,
        "Asset Number and date identify which visit was wasted. Job number and serial are not required.",
        "Complete Asset No (Asset Number) and Date on the sheet.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${WASTED_JOURNEY_RULE_PREFIX}051`,
        "Asset Number / Date",
        `Consistent: Asset Number ${signals.assetId} and date are present.`,
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
