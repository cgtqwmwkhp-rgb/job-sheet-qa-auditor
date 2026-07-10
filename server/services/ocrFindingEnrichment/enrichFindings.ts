/**
 * Enrich analyzer findings with OCR-4 deep evidence (PR-2).
 *
 * Null-safe: if deep fields are absent, returns findings unchanged.
 * Never throws — callers should still wrap in try/catch for pipeline safety.
 */

import type { Finding } from "../analyzer";
import type {
  OCRBlock,
  OCRPage,
  OCRResult,
  OCRWordConfidence,
} from "../ocrAdapter/types";
import type {
  AuditFindingBoundingBox,
  EnrichedFinding,
  FindingEvidenceSource,
} from "./types";

function hasDeepEvidence(pages: OCRPage[]): boolean {
  return pages.some(
    p =>
      (p.blocks?.length ?? 0) > 0 ||
      (p.confidenceScores?.wordConfidenceScores?.length ?? 0) > 0 ||
      (p.signatures?.length ?? 0) > 0
  );
}

function isSignatureFinding(finding: Finding): boolean {
  return (
    /signature/i.test(finding.fieldName) ||
    /signature/i.test(finding.ruleId ?? "")
  );
}

/** Common field → OCR label aliases for bbox enrichment when snippets miss. */
const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  timein: ["time in", "timein", "arrival", "arrived"],
  timeout: ["time out", "timeout", "departure", "departed", "left site"],
  customersignature: [
    "technician signature",
    "customer signature",
    "engineer signature",
    "signature",
    "signed by",
  ],
  techniciansignature: [
    "technician signature",
    "engineer signature",
    "signature",
    "signed by",
  ],
  jobreference: ["job no", "job number", "job ref", "job reference", "wo no"],
  assetid: ["asset no", "asset number", "asset id", "registration", "reg no"],
  date: ["date", "job date", "visit date"],
};

function fieldLabelNeedles(finding: Finding): string[] {
  const key = finding.fieldName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const aliases = FIELD_LABEL_ALIASES[key] ?? [];
  const fromName = finding.fieldName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return [...aliases, fromName].filter(Boolean);
}

function findMatchingBlockByFieldLabel(
  finding: Finding,
  pages: OCRPage[]
): { page: OCRPage; block: OCRBlock } | undefined {
  const needles = fieldLabelNeedles(finding).map(normalizeForMatch);
  if (needles.length === 0) return undefined;

  const candidates = pagesForFinding(pages, finding.pageNumber);
  let best: { page: OCRPage; block: OCRBlock; score: number } | undefined;

  for (const page of candidates) {
    if (!page.blocks?.length) continue;
    for (const block of page.blocks) {
      if (block.type === "signature") continue;
      if (!block.content || !block.boundingBox) continue;
      const hay = normalizeForMatch(block.content);
      for (const needle of needles) {
        if (needle.length < 2) continue;
        if (hay.includes(needle) || needle.includes(hay)) {
          const score = needle.length;
          if (!best || score > best.score) {
            best = { page, block, score };
          }
        }
      }
    }
  }

  return best ? { page: best.page, block: best.block } : undefined;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function pagesForFinding(pages: OCRPage[], pageNumber: number): OCRPage[] {
  const exact = pages.filter(p => p.pageNumber === pageNumber);
  return exact.length > 0 ? exact : pages;
}

function attachBbox(
  finding: Finding,
  bbox: AuditFindingBoundingBox,
  page: OCRPage,
  pageNumber?: number
): EnrichedFinding {
  const enriched: EnrichedFinding = {
    ...finding,
    boundingBox: {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      source: bbox.source,
      blockType: bbox.blockType,
      coordinateSpace: "percent",
      pageWidthPx: page.dimensions?.width,
      pageHeightPx: page.dimensions?.height,
    },
  };
  if (pageNumber !== undefined) {
    enriched.pageNumber = pageNumber;
  }
  return enriched;
}

function blockToAuditBbox(
  block: OCRBlock,
  source: FindingEvidenceSource
): AuditFindingBoundingBox | undefined {
  if (!block.boundingBox) return undefined;
  return {
    ...block.boundingBox,
    source,
    blockType: block.type,
  };
}

function findSignatureEvidence(
  finding: Finding,
  pages: OCRPage[]
): EnrichedFinding | undefined {
  const candidates = pagesForFinding(pages, finding.pageNumber);
  for (const page of candidates) {
    const sig =
      page.signatures?.[0] ?? page.blocks?.find(b => b.type === "signature");
    if (!sig) continue;

    if ("boundingBox" in sig && sig.boundingBox) {
      const bbox: AuditFindingBoundingBox = {
        ...sig.boundingBox,
        source: "ocr_signature_block",
        blockType: "signature",
      };
      return attachBbox(finding, bbox, page, page.pageNumber);
    }

    // Signature may be an OCRBlock without going through signatures[]
    if ("type" in sig && (sig as OCRBlock).type === "signature") {
      const block = sig as OCRBlock;
      const bbox = blockToAuditBbox(block, "ocr_signature_block");
      if (bbox) return attachBbox(finding, bbox, page, page.pageNumber);
    }
  }
  return undefined;
}

function findMatchingBlock(
  finding: Finding,
  pages: OCRPage[]
): { page: OCRPage; block: OCRBlock } | undefined {
  const snippet = finding.rawSnippet || finding.normalisedSnippet;
  if (!snippet?.trim()) return undefined;
  const needle = normalizeForMatch(snippet);
  if (needle.length < 2) return undefined;

  const candidates = pagesForFinding(pages, finding.pageNumber);
  for (const page of candidates) {
    if (!page.blocks?.length) continue;
    for (const block of page.blocks) {
      if (block.type === "signature") continue;
      if (!block.content) continue;
      const hay = normalizeForMatch(block.content);
      if (hay.includes(needle) || needle.includes(hay)) {
        return { page, block };
      }
    }
  }
  return undefined;
}

/**
 * Find word-confidence scores overlapping a snippet in page markdown.
 * Returns mean confidence in 0–1, or undefined if no overlap.
 */
function wordConfidenceForSnippet(
  page: OCRPage,
  snippet: string
): number | undefined {
  const words = page.confidenceScores?.wordConfidenceScores;
  if (!words?.length || !snippet.trim() || !page.markdown) return undefined;

  const idx = page.markdown.toLowerCase().indexOf(snippet.toLowerCase().trim());
  if (idx < 0) {
    // Try normalised whitespace match via block content already handled elsewhere
    return undefined;
  }
  const end = idx + snippet.trim().length;

  const overlapping = words.filter(w => {
    const wStart = w.startIndex;
    const wEnd = w.startIndex + (w.text?.length ?? 0);
    return wStart < end && wEnd > idx;
  });

  if (overlapping.length === 0) return undefined;
  const sum = overlapping.reduce((a, w) => a + w.confidence, 0);
  return sum / overlapping.length;
}

function applyWordConfidence(
  finding: EnrichedFinding,
  page: OCRPage
): EnrichedFinding {
  const snippet = finding.rawSnippet || finding.normalisedSnippet;
  if (!snippet) return finding;
  const conf = wordConfidenceForSnippet(page, snippet);
  if (conf === undefined) return finding;
  // Analyzer / DB use 0–100 scale
  return {
    ...finding,
    confidence: Math.round(conf * 10000) / 100,
  };
}

/**
 * Average page confidence prior for hybrid assessment (0–1).
 * Returns undefined when no page confidence is available.
 */
export function computePageConfidencePrior(
  ocrResult: OCRResult
): number | undefined {
  if (!ocrResult.success || ocrResult.pages.length === 0) return undefined;

  const scores = ocrResult.pages
    .map(p => p.confidenceScores?.averagePageConfidence)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));

  if (scores.length === 0) return undefined;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * True when any page has a signature block (OCR-4).
 */
export function hasOcrSignatureEvidence(ocrResult: OCRResult): boolean {
  return ocrResult.pages.some(
    p =>
      (p.signatures?.length ?? 0) > 0 ||
      p.blocks?.some(b => b.type === "signature")
  );
}

/**
 * Enrich findings with OCR block bboxes and word confidence when available.
 * Returns input unchanged when deep evidence is absent.
 */
export function enrichFindingsWithOcrEvidence(
  findings: Finding[],
  ocrResult: OCRResult
): EnrichedFinding[] {
  if (!findings.length) return findings;
  if (!ocrResult.success || !ocrResult.pages.length) return findings;
  if (!hasDeepEvidence(ocrResult.pages)) return findings;

  return findings.map(finding => {
    try {
      if (isSignatureFinding(finding)) {
        const withSig = findSignatureEvidence(finding, ocrResult.pages);
        if (withSig) {
          const page = ocrResult.pages.find(
            p => p.pageNumber === withSig.pageNumber
          );
          return page ? applyWordConfidence(withSig, page) : withSig;
        }
      }

      const match =
        findMatchingBlock(finding, ocrResult.pages) ??
        findMatchingBlockByFieldLabel(finding, ocrResult.pages);
      if (match) {
        const bbox = blockToAuditBbox(match.block, "ocr_block");
        if (bbox) {
          const enriched = attachBbox(
            finding,
            bbox,
            match.page,
            match.page.pageNumber
          );
          return applyWordConfidence(enriched, match.page);
        }
      }

      // Word-confidence-only path (no bbox match)
      const page =
        ocrResult.pages.find(p => p.pageNumber === finding.pageNumber) ??
        ocrResult.pages[0];
      if (page) {
        return applyWordConfidence(finding, page);
      }

      return finding;
    } catch {
      return finding;
    }
  });
}

/** @internal exported for tests */
export function _wordConfidenceForSnippet(
  page: OCRPage,
  snippet: string
): number | undefined {
  return wordConfidenceForSnippet(page, snippet);
}

/** @internal */
export type { OCRWordConfidence };
