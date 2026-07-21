import type { Finding } from "../analyzer";
import { extractCompletionYesNo } from "../extraction/completionYesNo";
import {
  extractNamedSection,
  sectionHasContent,
} from "../jobSummaryConsistency";
import {
  isCompletePartsLine,
  parsePartsUsedLines,
} from "./parsePartsUsedLines";
import type { PartsAssessmentResult, PartsAssessmentSignals } from "./types";

export const PARTS_ASSESSMENT_RULE_PREFIX = "PARTS-C";
export const FEATURE_PARTS_LINE_ASSESSMENT = "FEATURE_PARTS_LINE_ASSESSMENT";

export function isPartsLineAssessmentEnabled(): boolean {
  const raw = process.env[FEATURE_PARTS_LINE_ASSESSMENT];
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

// PX-109 residual: some templates (e.g. Vacuum-class plant) have technicians
// write an explicit "not required" style note in Parts Used for a routine
// visit rather than leaving it blank/"None". sectionHasContent() only
// recognises bare none/n-a/nil style placeholders, so a note like "Nil
// required" or "No parts required" was previously treated as unparseable
// "real content" — over-firing MAJOR PARTS-C012 from a Repairs Required note
// alone even though no parts were actually implied. Treat these explicit
// not-required phrasings the same as an empty/None Parts Used section.
const PARTS_NOT_REQUIRED_RE =
  /^(?:no(?:t)?\s+parts?\s+(?:required|needed|used)|not\s+(?:required|applicable|needed)|nil\s*(?:required|needed)?|none\s+(?:required|needed)|n\/?a[\s.,-]*(?:required|needed)?)$/i;

function isPartsNotRequiredNote(body: string): boolean {
  const cleaned = body.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 && PARTS_NOT_REQUIRED_RE.test(cleaned);
}

function detectPartsImplied(
  text: string,
  partsUsedPresent: boolean,
  repairsPresent: boolean
): boolean {
  if (partsUsedPresent || repairsPresent) return true;

  const consumablesAnswer = extractCompletionYesNo(text, [
    /Consumables\s+Used\??/i,
  ]);
  return consumablesAnswer === "yes";
}

/**
 * Evaluate Parts Used lines for part-number + description pairing.
 */
export function evaluatePartsUsed(text: string): PartsAssessmentResult {
  const emptySignals: PartsAssessmentSignals = {
    partsImplied: false,
    partsUsedPresent: false,
    repairsPresent: false,
    consumablesYes: false,
    lineCount: 0,
    completeCount: 0,
    incompleteCount: 0,
    snippet: "",
  };

  if (!isPartsLineAssessmentEnabled()) {
    return {
      signals: emptySignals,
      findings: [],
      summary:
        "Parts line assessment disabled (FEATURE_PARTS_LINE_ASSESSMENT off).",
    };
  }

  const partsUsedBody = extractNamedSection(text, "Parts Used");
  const repairsBody = extractNamedSection(text, "Repairs Required");
  const partsNotRequired = isPartsNotRequiredNote(partsUsedBody);
  const partsUsedSection = partsNotRequired
    ? { present: false, snippet: "" }
    : sectionHasContent(partsUsedBody);
  const repairsSection = sectionHasContent(repairsBody);
  const consumablesAnswer = extractCompletionYesNo(text, [
    /Consumables\s+Used\??/i,
  ]);
  const consumablesYes = consumablesAnswer === "yes";
  const partsImplied = detectPartsImplied(
    text,
    partsUsedSection.present,
    repairsSection.present
  );

  const lines = partsNotRequired ? [] : parsePartsUsedLines(partsUsedBody);
  const completeLines = lines.filter(isCompletePartsLine);
  const incompleteLines = lines.filter(line => !isCompletePartsLine(line));

  const signals: PartsAssessmentSignals = {
    partsImplied,
    partsUsedPresent: partsUsedSection.present,
    repairsPresent: repairsSection.present,
    consumablesYes,
    lineCount: lines.length,
    completeCount: completeLines.length,
    incompleteCount: incompleteLines.length,
    snippet: partsUsedSection.snippet || repairsSection.snippet,
  };

  if (!partsImplied) {
    return {
      signals,
      findings: [],
      summary: "No parts context; Parts Used line assessment skipped.",
    };
  }

  const findings: Finding[] = [];

  for (const line of incompleteLines) {
    const hasPn = Boolean(line.partNumber?.trim());
    const hasDesc = Boolean(line.description?.trim());

    if (hasPn && !hasDesc) {
      findings.push(
        issue(
          `${PARTS_ASSESSMENT_RULE_PREFIX}010`,
          "Parts Used",
          "S2",
          "INCOMPLETE_EVIDENCE",
          `Part number "${line.partNumber}" is missing a description on the Parts Used line.`,
          "Auditors cannot verify what was fitted from a part number alone — the description confirms the correct component.",
          `Add a short description after the part number, e.g. ${line.partNumber} — wheel — 1.`,
          line.raw
        )
      );
      continue;
    }

    if (hasDesc && !hasPn) {
      findings.push(
        issue(
          `${PARTS_ASSESSMENT_RULE_PREFIX}011`,
          "Parts Used",
          "S2",
          "INCOMPLETE_EVIDENCE",
          `Description "${line.description}" is missing a part number on the Parts Used line.`,
          "Part numbers tie fitted items to procurement records and warranty claims; description-only lines cannot be reconciled.",
          `Add the manufacturer part number before the description, e.g. WT158 — ${line.description} — 1.`,
          line.raw
        )
      );
      continue;
    }

    if (!hasPn && !hasDesc) {
      findings.push(
        issue(
          `${PARTS_ASSESSMENT_RULE_PREFIX}011`,
          "Parts Used",
          "S2",
          "INCOMPLETE_EVIDENCE",
          "Parts Used line could not be parsed into part number and description.",
          "Unparseable parts lines block audit reconciliation against stock and warranty records.",
          "Record each part as PN — description — qty, e.g. WT158 — wheel — 1.",
          line.raw,
          75
        )
      );
    }
  }

  // PARTS-C014 soft path (Wave B): empty/None Parts Used with only a weak
  // implication — repairs noted and/or Consumables Used? = Yes — must not
  // hard-fail. Plantexpand forms never itemise oil/filters/grease under Parts
  // Used, so consumablesYes alone is not a confirmed parts-listing defect.
  // Keep MAJOR PARTS-C012 when Parts Used has real/incomplete/unparseable lines.
  const emptyPartsSoftImplication =
    !partsUsedSection.present &&
    lines.length === 0 &&
    (repairsSection.present || consumablesYes);

  if (completeLines.length === 0 && emptyPartsSoftImplication) {
    const softReason = consumablesYes
      ? repairsSection.present
        ? "Consumables Used is Yes and Repairs Required is noted, but Parts Used is empty/None."
        : "Consumables Used is Yes but Parts Used is empty/None."
      : "Repairs Required is noted but Parts Used is empty/None and Consumables Used is not marked Yes.";
    findings.push(
      issue(
        `${PARTS_ASSESSMENT_RULE_PREFIX}014`,
        "Parts Used",
        "S3",
        "LOW_CONFIDENCE",
        softReason,
        "Consumables (oil, filters, grease) are not line-itemised on these forms, and repairs alone don't confirm repair parts were fitted — treat as advisory unless Parts Used has incomplete lines.",
        "If a repair part was fitted, list it under Parts Used as PN — description — qty; consumables-only needs no Parts Used lines.",
        signals.snippet ||
          repairsBody.slice(0, 200) ||
          partsUsedBody.slice(0, 200),
        70
      )
    );
  } else if (completeLines.length === 0) {
    findings.push(
      issue(
        `${PARTS_ASSESSMENT_RULE_PREFIX}012`,
        "Parts Used",
        "S1",
        "MISSING_FIELD",
        "Parts are implied but no complete Parts Used lines (part number + description) were found.",
        "When a Parts Used section indicates parts were fitted, each line must pair a part number with a description for audit traceability.",
        "List every fitted part as PN — description — qty under Parts Used, e.g. WT158 — wheel — 1.",
        signals.snippet || partsUsedBody.slice(0, 200),
        82
      )
    );
  } else if (incompleteLines.length === 0) {
    findings.push(
      issue(
        `${PARTS_ASSESSMENT_RULE_PREFIX}013`,
        "Parts Used",
        "S3",
        "LOW_CONFIDENCE",
        `All ${completeLines.length} Parts Used line(s) include part number and description.`,
        "Complete PN + description pairing supports procurement reconciliation and warranty audit.",
        "No action required — Parts Used lines are complete.",
        completeLines.map(line => line.raw).join(" | "),
        90
      )
    );
  }

  const summaryParts = [
    `Implied=${partsImplied}`,
    `Lines=${lines.length}`,
    `Complete=${completeLines.length}`,
    `Issues=${findings.filter(f => f.severity !== "S3").length}`,
  ];

  return {
    signals,
    findings,
    summary: summaryParts.join(" | "),
  };
}
