/**
 * Clinical narrative QA for engineer comments on the failure path.
 *
 * COMMENT-C010 Presence (Major) — supersedes JSR-C080 emission when wired
 * COMMENT-C020 Sufficiency (Major) — What + (Next action OR Parts stance)
 * COMMENT-C030 Clarity (Minor) — vague / too thin
 * COMMENT-C040 Actionable (Major) — required when return visit or parts still required
 * COMMENT-C050 Cross-field (Minor) — comments omit Parts Still Required items
 * COMMENT-C041 Informational — coherent clinical narrative passed
 * COMMENT-C042 Clarity (Minor) — repair list without root-cause / fault clarity
 * FAULT-C010 (Minor) — placeholder Fault Reason (always-on; see faultReason.ts)
 */

import type { Finding } from "../analyzer";
import { stripLetterheadNoise } from "../letterheadNoise";
import {
  extractFailurePathSignals,
  extractNamedSection,
  sectionHasContent,
  type FailurePathSignals,
} from "../jobSummaryConsistency";
import {
  evaluateFaultReasonPlaceholder,
  resolveFaultReasonValue,
} from "./faultReason";

export {
  evaluateFaultReasonPlaceholder,
  extractFaultReasonFromText,
  isFaultReasonPlaceholderEnabled,
  isPlaceholderFaultReason,
  resolveFaultReasonValue,
  FEATURE_FAULT_REASON_PLACEHOLDER,
  FAULT_REASON_RULE_ID,
} from "./faultReason";

export const COMMENT_QUALITY_RULE_PREFIX = "COMMENT-C";

export interface CommentNarrativeAnalysis {
  rawSnippet: string;
  present: boolean;
  wordCount: number;
  hasWhat: boolean;
  hasImpact: boolean;
  hasPartsStance: boolean;
  hasNextAction: boolean;
  /** True when narrative states defect/cause, not only work-done/parts fitted. */
  hasFaultClarity: boolean;
  isVagueOnly: boolean;
  isTooThin: boolean;
  missingAxes: string[];
}

export interface CommentQualitySignals {
  onFailurePath: boolean;
  present: boolean;
  wordCount: number;
  hasWhat: boolean;
  hasImpact: boolean;
  hasPartsStance: boolean;
  hasNextAction: boolean;
  hasFaultClarity: boolean;
  isVagueOnly: boolean;
  isTooThin: boolean;
  missingAxes: string[];
  snippet: string;
  coherent: boolean;
  returnVisit: boolean;
  partsStillRequired: boolean;
  partsStillSnippet: string;
  placeholderFaultReason: boolean;
}

export interface CommentQualityResult {
  signals: CommentQualitySignals;
  findings: Finding[];
  summary: string;
  /** Deterministic scores for Deep Note / analytics (0–100). */
  scores: {
    completeness: number;
    clarity: number;
    actionability: number;
  };
}

const WHAT_RE =
  /\b(defect|fault|fail(?:ed|ure)?|broken|crack(?:ed)?|leak(?:ing)?|worn|damage(?:d)?|unsafe|vor|inoperable|seized|missing|bent|loose|corrod(?:ed|ion)|short(?:ed)?|overheat(?:ed|ing)?|noise|vibration|puncture|flat|tread|coupling|wheel|hinge|seal|pump|brake|tyre|tire)\b/i;

const IMPACT_RE =
  /\b(unsafe|cannot\s+operate|not\s+safe|vor|immobilis(?:ed|e)|out\s+of\s+service|risk|hazard|customer\s+impact|downtime|stranded)\b/i;

const PARTS_STANCE_RE =
  /\b(parts?\s+(?:used|fitted|required|still\s+required|ordered|needed|on\s+order)|fitted|replaced|no\s+parts|none\s+required|awaiting\s+parts|pn[- ]?\d)\b/i;

const NEXT_ACTION_RE =
  /\b(return\s+visit|retest|re[- ]?check|replace(?:ment)?|isolate|order(?:ed)?|follow[- ]?up|no\s+further\s+action|will\s+return|book(?:ed)?|awaiting|next\s+visit|requires?\s+(?:return|parts|repair))\b/i;

const VAGUE_ONLY_RE =
  /^(?:see\s+above|as\s+discussed|as\s+above|tbc|tba|vor|failed?|unsafe|return\s+visit|n\/a|none|ok|done|sorted|fixed|complete)\.?$/i;

/** Root-cause / defect clarity beyond a pure "work done" parts list. */
const FAULT_CLARITY_RE =
  /\b(because|due\s+to|caused\s+by|root\s+cause|fault(?:\s+reason)?|wear\s*(?:and|&)\s*tear|electrical|mechanical|user\s+error|defect|fail(?:ed|ure)|broken|crack(?:ed)?|worn|leak(?:ing)?|damage(?:d)?|unsafe|vor|inoperable|seized|corrod(?:ed|ion)|short(?:ed)?|puncture|flat\s+tyre|bent|loose)\b/i;

const WORK_DONE_ONLY_RE =
  /\b(fitted|replaced|installed|refitted|tightened|adjusted|cleaned|lubricat(?:ed|e)|completed|carried\s+out|parts?\s+used)\b/i;

function extractCommentBody(text: string): string {
  // Bound by signature / parts / Technican headers — NOT by "Parts Still
  // Required" alone as prose inside comments (Job-87). Cap 4000 for thorough
  // repair narratives; stop on whitespace OR newline (flattened text-layer).
  // Do NOT stop on "Parts Still Required" — Job-87 narratives use that as prose.
  // Do stop on "Parts Used" / Technican / signatures (YN62EAW flatten).
  const section =
    text.match(
      /(?:engineer\s*comments?|work\s*notes?)\s*[:-]?\s*([\s\S]{0,4000}?)(?=(?:\n|\s{2,})(?:parts\s+used\b(?!\s*still)|techni[cs]an|technician\s+signature|customer\s+signature|completion\s+details|fault\s+reason|breakdown\s*\/\s*repair)\b|$)/i
    )?.[1] ||
    extractNamedSection(text, "Engineer Comments") ||
    extractNamedSection(text, "Work Notes") ||
    text.match(
      /(?:repairs?\s*(?:needed|details?)|action\s*required|defect(?:s)?\s*(?:found|notes?))\s*[:-]?\s*([\s\S]{0,4000}?)(?=(?:\n|\s{2,})(?:parts\s+used\b(?!\s*still)|techni[cs]an|technician\s+signature|customer\s+signature)\b|$)/i
    )?.[1] ||
    "";

  return section
    .replace(/\s+/g, " ")
    .replace(/\b(?:technician|customer|technican)\s+signature\b.*$/i, "")
    .trim();
}

/**
 * Analyse clinical axes of an engineer narrative (deterministic).
 */
export function analyzeCommentNarrative(
  text: string
): CommentNarrativeAnalysis {
  const body = extractCommentBody(text);
  const cleaned = body.replace(/^(?:none|n\/a|na|nil|-)\b\.?/i, "").trim();
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  const present = cleaned.length >= 20 && words.length >= 4;
  const isVagueOnly =
    !present ||
    VAGUE_ONLY_RE.test(cleaned) ||
    (words.length <= 6 &&
      /^(?:see\s+above|as\s+discussed|vor|failed?|unsafe|return\s+visit)/i.test(
        cleaned
      ));
  const isTooThin = present && words.length < 8 && !WHAT_RE.test(cleaned);

  const hasWhat = present && WHAT_RE.test(cleaned);
  const hasImpact = present && IMPACT_RE.test(cleaned);
  const hasPartsStance = present && PARTS_STANCE_RE.test(cleaned);
  const hasNextAction = present && NEXT_ACTION_RE.test(cleaned);
  // Work-done lists with parts keywords but no defect/cause language fail clarity.
  const hasFaultClarity =
    present &&
    FAULT_CLARITY_RE.test(cleaned) &&
    !(WORK_DONE_ONLY_RE.test(cleaned) && !WHAT_RE.test(cleaned));

  const missingAxes: string[] = [];
  if (!present) missingAxes.push("presence");
  else {
    if (!hasWhat) missingAxes.push("what");
    if (!hasFaultClarity) missingAxes.push("faultClarity");
    if (!hasNextAction && !hasPartsStance)
      missingAxes.push("nextActionOrParts");
    if (isVagueOnly || isTooThin) missingAxes.push("clarity");
  }

  return {
    rawSnippet: cleaned.slice(0, 240),
    present,
    wordCount: words.length,
    hasWhat,
    hasImpact,
    hasPartsStance,
    hasNextAction,
    hasFaultClarity,
    isVagueOnly,
    isTooThin,
    missingAxes,
  };
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
    suggestedFix: "No action required — clinical narrative is coherent.",
  };
}

function coachWhatFix(): string {
  return (
    'Write a defect sentence, e.g. "Coupling jaw cracked on nearside — asset unsafe / VOR. ' +
    'Parts still required: coupling assembly. Return visit needed to fit."'
  );
}

function coachActionFix(partsSnippet?: string): string {
  const parts = partsSnippet
    ? ` Reference outstanding parts (${partsSnippet.slice(0, 80)}).`
    : "";
  return `State the next action explicitly, e.g. "Return visit required to fit ordered parts and retest."${parts}`;
}

function coachClarityFix(): string {
  return 'Replace vague notes ("VOR", "see above", "as discussed") with what failed, why it matters, and the next step.';
}

function coachPartsCrossFieldFix(partsSnippet: string): string {
  return `Mention the outstanding parts in Engineer Comments (e.g. "Parts still required: ${partsSnippet.slice(0, 100)}").`;
}

function scoreAxes(analysis: CommentNarrativeAnalysis): {
  completeness: number;
  clarity: number;
  actionability: number;
} {
  if (!analysis.present) {
    return { completeness: 0, clarity: 0, actionability: 0 };
  }
  let completeness = 40;
  if (analysis.hasWhat) completeness += 25;
  if (analysis.hasImpact) completeness += 10;
  if (analysis.hasPartsStance) completeness += 15;
  if (analysis.hasNextAction) completeness += 10;

  let clarity = 85;
  if (analysis.isVagueOnly) clarity = 25;
  else if (analysis.isTooThin) clarity = 45;
  else if (analysis.wordCount < 12) clarity = 60;

  let actionability = 30;
  if (analysis.hasNextAction) actionability += 40;
  if (analysis.hasPartsStance) actionability += 30;

  return {
    completeness: Math.min(100, completeness),
    clarity: Math.min(100, clarity),
    actionability: Math.min(100, actionability),
  };
}

/**
 * Evaluate clinical comment quality.
 * COMMENT-C* (except FAULT-C010) run on the failure path; FAULT-C010 is always-on.
 * COMMENT-C042 also runs when FAULT-C010 fires off the failure path.
 */
export function evaluateCommentQuality(
  text: string,
  options: {
    failMarkCount?: number;
    /** Precomputed failure-path signals (avoids double extraction). */
    signals?: FailurePathSignals;
    /** Structured Fault Reason extract (optional; falls back to OCR text). */
    faultReason?: string | null;
    /** Raw extractedFields.fault_reason object or string. */
    faultReasonExtracted?: unknown;
  } = {}
): CommentQualityResult {
  const fp =
    options.signals ??
    extractFailurePathSignals(text, { failMarkCount: options.failMarkCount });
  const analysis = analyzeCommentNarrative(text);
  const scores = scoreAxes(analysis);

  const resolvedFaultReason =
    options.faultReason ??
    resolveFaultReasonValue(options.faultReasonExtracted, text);
  const faultFindings = evaluateFaultReasonPlaceholder(resolvedFaultReason);
  const placeholderFaultReason = faultFindings.length > 0;

  const signals: CommentQualitySignals = {
    onFailurePath: fp.onFailurePath,
    present: analysis.present,
    wordCount: analysis.wordCount,
    hasWhat: analysis.hasWhat,
    hasImpact: analysis.hasImpact,
    hasPartsStance: analysis.hasPartsStance,
    hasNextAction: analysis.hasNextAction,
    hasFaultClarity: analysis.hasFaultClarity,
    isVagueOnly: analysis.isVagueOnly,
    isTooThin: analysis.isTooThin,
    missingAxes: analysis.missingAxes,
    snippet: stripLetterheadNoise(analysis.rawSnippet) ?? "",
    coherent: false,
    returnVisit: fp.returnVisit,
    partsStillRequired: fp.partsStillRequired,
    partsStillSnippet: fp.partsStillSnippet,
    placeholderFaultReason,
  };

  const findings: Finding[] = [...faultFindings];
  const raw = analysis.rawSnippet || "(no engineer comments)";

  if (!fp.onFailurePath) {
    // Off failure path: still emit FAULT-C010; optionally COMMENT-C042 with it.
    if (
      placeholderFaultReason &&
      analysis.present &&
      !analysis.hasFaultClarity
    ) {
      findings.push(
        issue(
          `${COMMENT_QUALITY_RULE_PREFIX}042`,
          "Engineer Comments (Fault Clarity)",
          "S2",
          "INCOMPLETE_EVIDENCE",
          "Fault Reason is incomplete and comments do not state a clear defect/root cause.",
          "Placeholder Fault Reason plus a work-done list leaves QA unable to verify why the repair was needed.",
          'State the defect/cause explicitly (e.g. "Nearside wheel bearing worn — unsafe") and pick a real Fault Reason category.',
          raw,
          82
        )
      );
    }
    // Still score coherence for Context coaching when a narrative exists.
    signals.coherent =
      analysis.present &&
      analysis.hasWhat &&
      (analysis.hasPartsStance || analysis.hasNextAction) &&
      !analysis.isVagueOnly &&
      !analysis.isTooThin &&
      !placeholderFaultReason;
    const summary = findings.length
      ? `Fault/comment honesty: ${findings.length} finding(s) off failure path.`
      : analysis.present
        ? signals.coherent
          ? "Standard-path comments reviewed — narrative axes look solid."
          : "Standard-path comments present — coach axes for completeness."
        : "No failure-path signals; no engineer comments to review.";
    return { signals, findings, summary, scores };
  }

  // COMMENT-C010 — Presence
  if (!analysis.present) {
    findings.push(
      issue(
        `${COMMENT_QUALITY_RULE_PREFIX}010`,
        "Engineer Comments (Clinical)",
        "S1",
        "INCOMPLETE_EVIDENCE",
        "Failure-path job lacks a substantive engineer diagnosis narrative.",
        "Without a written clinical story, QA cannot verify defect, parts stance, or follow-up — return visits and liability exposure follow.",
        coachWhatFix(),
        raw
      )
    );
    return {
      signals,
      findings,
      summary: "Comment quality: missing presence (COMMENT-C010).",
      scores,
    };
  }

  // COMMENT-C020 — Sufficiency: What + (Next action OR Parts stance)
  const sufficient =
    analysis.hasWhat && (analysis.hasNextAction || analysis.hasPartsStance);
  if (!sufficient) {
    const missing: string[] = [];
    if (!analysis.hasWhat) missing.push("what failed");
    if (!analysis.hasNextAction && !analysis.hasPartsStance) {
      missing.push("next action or parts stance");
    }
    findings.push(
      issue(
        `${COMMENT_QUALITY_RULE_PREFIX}020`,
        "Engineer Comments (Sufficiency)",
        "S1",
        "INCOMPLETE_EVIDENCE",
        `Diagnosis is present but incomplete — missing: ${missing.join(", ")}.`,
        "A clinical failure-path note must name the defect and either the next action or parts stance so the yard can plan the return.",
        !analysis.hasWhat
          ? coachWhatFix()
          : coachActionFix(fp.partsStillSnippet),
        raw
      )
    );
  }

  // COMMENT-C030 — Clarity
  if (analysis.isVagueOnly || analysis.isTooThin) {
    findings.push(
      issue(
        `${COMMENT_QUALITY_RULE_PREFIX}030`,
        "Engineer Comments (Clarity)",
        "S2",
        "INCOMPLETE_EVIDENCE",
        analysis.isVagueOnly
          ? "Engineer comments are vague-only (e.g. VOR / see above) and not clinically useful."
          : "Engineer comments are too thin to support a clinical audit of the failure.",
        "Vague notes force QA leads to re-read the whole sheet and often miss the real defect.",
        coachClarityFix(),
        raw,
        80
      )
    );
  }

  // COMMENT-C042 — Fault / root-cause clarity (S2 Issues)
  if (
    (fp.onFailurePath || placeholderFaultReason) &&
    analysis.present &&
    !analysis.hasFaultClarity
  ) {
    findings.push(
      issue(
        `${COMMENT_QUALITY_RULE_PREFIX}042`,
        "Engineer Comments (Fault Clarity)",
        "S2",
        "INCOMPLETE_EVIDENCE",
        placeholderFaultReason
          ? "Fault Reason is a placeholder and comments lack a clear defect/root cause."
          : "Engineer comments describe work done but do not state a clear defect/root cause.",
        "Without fault clarity, QA cannot verify why the asset failed or whether the repair addresses the root cause.",
        'Name the defect/cause (e.g. "Nearside wheel bearing worn / cracked — unsafe") — not only parts fitted.',
        raw,
        82
      )
    );
  }

  // COMMENT-C040 — Actionable when return visit or parts still required
  if ((fp.returnVisit || fp.partsStillRequired) && !analysis.hasNextAction) {
    findings.push(
      issue(
        `${COMMENT_QUALITY_RULE_PREFIX}040`,
        "Engineer Comments (Actionable)",
        "S1",
        "INCOMPLETE_EVIDENCE",
        "Return visit and/or Parts Still Required is set but comments do not state an actionable next step.",
        "Without an explicit next action, parts and scheduling cannot be planned — wasted journeys follow.",
        coachActionFix(fp.partsStillSnippet),
        raw
      )
    );
  }

  // COMMENT-C050 — Cross-field vs Parts Still Required
  if (fp.partsStillRequired && fp.partsStillSnippet) {
    const partsTokens = fp.partsStillSnippet
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 3)
      .slice(0, 8);
    const commentLower = analysis.rawSnippet.toLowerCase();
    const mentioned = partsTokens.some(t => commentLower.includes(t));
    const hasGenericPartsStance =
      analysis.hasPartsStance &&
      /\b(parts?\s+still\s+required|awaiting\s+parts|parts?\s+required)\b/i.test(
        analysis.rawSnippet
      );
    if (!mentioned && !hasGenericPartsStance) {
      findings.push(
        issue(
          `${COMMENT_QUALITY_RULE_PREFIX}050`,
          "Engineer Comments (Cross-field)",
          "S2",
          "INCOMPLETE_EVIDENCE",
          `Parts Still Required lists "${fp.partsStillSnippet.slice(0, 120)}" but Engineer Comments do not reference those parts.`,
          "Comments and Parts Still Required must agree so planners order the right parts.",
          coachPartsCrossFieldFix(fp.partsStillSnippet),
          raw,
          75
        )
      );
    }
  }

  const hasMajor = findings.some(f => f.severity === "S1");
  const hasMinor = findings.some(f => f.severity === "S2");
  // C041 only when Fault Reason clean, fault clarity present, and no hard fails.
  signals.coherent =
    !hasMajor &&
    !hasMinor &&
    sufficient &&
    analysis.hasFaultClarity &&
    !placeholderFaultReason;

  if (signals.coherent) {
    findings.push(
      passed(
        `${COMMENT_QUALITY_RULE_PREFIX}041`,
        "Engineer Comments (Clinical)",
        `Coherent clinical narrative: ${analysis.rawSnippet.slice(0, 160)}`,
        "Failure-path diagnosis covers what failed, fault clarity, and the parts/next-action stance.",
        raw
      )
    );
  }

  const majorCount = findings.filter(f => f.severity === "S1").length;
  const minorCount = findings.filter(f => f.severity === "S2").length;
  const summary = signals.coherent
    ? "Comment quality OK (COMMENT-C041 coherent narrative)."
    : `Comment quality: ${majorCount} major, ${minorCount} minor finding(s).`;

  return { signals, findings, summary, scores };
}

/** Helper for tests / cross-field fixtures. */
export function partsSectionSnippet(text: string): string {
  return sectionHasContent(extractNamedSection(text, "Parts Still Required"))
    .snippet;
}
