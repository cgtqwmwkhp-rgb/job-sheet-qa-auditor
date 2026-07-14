/**
 * Place ROI boxes from Azure DI layout geometry — precision-first.
 *
 * Rules:
 * - Match field LABELS only (reject section headers like "Asset Details")
 * - Prefer short label lines; expand tightly on the SAME ROW (label + value)
 * - Hard-cap box size — never paint a quarter-page blob
 * - Fewer accurate boxes beat many wrong ones
 */

import type { AzureTextLine } from "../ocrAdapter/parseAzureDiResponse";
import type { SelectionMarkRow } from "../selectionMarks";
// createStudioStarterRoi intentionally NOT used — never invent scaffold positions

export interface ProposedRoiRegion {
  name: string;
  page: number;
  bounds: { x: number; y: number; width: number; height: number };
  fields?: string[];
  confidence: number;
  source: string;
  why: string;
  accepted?: boolean;
}

export type LayoutLineForRoi = Pick<
  AzureTextLine,
  | "pageNumber"
  | "content"
  | "xPercent"
  | "yPercent"
  | "widthPercent"
  | "heightPercent"
>;

const SECTION_HEADER_RE =
  /\b(details|summary|section|checklist|report|completion|requirements)\b/i;

/** Max normalized height for a single field row capture */
const MAX_ROW_H = 0.038;
/** Max normalized width for label+value on one row */
const MAX_ROW_W = 0.42;
/** Max height for multi-line blocks (work description / address block) */
const MAX_BLOCK_H = 0.11;
const MAX_BLOCK_W = 0.48;

const FIELD_LABEL_MATCHERS: Array<{
  name: string;
  fields: string[];
  /** Must match the label line */
  re: RegExp;
  /** Lines matching this are rejected even if `re` hits */
  reject?: RegExp;
  expand: "rowRight" | "blockBelow" | "signature";
}> = [
  {
    name: "jobReference",
    fields: ["jobReference"],
    re: /^(job\s*(id|no\.?|number|ref\.?|reference)|work\s*order|w\.?o\.?\s*#?)\b\s*:?\s*.{0,40}$/i,
    reject: SECTION_HEADER_RE,
    expand: "rowRight",
  },
  {
    name: "assetId",
    fields: ["assetId"],
    // Require No/ID/Number — do NOT match "Asset Details"
    re: /^(asset\s*(no\.?|id|number)|plant\s*no\.?|equipment\s*(no\.?|id)|serial\s*(no\.?|number)|s\/?n)\b\s*:?\s*.{0,40}$/i,
    reject: SECTION_HEADER_RE,
    expand: "rowRight",
  },
  {
    name: "date",
    fields: ["date"],
    re: /^(date|service\s*date|visit\s*date|job\s*date)\b\s*:?\s*.{0,40}$/i,
    reject: /next\s*service|expir|due|retest/i,
    expand: "rowRight",
  },
  {
    name: "expiryDate",
    fields: ["expiryDate"],
    re: /^(expir(y|es|ation)?(\s*date)?|valid\s*until|next\s*(due|service\s*date)|retest(\s*due)?)\b\s*:?\s*.{0,40}$/i,
    expand: "rowRight",
  },
  {
    name: "makeModel",
    fields: ["makeModel"],
    re: /^(make\s*\/?\s*model|make\s*and\s*model)\b\s*:?\s*.{0,50}$/i,
    reject: SECTION_HEADER_RE,
    expand: "rowRight",
  },
  {
    name: "customerName",
    fields: ["customerName"],
    re: /^(customer|customer\s*name|client|client\s*name|account\s*name)\b\s*:?\s*.{0,50}$/i,
    reject: /sign|signature|details/i,
    expand: "rowRight",
  },
  {
    name: "siteAddress",
    fields: ["siteAddress"],
    re: /^(site\s*address|site\s*location|address)\b\s*:?\s*.{0,80}$/i,
    reject: SECTION_HEADER_RE,
    expand: "rowRight",
  },
  {
    name: "engineerSignature",
    fields: ["engineerSignOff"],
    re: /^(engineer|technician|operative)(\s*(sign(ature)?|name|sign\s*-?\s*off))?\b\s*:?\s*.{0,40}$/i,
    expand: "signature",
  },
  {
    name: "customerSignature",
    fields: ["customerSignature"],
    re: /^(customer|client)(\s*(sign(ature)?|name|sign\s*-?\s*off))\b\s*:?\s*.{0,40}$/i,
    expand: "signature",
  },
  {
    name: "workDescription",
    fields: ["workDescription"],
    re: /^(work\s*description|comments|findings|details\s*of\s*work|scope\s*of\s*work)\b\s*:?\s*.{0,40}$/i,
    expand: "blockBelow",
  },
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeLabel(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function lineBox01(line: LayoutLineForRoi): {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
} {
  const wPct = line.widthPercent ?? 12;
  const hPct = line.heightPercent ?? 1.4;
  const x = clamp01(line.xPercent / 100);
  const height = clamp01(Math.max(0.01, Math.min(MAX_ROW_H, hPct / 100)));
  const yCenter = line.yPercent / 100;
  const y = clamp01(yCenter - height / 2);
  const width = clamp01(Math.max(0.03, Math.min(0.35, wPct / 100)));
  return { x, y, width, height, page: line.pageNumber || 1 };
}

/**
 * Tight capture: printed label + value on the same row.
 * Width extends right of the label but stays within one table cell band.
 */
function expandCapture(
  line: LayoutLineForRoi,
  mode: (typeof FIELD_LABEL_MATCHERS)[number]["expand"]
): { x: number; y: number; width: number; height: number; page: number } {
  const base = lineBox01(line);

  if (mode === "rowRight") {
    // Typical 2-col table: label ~left half of cell group, value to the right
    const valuePad = 0.22;
    const width = clamp01(
      Math.min(MAX_ROW_W, Math.max(base.width + valuePad, 0.2), 1 - base.x - 0.02)
    );
    const height = clamp01(
      Math.min(MAX_ROW_H, Math.max(base.height * 1.35, 0.018))
    );
    return {
      page: base.page,
      x: base.x,
      y: clamp01(base.y - (height - base.height) * 0.25),
      width,
      height,
    };
  }

  if (mode === "blockBelow") {
    return {
      page: base.page,
      x: base.x,
      y: base.y,
      width: clamp01(Math.min(MAX_BLOCK_W, Math.max(0.4, 0.92 - base.x))),
      height: clamp01(Math.min(MAX_BLOCK_H, Math.max(0.06, base.height * 4))),
    };
  }

  // signature
  return {
    page: base.page,
    x: clamp01(Math.max(0.02, base.x - 0.01)),
    y: base.y,
    width: clamp01(Math.min(0.4, Math.max(0.28, base.width + 0.2))),
    height: clamp01(Math.min(0.09, Math.max(0.05, base.height * 3))),
  };
}

function unionBoxes(
  boxes: Array<{ x: number; y: number; width: number; height: number }>
): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: clamp01(minX),
    y: clamp01(minY),
    width: clamp01(Math.max(0.02, maxX - minX)),
    height: clamp01(Math.max(0.02, maxY - minY)),
  };
}

function overlapRatio(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  return areaA > 0 ? inter / areaA : 0;
}

/**
 * Score label-line candidates. Higher = better field label.
 * Rejects section headers and long prose.
 */
function scoreLabelLine(
  line: LayoutLineForRoi,
  re: RegExp,
  reject?: RegExp
): number {
  const text = normalizeLabel(line.content);
  if (!re.test(text)) return -1;
  if (reject?.test(text)) return -1;
  if (SECTION_HEADER_RE.test(text) && text.split(/\s+/).length <= 3) {
    // "Asset Details", "Completion Details"
    return -1;
  }
  if (text.length > 48) return -1;

  let score = 100;
  // Prefer short labels
  score -= text.length;
  // Prefer lines that look like form labels (optional trailing colon)
  if (/:\s*$/.test(text)) score += 15;
  // Prefer mid-page field rows over header chrome
  if (line.yPercent < 8) score -= 25;
  if (line.yPercent > 92) score -= 10;
  // Prefer left-column labels (common on this form)
  if (line.xPercent < 45) score += 8;
  return score;
}

function pickBestLine(
  lines: LayoutLineForRoi[],
  re: RegExp,
  reject?: RegExp
): LayoutLineForRoi | null {
  let best: LayoutLineForRoi | null = null;
  let bestScore = -1;
  for (const line of lines) {
    const score = scoreLabelLine(line, re, reject);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function fieldsForRoiName(name: string): string[] {
  if (name === "tickboxBlock") return ["complianceTickboxes"];
  if (name === "signatureBlock") {
    return ["engineerSignOff", "customerSignature"];
  }
  if (name === "engineerSignature") return ["engineerSignOff"];
  const m = FIELD_LABEL_MATCHERS.find(f => f.name === name);
  return m?.fields ?? [name];
}

/**
 * Build ROI regions from OCR line geometry + selection marks.
 * Precision over coverage: skip a field rather than paint a wrong blob.
 * NEVER returns the generic starter scaffold — empty array if no geometry.
 */
export function suggestRoiFromLayoutEvidence(input: {
  lines: LayoutLineForRoi[];
  selectionRows: SelectionMarkRow[];
  hasChecklist: boolean;
  layoutAvailable: boolean;
}): ProposedRoiRegion[] {
  const { lines, selectionRows, hasChecklist, layoutAvailable } = input;
  const regions: ProposedRoiRegion[] = [];

  if (!layoutAvailable || lines.length === 0) {
    // Callers must surface layoutError — do not invent positions.
    return [];
  }

  // Header: tight top band from lines in the top ~10% only
  const topLines = lines.filter(l => l.yPercent <= 10);
    if (topLines.length > 0) {
      const boxes = topLines.map(l => {
        const b = lineBox01(l);
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      const union = unionBoxes(boxes);
      if (union) {
        regions.push({
          name: "header",
          page: topLines[0].pageNumber || 1,
          bounds: {
            x: 0.03,
            y: clamp01(Math.max(0, union.y - 0.005)),
            width: 0.94,
            height: clamp01(Math.min(0.12, Math.max(0.05, union.height + 0.015))),
          },
          confidence: 0.85,
          source: "ocr-layout",
          why: `OCR header band from ${topLines.length} top-of-page lines`,
          accepted: true,
        });
      }
    }

    for (const matcher of FIELD_LABEL_MATCHERS) {
      const line = pickBestLine(lines, matcher.re, matcher.reject);
      if (!line) continue;
      const bounds = expandCapture(line, matcher.expand);

      // Skip if this box heavily overlaps an already-accepted region
      const heavyOverlap = regions.some(
        r => overlapRatio(bounds, r.bounds) > 0.45 || overlapRatio(r.bounds, bounds) > 0.45
      );
      if (heavyOverlap) continue;

      regions.push({
        name: matcher.name,
        page: bounds.page,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        fields: matcher.fields,
        confidence: 0.9,
        source: "ocr-layout",
        why: `Tight OCR match on “${normalizeLabel(line.content).slice(0, 40)}” @ ${line.yPercent.toFixed(0)}% page`,
        accepted: true,
      });
    }

    if (hasChecklist) {
      const markBoxes = selectionRows
        .map(r => r.bbox)
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map(b => ({
          x: b.x / 100,
          y: b.y / 100,
          width: Math.max(0.01, b.width / 100),
          height: Math.max(0.01, b.height / 100),
        }));
      const headerLine = pickBestLine(
        lines,
        /^(ok|adv|fail|n\/?a)(\s+[|/]?\s*(ok|adv|fail|n\/?a)){2,}\s*$/i
      );
      let tickBounds = unionBoxes(markBoxes);
      if (headerLine) {
        const hb = lineBox01(headerLine);
        const headerBox = {
          x: clamp01(Math.min(0.05, hb.x)),
          y: hb.y,
          width: clamp01(Math.max(0.55, 0.9 - hb.x)),
          height: clamp01(Math.min(0.35, Math.max(0.12, markBoxes.length * 0.025 + 0.04))),
        };
        tickBounds = unionBoxes(
          tickBounds ? [tickBounds, headerBox] : [headerBox]
        );
      }
      if (tickBounds && tickBounds.height <= 0.45) {
        const padded = {
          x: clamp01(Math.max(0.03, tickBounds.x - 0.2)),
          y: clamp01(tickBounds.y - 0.015),
          width: clamp01(Math.min(0.94, tickBounds.width + 0.22)),
          height: clamp01(Math.min(0.42, tickBounds.height + 0.03)),
        };
        regions.push({
          name: "tickboxBlock",
          page: selectionRows[0]?.pageNumber || headerLine?.pageNumber || 1,
          bounds: padded,
          fields: ["complianceTickboxes"],
          confidence: 0.9,
          source: "ocr-layout",
          why:
            markBoxes.length > 0
              ? `Checklist from ${markBoxes.length} selection marks (capped height)`
              : "Checklist column headers in OCR",
          accepted: true,
        });
      }
    }

    const eng = regions.find(r => r.name === "engineerSignature");
    const cust = regions.find(r => r.name === "customerSignature");
    if (eng && cust) {
      const union = unionBoxes([eng.bounds, cust.bounds]);
      if (union && union.height <= 0.14) {
        regions.push({
          name: "signatureBlock",
          page: eng.page,
          bounds: {
            x: clamp01(union.x - 0.01),
            y: clamp01(union.y - 0.01),
            width: clamp01(Math.min(0.94, union.width + 0.02)),
            height: clamp01(Math.min(0.12, union.height + 0.02)),
          },
          fields: ["engineerSignOff", "customerSignature"],
          confidence: 0.85,
          source: "ocr-layout",
          why: "Union of engineer + customer signature OCR hits",
          accepted: true,
        });
      }
    }

  return regions;
}
