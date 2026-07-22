/**
 * Photo evidence consistency — text/page hints + optional multimodal pair compare.
 *
 * PHOTO-C010 Minor — Parts/repairs present, no photo evidence hints
 * PHOTO-C011 Informational — Labels / Photo-N / multi-page / before-after hints present
 * PHOTO-C012 Major — Pair compare fails work_done or repaired_properly (high conf)
 * PHOTO-C013 Minor — Cleanliness fail (high conf)
 * PHOTO-C014 Minor — Inconclusive / unverified before-after (no VLM/Gemini)
 * PHOTO-C015 Informational — Duplicate fileHash warning (same pack re-uploaded)
 */

import type { Finding } from "../analyzer";
import {
  extractNamedSection,
  sectionHasContent,
} from "../jobSummaryConsistency";
import type { PhotoPairCompareArtifact } from "./pairCompare";
export {
  FEATURE_PHOTO_PAIR_COMPARE,
  FEATURE_PHOTO_PAIR_GEMINI,
  isPhotoPairCompareEnabled,
  isPhotoPairGeminiEnabled,
  runPhotoPairCompare,
  runHeuristicPairCompare,
} from "./pairCompare";
export type {
  PhotoPairCompareArtifact,
  PhotoPairResult,
  PhotoPairAxes,
  AxisVerdict,
  ConfidenceBand,
  PairCompareInput,
} from "./pairCompare";

export const PHOTO_EVIDENCE_RULE_PREFIX = "PHOTO-C";

export interface PhotoEvidenceHints {
  hasBeforeLabel: boolean;
  hasAfterLabel: boolean;
  photoNumberCount: number;
  pageMarkers: number;
  totalPagesHint: number | null;
  hintSummary: string[];
}

export interface PhotoEvidenceResult {
  findings: Finding[];
  hasPartsOrRepairs: boolean;
  partsUsedPresent: boolean;
  repairsRequiredPresent: boolean;
  hints: PhotoEvidenceHints;
  hasPhotoHints: boolean;
  duplicateFileHash: boolean;
  pairCompare?: PhotoPairCompareArtifact | null;
  summary: string;
}

export function extractPhotoEvidenceHints(
  text: string,
  options: { totalPages?: number | null } = {}
): PhotoEvidenceHints {
  const hasBeforeLabel =
    /\bbefore\s*(?:photo|image|pic(?:ture)?)\b|\bphoto\s*[:-]?\s*before\b|\bbefore\s*[:-]/i.test(
      text
    );
  const hasAfterLabel =
    /\bafter\s*(?:photo|image|pic(?:ture)?)\b|\bphoto\s*[:-]?\s*after\b|\bafter\s*[:-]/i.test(
      text
    );

  const photoNums = text.match(/\bPhoto\s*#?\s*\d+\b/gi) ?? [];
  const uniquePhotoNums = new Set(
    photoNums.map(p => p.replace(/\s+/g, " ").toLowerCase())
  );
  const pageMarkers = (text.match(/\bPage\s+\d+\b/gi) ?? []).length;

  const totalPagesHint =
    typeof options.totalPages === "number" && options.totalPages > 0
      ? options.totalPages
      : null;

  const hintSummary: string[] = [];
  if (hasBeforeLabel) hintSummary.push("before-label");
  if (hasAfterLabel) hintSummary.push("after-label");
  if (uniquePhotoNums.size > 0) {
    hintSummary.push(`Photo-N×${uniquePhotoNums.size}`);
  }
  if (pageMarkers > 0) hintSummary.push(`Page-markers×${pageMarkers}`);
  if (totalPagesHint != null && totalPagesHint >= 2) {
    hintSummary.push(`pages=${totalPagesHint}`);
  }

  return {
    hasBeforeLabel,
    hasAfterLabel,
    photoNumberCount: uniquePhotoNums.size,
    pageMarkers,
    totalPagesHint,
    hintSummary,
  };
}

function hasUsefulPhotoHints(hints: PhotoEvidenceHints): boolean {
  if (hints.hasBeforeLabel || hints.hasAfterLabel) return true;
  if (hints.photoNumberCount >= 1) return true;
  if (hints.totalPagesHint != null && hints.totalPagesHint >= 3) return true;
  if (hints.pageMarkers >= 2) return true;
  // Repair packs often append a single "Images" page (2 pages total).
  if (hints.totalPagesHint != null && hints.totalPagesHint >= 2) return true;
  return false;
}

/**
 * Hints that can actually form a Before/After pair — not just an Images
 * page count. Used to avoid PHOTO-C014 on repair packs that have photos
 * but no pair labels (YN62EAW).
 */
export function hasPairFormingHints(hints: PhotoEvidenceHints): boolean {
  return (
    hints.hasBeforeLabel || hints.hasAfterLabel || hints.photoNumberCount >= 1
  );
}

/** Repair Job Summary cues when Parts/Repairs sections fail to parse. */
function isRepairPhotoPath(text: string): boolean {
  return (
    /\bconsumables\s+used\??\s*yes\b/i.test(text) ||
    /\brepair\s+issue\b/i.test(text) ||
    /\bbreakdown\s*\/\s*repair\b/i.test(text)
  );
}

/**
 * Evaluate photo evidence expectations from text (+ optional pair-compare artifact).
 */
export function evaluatePhotoEvidenceConsistency(
  text: string,
  options: {
    totalPages?: number | null;
    /** Prior upload file hashes for this asset/job (sha256 hex). */
    priorFileHashes?: string[];
    /** Current document file hash. */
    fileHash?: string | null;
    /** Optional multimodal pair-compare artifact (from pairCompare stage). */
    pairCompare?: PhotoPairCompareArtifact | null;
  } = {}
): PhotoEvidenceResult {
  const partsUsedBody = extractNamedSection(text, "Parts Used");
  const repairsBody = extractNamedSection(text, "Repairs Required");

  const partsUsed = sectionHasContent(partsUsedBody);
  const repairs = sectionHasContent(repairsBody);
  const hints = extractPhotoEvidenceHints(text, {
    totalPages: options.totalPages,
  });
  const photoHints = hasUsefulPhotoHints(hints);
  const repairPath = isRepairPhotoPath(text);
  const hasPartsOrRepairs =
    partsUsed.present || repairs.present || (repairPath && photoHints);

  const duplicateFileHash = Boolean(
    options.fileHash &&
      options.priorFileHashes?.some(h => h === options.fileHash)
  );

  if (!hasPartsOrRepairs) {
    return {
      findings: [],
      hasPartsOrRepairs: false,
      partsUsedPresent: false,
      repairsRequiredPresent: false,
      hints,
      hasPhotoHints: photoHints,
      duplicateFileHash,
      pairCompare: options.pairCompare ?? null,
      summary: "No parts/repairs content; photo evidence check skipped.",
    };
  }

  const findings: Finding[] = [];
  const triggers: string[] = [];
  if (partsUsed.present) triggers.push(`Parts Used: ${partsUsed.snippet}`);
  if (repairs.present) triggers.push(`Repairs Required: ${repairs.snippet}`);
  if (!triggers.length && repairPath) {
    triggers.push("Repair Job Summary (consumables/repair cues)");
  }
  const raw = triggers.join(" | ");

  if (!photoHints) {
    findings.push({
      ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}010`,
      fieldName: "Photo Evidence",
      severity: "S2",
      reasonCode: "INCOMPLETE_EVIDENCE",
      rawSnippet: raw.slice(0, 300),
      normalisedSnippet:
        "Parts or repairs recorded but no before/after / Photo-N / multi-page photo hints were found.",
      confidence: 70,
      pageNumber: 1,
      whyItMatters:
        "Before/after photos corroborate parts fitted and repairs completed. " +
        "Without photo evidence the audit relies solely on text claims.",
      suggestedFix:
        "Attach before/after photos of the repair area in the evidence pack (multi-page PDF), labelled Before / After or Photo 1 / Photo 2.",
    });
  } else {
    findings.push({
      ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}011`,
      fieldName: "Photo Evidence Hints",
      severity: "S3",
      reasonCode: "EXTRACTED",
      rawSnippet: hints.hintSummary.join(", ").slice(0, 300),
      normalisedSnippet: hints.hintSummary.join(", ").slice(0, 300),
      confidence: 75,
      pageNumber: 1,
      whyItMatters:
        "Text/page hints suggest photo pages are present; multimodal pair compare may still verify work done.",
      suggestedFix: "No action required — photo hints present in the pack.",
    });
  }

  if (duplicateFileHash) {
    findings.push({
      ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}015`,
      fieldName: "Photo Evidence (Duplicate)",
      severity: "S3",
      reasonCode: "INCOMPLETE_EVIDENCE",
      rawSnippet: (options.fileHash ?? "").slice(0, 64),
      normalisedSnippet:
        "This evidence pack file hash matches a prior upload — possible duplicate photos.",
      confidence: 85,
      pageNumber: 1,
      whyItMatters:
        "Re-uploading the same PDF does not prove a new before/after capture of the repair.",
      suggestedFix:
        "Confirm the engineer captured fresh before/after photos for this visit, not a prior pack.",
    });
  }

  // Pair-compare findings (when artifact provided)
  const pair = options.pairCompare;
  if (pair && pair.pairs.length > 0) {
    for (const p of pair.pairs) {
      const axes = p.axes;
      const high =
        p.confidenceBand === "high" ||
        (typeof p.confidence === "number" && p.confidence >= 0.8);

      if (
        high &&
        pair.provider !== "heuristic" &&
        (axes.work_done === "fail" || axes.repaired_properly === "fail")
      ) {
        findings.push({
          ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}012`,
          fieldName: "Before/After Pair Compare",
          severity: "S1",
          reasonCode: "INCOMPLETE_EVIDENCE",
          rawSnippet: p.reasoning.slice(0, 300),
          normalisedSnippet:
            axes.work_done === "fail"
              ? "Before/after pair does not show work done relative to the before photo."
              : "Before/after pair does not show a proper repair matching parts/repairs claims.",
          confidence: Math.round((p.confidence ?? 0.85) * 100),
          pageNumber: p.afterPage ?? p.beforePage ?? 1,
          whyItMatters:
            "Claimed repairs without visual proof are a primary money leak — incomplete work leaves the yard and returns as a second visit.",
          suggestedFix:
            "Capture a clear after photo of the repaired area showing the fitted part / completed work, then re-upload the evidence pack.",
        });
      }

      if (high && pair.provider !== "heuristic" && axes.clean === "fail") {
        findings.push({
          ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}013`,
          fieldName: "Before/After Cleanliness",
          severity: "S2",
          reasonCode: "INCOMPLETE_EVIDENCE",
          rawSnippet: p.reasoning.slice(0, 300),
          normalisedSnippet:
            "After photo shows unfinished mess / debris on a repair-critical area.",
          confidence: Math.round((p.confidence ?? 0.85) * 100),
          pageNumber: p.afterPage ?? 1,
          whyItMatters:
            "Unclean finished state often signals incomplete work and customer complaints.",
          suggestedFix:
            "Clean the work area and recapture the after photo before closing the job card.",
        });
      }

      const unverified =
        pair.provider === "heuristic" ||
        p.confidenceBand === "low" ||
        axes.work_done === "inconclusive" ||
        axes.repaired_properly === "inconclusive";

      if (unverified) {
        findings.push({
          ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}014`,
          fieldName: "Before/After Pair Compare",
          severity: "S2",
          // INCOMPLETE_EVIDENCE — must stay Issues (not LOW_CONFIDENCE→S3 theater)
          reasonCode: "INCOMPLETE_EVIDENCE",
          rawSnippet: p.reasoning.slice(0, 300),
          normalisedSnippet:
            pair.provider === "heuristic"
              ? "Before/after labels present but visual pair compare was not verified by VLM."
              : "Before/after pair compare was inconclusive or unpaired.",
          confidence: Math.round((p.confidence ?? 0.4) * 100),
          pageNumber: p.beforePage ?? 1,
          whyItMatters:
            "Inconclusive or unverified pairs need human eyes — do not treat as proven repair.",
          suggestedFix:
            "Label pages Before/After clearly, ensure both pages show the same repair area, and enable VLM pair compare.",
        });
      }
    }
  } else if (pair && pair.pairs.length === 0 && photoHints) {
    // Images-only / page-count hints prove photos exist but cannot form a
    // Before/After pair — keep PHOTO-C011, do not Issue C014 (YN62EAW).
    if (hasPairFormingHints(hints)) {
      findings.push({
        ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}014`,
        fieldName: "Before/After Pair Compare",
        severity: "S2",
        reasonCode: "INCOMPLETE_EVIDENCE",
        rawSnippet: pair.summary.slice(0, 300),
        normalisedSnippet:
          "No before/after pairs could be formed from the pack.",
        confidence: 60,
        pageNumber: 1,
        whyItMatters:
          "Without paired pages, multimodal repair verification cannot run.",
        suggestedFix:
          "Include at least one Before and one After page of the same repair area.",
      });
    }
  }

  const major = findings.filter(f => f.severity === "S1").length;
  const minor = findings.filter(f => f.severity === "S2").length;
  const summary =
    major + minor > 0
      ? `Photo evidence: ${major} major, ${minor} minor (${hints.hintSummary.join(", ") || "no hints"}).`
      : `Photo evidence OK / advisory (${hints.hintSummary.join(", ") || "scaffold"}).`;

  return {
    findings,
    hasPartsOrRepairs: true,
    partsUsedPresent: partsUsed.present,
    repairsRequiredPresent: repairs.present,
    hints,
    hasPhotoHints: photoHints,
    duplicateFileHash,
    pairCompare: pair ?? null,
    summary,
  };
}
