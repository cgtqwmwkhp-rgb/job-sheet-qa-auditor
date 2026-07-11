/**
 * Job Summary failure-path consistency judgment.
 *
 * Audits the *documentation* of a failed/VOR asset job — not whether the
 * asset itself passed inspection. Consistent VOR/unsafe/return/incomplete
 * stories PASS with explicit Passed findings so auditors can see the judgment.
 * Broken relationships or missing engineer narrative → Issues.
 */

import type { Finding } from "../analyzer";
import { hasVorBannerEvidence } from "../findingHygiene";
import {
  extractCompletionYesNo,
  COMPLETION_FIELD_BOUNDARIES,
} from "../extraction/completionYesNo";

export const CONSISTENCY_RULE_PREFIX = "JSR-C";

export interface FailurePathSignals {
  vor: boolean;
  unsafe: boolean;
  safeYes: boolean;
  returnVisit: boolean;
  returnVisitNo: boolean;
  incomplete: boolean;
  worksCompleteYes: boolean;
  /** Repairs Required section has content, or service type says Specify in Repairs. */
  repairsPath: boolean;
  /** Parts fitted this visit (Parts Used) — does not force return visit. */
  partsUsed: boolean;
  /** Outstanding parts the engineer did not have — forces return visit follow-up. */
  partsStillRequired: boolean;
  partsStillSnippet: string;
  partsUsedSnippet: string;
  failMarkCount: number;
  hasSubstantiveComments: boolean;
  commentSnippet: string;
  onFailurePath: boolean;
}

export interface ConsistencyJudgmentResult {
  signals: FailurePathSignals;
  findings: Finding[];
  /** True when any S0/S1 consistency Issue was raised. */
  hasBlockingIssues: boolean;
  summary: string;
}

export { extractCompletionYesNo } from "../extraction/completionYesNo";

const YES_NO_TOKEN_RE = /\b(yes|no|true|false)\b/i;

/**
 * Capture the short answer immediately after a label.
 * OCR often flattens the page into one line — never take the rest of the document.
 */
function lineValue(text: string, label: RegExp): string | null {
  const re = new RegExp(`${label.source}\\s*[:?]\\s*([^\\n\\r]{0,60})`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

/** First Yes/No token only — mutually exclusive. */
function parseYesNo(value: string | null): "yes" | "no" | "unknown" {
  if (!value) return "unknown";
  // If we accidentally captured the next field label, ignore
  if (
    COMPLETION_FIELD_BOUNDARIES.some(b =>
      new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(value)
    )
  ) {
    return "unknown";
  }
  const m = value.match(YES_NO_TOKEN_RE);
  if (!m) return "unknown";
  return /^(yes|true)$/i.test(m[1]) ? "yes" : "no";
}

function isYes(value: string | null): boolean {
  return parseYesNo(value) === "yes";
}

function isNo(value: string | null): boolean {
  return parseYesNo(value) === "no";
}

/**
 * Detect substantive engineer narrative (fault / action / parts), not labels alone.
 */
export function hasSubstantiveEngineerComments(text: string): {
  present: boolean;
  snippet: string;
} {
  const section =
    text.match(
      /(?:engineer\s*comments?|work\s*notes?|repairs?\s*(?:needed|details?)|action\s*required|defect(?:s)?\s*(?:found|notes?))\s*[:-]?\s*([\s\S]{15,800}?)(?=\n(?:technician\s*signature|customer\s*signature|completion\s*details|asset\s*details|job\s*details)\b|$)/i
    )?.[1] ?? "";

  const cleaned = section
    .replace(/\s+/g, " ")
    .replace(/^(?:none|n\/a|na|nil|-)\b\.?/i, "")
    .trim();

  // Reject label-only / tick-only noise
  if (cleaned.length < 20) {
    return { present: false, snippet: "" };
  }
  if (
    /^(?:see\s+above|vor|failed?|unsafe|return\s+visit|specify\s+in\s+repairs)\.?$/i.test(
      cleaned
    )
  ) {
    return { present: false, snippet: cleaned };
  }

  // Require at least a few content words beyond form boilerplate
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 4) {
    return { present: false, snippet: cleaned.slice(0, 120) };
  }

  return { present: true, snippet: cleaned.slice(0, 240) };
}

/** Section headers that bound repairs/parts blocks. */
const PARTS_SECTION_HEADERS = [
  "Repairs Required",
  "Parts Used",
  "Parts Still Required",
  "Technician Name",
  "Technician Signature",
  "Customer Signature",
  "Engineer Comments",
  "Work Notes",
] as const;

/** Convert a header name's literal spaces to `\s+` for OCR spacing tolerance. */
function flexPattern(name: string): string {
  return name.replace(/\s+/g, "\\s+");
}

const PAGE_PHOTO_RE = /^(?:Photo|Page)\s+\d/i;

function isSectionHeaderLine(line: string): string | null {
  const trimmed = line.trim();
  if (PAGE_PHOTO_RE.test(trimmed)) {
    return trimmed;
  }
  for (const h of PARTS_SECTION_HEADERS) {
    const re = new RegExp(`^${flexPattern(h)}\\s*[:-]?\\s*(.*)$`, "i");
    const m = trimmed.match(re);
    if (!m) continue;
    if (h === "Parts Used" && /^Still\b/i.test(m[1] ?? "")) continue;
    if (
      h === "Parts Used" &&
      /^Still\s+Required/i.test(trimmed.replace(/^Parts\s+/i, ""))
    ) {
      continue;
    }
    if (h === "Parts Used" && /Parts\s+Still\s+Required/i.test(trimmed)) {
      continue;
    }
    return h;
  }
  return null;
}

/**
 * Body text under a named section header until the next known header.
 *
 * Handles OCR spacing variance (double-spaces between words), page/photo
 * markers mid-section, and two-column layouts where the target header
 * appears after another header on the same line.
 */
export function extractNamedSection(text: string, headerName: string): string {
  const lines = text.split(/\r?\n/);
  const headerNorm = headerName.trim().toLowerCase();
  const escaped = flexPattern(headerName);
  let start = -1;
  let inline = "";
  let colOffset = -1;

  const startRe = new RegExp(`^${escaped}\\s*[:-]?\\s*(.*)$`, "i");
  const midLineRe = new RegExp(`\\s{3,}(${escaped})\\s*[:-]?\\s*(.*)$`, "i");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(startRe);
    if (m) {
      if (headerNorm === "parts used" && /still\s+required/i.test(trimmed)) {
        continue;
      }
      start = i;
      inline = (m[1] ?? "").trim();
      break;
    }
    // Fallback: header appears mid-line in a two-column layout
    const mid = lines[i].match(midLineRe);
    if (mid) {
      if (headerNorm === "parts used" && /still\s+required/i.test(lines[i])) {
        continue;
      }
      start = i;
      colOffset = lines[i].indexOf(mid[1]);
      inline = (mid[2] ?? "").trim();
      break;
    }
  }

  if (start < 0) return "";

  const body: string[] = [];
  if (inline) body.push(inline);

  for (let j = start + 1; j < lines.length; j++) {
    const hdr = isSectionHeaderLine(lines[j]);
    if (hdr && hdr.toLowerCase() !== headerNorm) {
      // Skip page/photo markers — they are not semantic section boundaries
      if (PAGE_PHOTO_RE.test(lines[j].trim())) continue;
      break;
    }
    if (colOffset >= 0) {
      // Two-column: only take content from this header's column onward
      const slice =
        lines[j].length > colOffset ? lines[j].substring(colOffset).trim() : "";
      if (slice) body.push(slice);
    } else {
      body.push(lines[j]);
    }
  }

  return body.join("\n").trim();
}

/** True when a section has real content (not blank / none / n/a). */
export function sectionHasContent(body: string): {
  present: boolean;
  snippet: string;
} {
  const cleaned = body
    .replace(/\s+/g, " ")
    .replace(/^(?:none|n\/a|na|nil|-|—|\.)+\.?$/i, "")
    .trim();
  if (cleaned.length < 2) {
    return { present: false, snippet: "" };
  }
  if (!/[a-z0-9]/i.test(cleaned)) {
    return { present: false, snippet: "" };
  }
  if (/^(?:see\s+above|tbc|tba|\.+)$/i.test(cleaned)) {
    return { present: false, snippet: cleaned };
  }
  return { present: true, snippet: cleaned.slice(0, 160) };
}

export function extractFailurePathSignals(
  text: string,
  options: { failMarkCount?: number } = {}
): FailurePathSignals {
  // Prefer grid-aware Yes/No extraction (Compliance forms put answers under labels).
  const safeAnswer = extractCompletionYesNo(text, [
    /Is\s+the\s+asset\s+safe\s+to\s+use\??/i,
    /Asset\s+Safe\s+To\s+Use\??/i,
  ]);
  const returnAnswer = extractCompletionYesNo(text, [
    /Is\s+a\s+return\s+visit\s+required\??/i,
    /Return\s+Visit\s+Needed\??/i,
  ]);
  const worksAnswer = extractCompletionYesNo(text, [
    /Were\s+all\s+works\s+fully\s+completed\??/i,
    /All\s+Works\s+Completed\??/i,
  ]);
  const serviceAnswer = extractCompletionYesNo(text, [
    /Was\s+the\s+service\s+fully\s+completed/i,
    /Service\s+Completed\??/i,
  ]);
  const additionalAnswer = extractCompletionYesNo(text, [
    /Have\s+all\s+of\s+the\s+additional\s+tasks\s+been\s+completed/i,
    /Additional\s+Tasks\s+Complete\??/i,
  ]);

  // Legacy lineValue kept as soft fallback when grid extractor is unknown
  const safeRaw =
    safeAnswer !== "unknown"
      ? safeAnswer
      : (lineValue(text, /Is\s+the\s+asset\s+safe\s+to\s+use\??/i) ??
        lineValue(text, /Asset\s+Safe\s+To\s+Use\??/i));
  const returnRaw =
    returnAnswer !== "unknown"
      ? returnAnswer
      : (lineValue(text, /Is\s+a\s+return\s+visit\s+required\??/i) ??
        lineValue(text, /Return\s+Visit\s+Needed\??/i));
  const worksRaw =
    worksAnswer !== "unknown"
      ? worksAnswer
      : (lineValue(text, /Were\s+all\s+works\s+fully\s+completed\??/i) ??
        lineValue(text, /All\s+Works\s+Completed\??/i));
  const serviceRaw =
    serviceAnswer !== "unknown"
      ? serviceAnswer
      : (lineValue(text, /Was\s+the\s+service\s+fully\s+completed/i) ??
        lineValue(text, /Service\s+Completed\??/i));
  const additionalRaw =
    additionalAnswer !== "unknown"
      ? additionalAnswer
      : (lineValue(
          text,
          /Have\s+all\s+of\s+the\s+additional\s+tasks\s+been\s+completed/i
        ) ?? lineValue(text, /Additional\s+Tasks\s+Complete\??/i));

  const serviceType =
    lineValue(text, /Type\s+of\s+service\s+completed/i) ??
    lineValue(text, /Compliance\s+Type/i) ??
    "";

  const repairsSection = sectionHasContent(
    extractNamedSection(text, "Repairs Required")
  );
  const partsUsedSection = sectionHasContent(
    extractNamedSection(text, "Parts Used")
  );
  const partsStillSection = sectionHasContent(
    extractNamedSection(text, "Parts Still Required")
  );

  const vor = hasVorBannerEvidence(text);
  const unsafe =
    safeAnswer === "no" || (safeAnswer === "unknown" && isNo(safeRaw));
  const safeYes =
    safeAnswer === "yes" || (safeAnswer === "unknown" && isYes(safeRaw));
  const returnVisit =
    returnAnswer === "yes" || (returnAnswer === "unknown" && isYes(returnRaw));
  const returnVisitNo =
    returnAnswer === "no" || (returnAnswer === "unknown" && isNo(returnRaw));

  const worksNo =
    worksAnswer === "no" || (worksAnswer === "unknown" && isNo(worksRaw));
  const serviceNo =
    serviceAnswer === "no" || (serviceAnswer === "unknown" && isNo(serviceRaw));
  const additionalNo =
    additionalAnswer === "no" ||
    (additionalAnswer === "unknown" && isNo(additionalRaw));
  const incomplete = worksNo || serviceNo || additionalNo;

  const worksYes =
    worksAnswer === "yes" || (worksAnswer === "unknown" && isYes(worksRaw));
  // Works fully complete when All Works is Yes and service/additional are not No
  // (grid layout often puts Yes under the label on the next line).
  const worksCompleteYes =
    worksYes && serviceAnswer !== "no" && additionalAnswer !== "no";

  // Do NOT key repairsPath off bare "parts required" / "Parts Used" — only
  // Repairs Required content or explicit "Specify in Repairs" service type.
  const repairsPath =
    repairsSection.present || /specify\s+in\s+repairs/i.test(serviceType);
  const failMarkCount = Math.max(0, options.failMarkCount ?? 0);
  const comments = hasSubstantiveEngineerComments(text);

  const onFailurePath =
    vor ||
    unsafe ||
    failMarkCount > 0 ||
    incomplete ||
    repairsPath ||
    partsStillSection.present;

  return {
    vor,
    unsafe,
    safeYes,
    returnVisit,
    returnVisitNo,
    incomplete,
    worksCompleteYes,
    repairsPath,
    partsUsed: partsUsedSection.present,
    partsStillRequired: partsStillSection.present,
    partsStillSnippet: partsStillSection.snippet,
    partsUsedSnippet: partsUsedSection.snippet,
    failMarkCount,
    hasSubstantiveComments: comments.present,
    commentSnippet: comments.snippet,
    onFailurePath,
  };
}

function signalSummary(s: FailurePathSignals): string {
  return [
    `VOR=${s.vor ? "Yes" : "No"}`,
    `SafeToUse=${s.unsafe ? "No" : s.safeYes ? "Yes" : "Unknown"}`,
    `ReturnVisit=${s.returnVisit ? "Yes" : s.returnVisitNo ? "No" : "Unknown"}`,
    `Incomplete=${s.incomplete ? "Yes" : s.worksCompleteYes ? "No" : "Unknown"}`,
    `FailMarks=${s.failMarkCount}`,
    `RepairsPath=${s.repairsPath ? "Yes" : "No"}`,
    `PartsUsed=${s.partsUsed ? "Yes" : "No"}`,
    `PartsStillRequired=${s.partsStillRequired ? "Yes" : "No"}`,
    `EngineerComments=${s.hasSubstantiveComments ? "Yes" : "No"}`,
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
    suggestedFix: "No action required — relationship is consistent.",
  };
}

/**
 * Evaluate Job Summary failure-path consistency and emit visible findings.
 */
export function evaluateJobSummaryConsistency(
  text: string,
  options: { failMarkCount?: number } = {}
): ConsistencyJudgmentResult {
  const signals = extractFailurePathSignals(text, options);
  const raw = signalSummary(signals);
  const findings: Finding[] = [];

  if (!signals.onFailurePath) {
    return {
      signals,
      findings: [],
      hasBlockingIssues: false,
      summary: "No failure-path signals; standard audit path.",
    };
  }

  // Always report the detected failure-path context (Passed tab when consistent)
  findings.push(
    passed(
      `${CONSISTENCY_RULE_PREFIX}001`,
      "Failure Path Judgment",
      "Failure-path documentation detected. Checking VOR ↔ safe-to-use ↔ return visit ↔ incomplete works ↔ Fail marks ↔ engineer comments.",
      "This judgment audits whether the engineer recorded a coherent failed-asset story — not whether the asset itself passed inspection.",
      raw
    )
  );

  // A: VOR without unsafe
  if (signals.vor && signals.safeYes) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}010`,
        "VOR ↔ Safe to Use",
        "CONFLICT",
        "VOR is marked but the asset is also marked safe to use.",
        "VOR assets must not be recorded as safe to use.",
        "Set 'Is the asset safe to use?' to No, or clear the VOR banner if incorrect.",
        raw
      )
    );
  } else if (signals.vor && !signals.unsafe && !signals.safeYes) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}011`,
        "VOR ↔ Safe to Use",
        "INCOMPLETE_EVIDENCE",
        "VOR is marked but 'Is the asset safe to use?' was not answered as No.",
        "VOR documentation must explicitly record that the asset is not safe to use.",
        "Complete 'Is the asset safe to use?: No'.",
        raw
      )
    );
  } else if (signals.vor && signals.unsafe) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}012`,
        "VOR ↔ Safe to Use",
        "Consistent: VOR present and asset marked not safe to use.",
        "VOR and safe-to-use answers agree.",
        raw
      )
    );
  }

  // B: Unsafe without VOR (when form supports VOR)
  if (signals.unsafe && !signals.vor) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}020`,
        "Unsafe ↔ VOR",
        "INCOMPLETE_EVIDENCE",
        "Asset marked not safe to use, but no VOR banner/status was recorded.",
        "Unsafe assets on Job Summary forms should be flagged VOR.",
        "Mark the vehicle/asset as VOR, or correct safe-to-use if wrong.",
        raw
      )
    );
  } else if (signals.unsafe && signals.vor) {
    // Already covered by C012; avoid duplicate unless VOR path skipped
    if (!findings.some(f => f.ruleId === `${CONSISTENCY_RULE_PREFIX}012`)) {
      findings.push(
        passed(
          `${CONSISTENCY_RULE_PREFIX}021`,
          "Unsafe ↔ VOR",
          "Consistent: unsafe asset is also marked VOR.",
          "Unsafe and VOR answers agree.",
          raw
        )
      );
    }
  }

  // C: Critical outcome without return visit
  const critical = signals.vor || signals.unsafe || signals.failMarkCount > 0;
  if (critical && signals.returnVisitNo) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}030`,
        "Return Visit Required",
        "CONFLICT",
        "VOR / unsafe / Fail marks are present but return visit is marked No.",
        "Critical outcomes require a planned return visit.",
        "Set 'Is a return visit required?' to Yes.",
        raw
      )
    );
  } else if (critical && !signals.returnVisit) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}031`,
        "Return Visit Required",
        "INCOMPLETE_EVIDENCE",
        "VOR / unsafe / Fail marks are present but return visit was not confirmed as Yes.",
        "Critical outcomes must record that a return visit is required.",
        "Complete 'Is a return visit required?: Yes'.",
        raw
      )
    );
  } else if (critical && signals.returnVisit) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}032`,
        "Return Visit Required",
        "Consistent: critical outcome is paired with return visit required.",
        "Follow-up is documented for the failed-asset path.",
        raw
      )
    );
  }

  // D: Critical/repairs but works marked complete
  if (
    (signals.vor ||
      signals.unsafe ||
      signals.failMarkCount > 0 ||
      signals.repairsPath) &&
    signals.worksCompleteYes
  ) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}040`,
        "Works Completion",
        "CONFLICT",
        "Failure/repairs signals are present but works are marked fully completed.",
        "Outstanding defects or repairs should not be closed as fully completed.",
        "Set works/service completion to No, or clear the failure/repairs signals.",
        raw
      )
    );
  } else if (
    (signals.vor ||
      signals.unsafe ||
      signals.failMarkCount > 0 ||
      signals.repairsPath) &&
    signals.incomplete
  ) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}041`,
        "Works Completion",
        "Consistent: failure/repairs path is paired with incomplete works/service.",
        "Completion answers match the failed-asset story.",
        raw
      )
    );
  }

  // E: Incomplete without return visit
  if (signals.incomplete && signals.returnVisitNo) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}050`,
        "Incomplete ↔ Return Visit",
        "CONFLICT",
        "Works/service are incomplete but return visit is marked No.",
        "Incomplete work must have a return visit.",
        "Set return visit required to Yes.",
        raw
      )
    );
  } else if (signals.incomplete && !signals.returnVisit) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}051`,
        "Incomplete ↔ Return Visit",
        "INCOMPLETE_EVIDENCE",
        "Works/service are incomplete but return visit was not confirmed as Yes.",
        "Incomplete work must record a return visit.",
        "Complete 'Is a return visit required?: Yes'.",
        raw
      )
    );
  } else if (signals.incomplete && signals.returnVisit) {
    if (!findings.some(f => f.ruleId === `${CONSISTENCY_RULE_PREFIX}032`)) {
      findings.push(
        passed(
          `${CONSISTENCY_RULE_PREFIX}052`,
          "Incomplete ↔ Return Visit",
          "Consistent: incomplete works paired with return visit required.",
          "Open work has a documented follow-up.",
          raw
        )
      );
    }
  }

  // F: Fail marks vs safe/complete
  if (signals.failMarkCount > 0 && signals.safeYes) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}060`,
        "Fail Column ↔ Safe to Use",
        "CONFLICT",
        `${signals.failMarkCount} Fail column mark(s) present but asset marked safe to use.`,
        "Fail ticks contradict a safe-to-use answer.",
        "Set safe to use to No, or correct the Fail column selections.",
        raw
      )
    );
  } else if (signals.failMarkCount > 0) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}061`,
        "Fail Column",
        `${signals.failMarkCount} Fail column mark(s) recorded on the checklist.`,
        "Fail marks are evidence on the failure path; they do not alone fail the documentation audit.",
        raw
      )
    );
  }

  // G: Repairs path without return visit (Repairs Required / Specify in Repairs)
  // Does NOT cover Parts Still Required — that is JSR-C090.
  if (signals.repairsPath && signals.returnVisitNo) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}070`,
        "Repairs ↔ Return Visit",
        "CONFLICT",
        "Repairs path is indicated but return visit is marked No.",
        "Repairs outstanding require a return visit.",
        "Set return visit required to Yes.",
        raw
      )
    );
  } else if (signals.repairsPath && signals.returnVisit) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}071`,
        "Repairs Path",
        "Consistent: repairs path is paired with return visit required.",
        "Repair follow-up is documented.",
        raw
      )
    );
  }

  // I: Parts Still Required → Return Visit Yes (Parts Used alone never forces this)
  if (signals.partsStillRequired && signals.returnVisitNo) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}090`,
        "Parts Still Required ↔ Return Visit",
        "CONFLICT",
        `Parts Still Required is recorded (${signals.partsStillSnippet}) but return visit is marked No.`,
        "Outstanding parts the engineer did not have require a follow-up return visit.",
        "Set Return Visit Needed / required to Yes.",
        raw
      )
    );
  } else if (signals.partsStillRequired && !signals.returnVisit) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}093`,
        "Parts Still Required ↔ Return Visit",
        "INCOMPLETE_EVIDENCE",
        `Parts Still Required is recorded (${signals.partsStillSnippet}) but return visit was not confirmed as Yes.`,
        "Outstanding parts require an explicit return visit follow-up.",
        "Complete Return Visit Needed / required: Yes.",
        raw
      )
    );
  } else if (signals.partsStillRequired && signals.returnVisit) {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}092`,
        "Parts Still Required ↔ Return Visit",
        `Consistent: Parts Still Required (${signals.partsStillSnippet}) is paired with return visit Yes.`,
        "Outstanding parts have a documented follow-up visit.",
        raw
      )
    );
  }

  // J: Parts Still Required cannot coexist with All Works Completed Yes
  if (signals.partsStillRequired && signals.worksCompleteYes) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}091`,
        "Parts Still Required ↔ Works Completion",
        "CONFLICT",
        `Parts Still Required is recorded (${signals.partsStillSnippet}) but works are marked fully completed.`,
        "Outstanding parts mean the job is not fully complete.",
        "Set All Works Completed / works fully completed to No, or clear Parts Still Required.",
        raw
      )
    );
  }

  // H: Engineer comments required on failure path
  if (!signals.hasSubstantiveComments) {
    findings.push(
      issue(
        `${CONSISTENCY_RULE_PREFIX}080`,
        "Engineer Comments (Failure Path)",
        "INCOMPLETE_EVIDENCE",
        "Failure-path signals are present but engineer comments do not detail what failed, why, parts required, or actions required.",
        "Auditors and users need a written narrative of the defect and required action when the asset fails / is VOR / needs return.",
        "Add engineer comments covering: what is wrong, why it failed, parts required (or none), and actions required.",
        raw
      )
    );
  } else {
    findings.push(
      passed(
        `${CONSISTENCY_RULE_PREFIX}081`,
        "Engineer Comments (Failure Path)",
        `Engineer comments present on failure path: ${signals.commentSnippet}`,
        "Failure narrative is available for auditors and users.",
        raw
      )
    );
  }

  const hasBlockingIssues = findings.some(
    f => f.severity === "S0" || f.severity === "S1"
  );
  const issueCount = findings.filter(
    f => f.severity === "S0" || f.severity === "S1"
  ).length;
  const passedCount = findings.filter(f => f.severity === "S3").length;

  return {
    signals,
    findings,
    hasBlockingIssues,
    summary: hasBlockingIssues
      ? `Failure-path consistency: ${issueCount} issue(s), ${passedCount} consistent check(s).`
      : `Failure-path consistency OK (${passedCount} checks reported).`,
  };
}
