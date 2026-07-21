/**
 * Propose ROIs from text-layer word boxes / label anchors (PX-105).
 *
 * Born-digital Job Summaries already carry per-word geometry via pdfjs.
 * Prefer these tight boxes over Azure DI layout lines, which often collapse
 * into one oversized page band and gate Promote-to-live.
 *
 * Does not touch Stage 1 extract — consumes EmbeddedPdfPageLayout + optional
 * GroundedTextLayerField anchors already produced by textLayerExtraction.
 */

import type { EmbeddedPdfPageLayout, PdfTextWord } from "../embeddedPdfText";
import type { GroundedTextLayerField } from "../textLayerExtraction/types";
import type { SelectionMarkRow } from "../selectionMarks";
import {
  suggestRoiFromLayoutEvidence,
  fieldsForRoiName,
  type LayoutLineForRoi,
  type ProposedRoiRegion,
} from "./roiProposeFromLayout";
import { filterOversizedProposedRegions } from "./roiQualityGates";

const DEFAULT_PAGE_W = 595;
const DEFAULT_PAGE_H = 842;

/** Max normalized sizes for grounded label+value capture */
const MAX_GROUNDED_H = 0.038;
const MAX_GROUNDED_W = 0.42;
const VALUE_PAD_X = 0.04;

export type TextLayerGeometrySource = "text-layer" | "none";

export interface TextLayerRoiProposeInput {
  pageLayouts: EmbeddedPdfPageLayout[];
  /** Optional grounded fields from label-anchor extract (preferred anchors). */
  groundedFields?: GroundedTextLayerField[];
  selectionRows?: SelectionMarkRow[];
  hasChecklist?: boolean;
  /** Production / embedded text truth for matcher gating. */
  textTruth?: string;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * PDF user-space (origin bottom-left) → percent coords matching Azure layout
 * (origin top-left, 0–100).
 */
export function pdfWordToLayoutPercents(
  word: PdfTextWord,
  pageWidth: number,
  pageHeight: number
): {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
} {
  const w = pageWidth > 0 ? pageWidth : DEFAULT_PAGE_W;
  const h = pageHeight > 0 ? pageHeight : DEFAULT_PAGE_H;
  const widthPercent = Math.max(0.5, clamp01(word.width / w) * 100);
  const heightPercent = Math.max(0.4, clamp01(word.height / h) * 100);
  const xPercent = clamp01(word.x / w) * 100;
  // Center Y in top-left percent space (matches AzureTextLine convention)
  const topY = clamp01(1 - (word.y + word.height) / h);
  const yPercent = topY * 100 + heightPercent / 2;
  return { xPercent, yPercent, widthPercent, heightPercent };
}

function pdfBoxToNormalized01(
  box: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  const w = pageWidth > 0 ? pageWidth : DEFAULT_PAGE_W;
  const h = pageHeight > 0 ? pageHeight : DEFAULT_PAGE_H;
  const width = clamp01(box.width / w);
  const height = clamp01(box.height / h);
  const x = clamp01(box.x / w);
  const y = clamp01(1 - (box.y + box.height) / h);
  return {
    x,
    y,
    width: Math.max(0.02, width),
    height: Math.max(0.012, height),
  };
}

/**
 * Cluster words into reading-order lines for label matchers.
 * Skips page-wide garbage lines (PX-105 root cause of the single blob).
 */
export function clusterWordsIntoLayoutLines(
  pageLayouts: EmbeddedPdfPageLayout[]
): LayoutLineForRoi[] {
  const lines: LayoutLineForRoi[] = [];

  for (const page of pageLayouts) {
    const pageW = page.width ?? DEFAULT_PAGE_W;
    const pageH = page.height ?? DEFAULT_PAGE_H;
    const words = [...(page.words ?? [])].sort((a, b) => {
      const lineDelta = b.y - a.y;
      if (Math.abs(lineDelta) > Math.max(a.height, b.height) * 0.5) {
        return lineDelta;
      }
      return a.x - b.x;
    });
    if (words.length === 0) continue;

    const clusters: PdfTextWord[][] = [];
    let current: PdfTextWord[] = [];
    let currentY = words[0].y;

    for (const word of words) {
      const tol = Math.max(word.height, current[0]?.height ?? 8) * 0.55;
      if (current.length === 0 || Math.abs(word.y - currentY) <= tol) {
        current.push(word);
        currentY =
          current.reduce((s, w) => s + w.y, 0) / Math.max(current.length, 1);
      } else {
        clusters.push(current);
        current = [word];
        currentY = word.y;
      }
    }
    if (current.length) clusters.push(current);

    for (const cluster of clusters) {
      const content = cluster
        .map(w => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!content) continue;

      let minX = Infinity;
      let maxX = -Infinity;
      let minTop = Infinity;
      let maxBottom = -Infinity;
      for (const w of cluster) {
        const pct = pdfWordToLayoutPercents(w, pageW, pageH);
        const top = pct.yPercent - pct.heightPercent / 2;
        const bottom = pct.yPercent + pct.heightPercent / 2;
        minX = Math.min(minX, pct.xPercent);
        maxX = Math.max(maxX, pct.xPercent + pct.widthPercent);
        minTop = Math.min(minTop, top);
        maxBottom = Math.max(maxBottom, bottom);
      }
      const widthPercent = Math.max(0.5, maxX - minX);
      const heightPercent = Math.max(0.4, maxBottom - minTop);

      // Reject page-spanning lines — they produce the PX-105 oversized blob
      if (widthPercent > 72 || heightPercent > 6) {
        // Still keep short label-like content if the width is from sparse words
        if (content.length > 80 || widthPercent > 85) continue;
      }

      lines.push({
        pageNumber: page.pageNumber,
        content,
        xPercent: minX,
        yPercent: (minTop + maxBottom) / 2,
        widthPercent: Math.min(70, widthPercent),
        heightPercent: Math.min(4, heightPercent),
      });
    }
  }

  return lines;
}

function expandGroundedBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const height = clamp01(
    Math.min(MAX_GROUNDED_H, Math.max(0.016, bounds.height * 1.4))
  );
  const width = clamp01(
    Math.min(
      MAX_GROUNDED_W,
      Math.max(bounds.width + VALUE_PAD_X, 0.18),
      1 - bounds.x - 0.02
    )
  );
  return {
    x: bounds.x,
    y: clamp01(bounds.y - (height - bounds.height) * 0.2),
    width,
    height,
  };
}

/**
 * Tight ROIs from label-anchor grounded fields (value bbox + pad).
 */
export function proposeRoiFromGroundedFields(
  groundedFields: GroundedTextLayerField[],
  pageLayouts: EmbeddedPdfPageLayout[]
): ProposedRoiRegion[] {
  const pageSize = new Map<number, { width: number; height: number }>();
  for (const p of pageLayouts) {
    pageSize.set(p.pageNumber, {
      width: p.width ?? DEFAULT_PAGE_W,
      height: p.height ?? DEFAULT_PAGE_H,
    });
  }

  const byField = new Map<string, GroundedTextLayerField>();
  for (const f of groundedFields) {
    // Prefer primary ids; skip aliases once primary exists
    if (byField.has(f.fieldId)) continue;
    byField.set(f.fieldId, f);
  }

  const regions: ProposedRoiRegion[] = [];
  const seenNames = new Set<string>();

  for (const field of Array.from(byField.values())) {
    // Aliases already duplicated in extract — skip dateOfService etc. if primary present
    if (
      field.fieldId === "dateOfService" ||
      field.fieldId === "jobNumber" ||
      field.fieldId === "serialNumber"
    ) {
      continue;
    }
    const size = pageSize.get(field.page) ?? {
      width: DEFAULT_PAGE_W,
      height: DEFAULT_PAGE_H,
    };
    const raw = pdfBoxToNormalized01(field.bbox, size.width, size.height);
    const bounds = expandGroundedBounds(raw);
    const name = field.fieldId;
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    regions.push({
      name,
      page: field.page,
      bounds,
      fields: fieldsForRoiName(name),
      confidence: Math.min(0.96, field.confidence),
      source: "text-layer",
      why: `Text-layer label anchor “${field.label ?? name}” → “${field.value.slice(0, 24)}”`,
      accepted: true,
    });
  }

  return regions;
}

function mergePreferGrounded(
  grounded: ProposedRoiRegion[],
  layoutSuggested: ProposedRoiRegion[]
): ProposedRoiRegion[] {
  const byName = new Map<string, ProposedRoiRegion>();
  for (const r of layoutSuggested) {
    byName.set(r.name, r);
  }
  // Grounded wins on same name (tighter value boxes)
  for (const r of grounded) {
    byName.set(r.name, r);
  }
  return Array.from(byName.values());
}

/**
 * Build ROI regions from text-layer word boxes + optional grounded anchors.
 * Returns [] when no usable geometry (caller falls back to Azure / manual).
 */
export function suggestRoiFromTextLayerEvidence(
  input: TextLayerRoiProposeInput
): ProposedRoiRegion[] {
  const {
    pageLayouts,
    groundedFields = [],
    selectionRows = [],
    hasChecklist = false,
    textTruth,
  } = input;

  const wordCount = pageLayouts.reduce((n, p) => n + (p.words?.length ?? 0), 0);
  if (wordCount === 0 && groundedFields.length === 0) {
    return [];
  }

  const lines = clusterWordsIntoLayoutLines(pageLayouts);
  const layoutSuggested =
    lines.length > 0
      ? suggestRoiFromLayoutEvidence({
          lines,
          selectionRows,
          hasChecklist,
          layoutAvailable: true,
          textTruth,
        }).map(r => ({
          ...r,
          source: "text-layer",
          why: r.why.replace(/Azure geometry/gi, "Text-layer geometry"),
        }))
      : [];

  const grounded = proposeRoiFromGroundedFields(groundedFields, pageLayouts);
  const merged = mergePreferGrounded(grounded, layoutSuggested);

  // Prefer empty over a single oversized blob (PX-105)
  const filtered = filterOversizedProposedRegions(merged);
  if (filtered.length <= 1 && merged.length > 0) {
    const only = filtered[0];
    if (
      !only ||
      only.bounds.width * only.bounds.height >= 0.2 ||
      only.name === "header"
    ) {
      // Keep grounded field boxes even if layout path collapsed
      const groundedOnly = filterOversizedProposedRegions(grounded);
      if (groundedOnly.length >= 2) return groundedOnly;
      if (groundedOnly.length === 0) return [];
    }
  }

  return filtered;
}

export function textLayerGeometryAvailable(
  pageLayouts: EmbeddedPdfPageLayout[] | null | undefined
): boolean {
  if (!pageLayouts?.length) return false;
  return pageLayouts.some(p => (p.words?.length ?? 0) >= 4);
}
