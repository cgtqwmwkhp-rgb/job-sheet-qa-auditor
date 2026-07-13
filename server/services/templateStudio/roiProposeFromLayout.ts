/**
 * Place ROI boxes from Azure DI layout geometry (OCR evidence), not generic scaffolds.
 * Bounds are normalized 0–1 for Template Studio / registry.
 */

import type { AzureTextLine } from "../ocrAdapter/parseAzureDiResponse";
import type { SelectionMarkRow } from "../selectionMarks";
import { createStudioStarterRoi } from "./starterDraft";

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

const FIELD_LABEL_MATCHERS: Array<{
  name: string;
  fields: string[];
  re: RegExp;
  /** How to expand the OCR line into a capture box */
  expand: "labelValueRight" | "labelValueBelow" | "signature" | "block";
}> = [
  {
    name: "jobReference",
    fields: ["jobReference"],
    re: /job\s*(id|no|number|ref|reference)|work\s*order|\bwo\b/i,
    expand: "labelValueRight",
  },
  {
    name: "assetId",
    fields: ["assetId"],
    re: /asset(\s*(id|no|number))?|serial\s*(no|number)?|plant\s*no|equipment/i,
    expand: "labelValueRight",
  },
  {
    name: "date",
    fields: ["date"],
    // Prefer job/service date labels; avoid matching "valid until" etc.
    re: /^(?!.*expir).*(\bdate\b|service\s*date|visit\s*date|completed\s*on)/i,
    expand: "labelValueRight",
  },
  {
    name: "expiryDate",
    fields: ["expiryDate"],
    re: /expir|valid\s*until|next\s*due|retest/i,
    expand: "labelValueRight",
  },
  {
    name: "engineerSignature",
    fields: ["engineerSignOff"],
    re: /engineer\s*(sign|sig|name)|technician\s*(sign|sig)|operative/i,
    expand: "signature",
  },
  {
    name: "customerSignature",
    fields: ["customerSignature"],
    re: /customer\s*(sign|sig|name)|client\s*(sign|sig)/i,
    expand: "signature",
  },
  {
    name: "workDescription",
    fields: ["workDescription"],
    re: /work\s*description|comments|findings|details\s*of\s*work|scope/i,
    expand: "labelValueBelow",
  },
  {
    name: "makeModel",
    fields: ["makeModel"],
    re: /make\s*\/?\s*model|\bmake\b|\bmodel\b/i,
    expand: "labelValueRight",
  },
  {
    name: "customerName",
    fields: ["customerName"],
    re: /^customer$|customer\s*name|client\s*name|account\s*name/i,
    expand: "labelValueRight",
  },
  {
    name: "siteAddress",
    fields: ["siteAddress"],
    re: /site\s*address|site\s*location|\baddress\b/i,
    expand: "labelValueBelow",
  },
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function lineBox01(line: LayoutLineForRoi): {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
} {
  const wPct = line.widthPercent ?? 18;
  const hPct = line.heightPercent ?? 1.8;
  const x = clamp01(line.xPercent / 100);
  const height = clamp01(Math.max(0.012, hPct / 100));
  // yPercent is vertical center → convert to top
  const yCenter = line.yPercent / 100;
  const y = clamp01(yCenter - height / 2);
  const width = clamp01(Math.max(0.04, wPct / 100));
  return { x, y, width, height, page: line.pageNumber || 1 };
}

function expandCapture(
  line: LayoutLineForRoi,
  mode: (typeof FIELD_LABEL_MATCHERS)[number]["expand"]
): { x: number; y: number; width: number; height: number; page: number } {
  const base = lineBox01(line);
  if (mode === "labelValueRight") {
    // Printed label + value to the right (typical Job ID: … layout)
    const width = clamp01(
      Math.max(base.width + 0.2, Math.min(0.48, 1 - base.x - 0.02))
    );
    const height = clamp01(Math.max(base.height * 1.6, 0.028));
    return {
      page: base.page,
      x: base.x,
      y: clamp01(base.y - height * 0.15),
      width,
      height,
    };
  }
  if (mode === "labelValueBelow") {
    return {
      page: base.page,
      x: clamp01(Math.max(0.04, base.x - 0.01)),
      y: base.y,
      width: clamp01(Math.max(0.55, Math.min(0.92, 1 - base.x - 0.04))),
      height: clamp01(Math.max(0.08, base.height * 6)),
    };
  }
  if (mode === "signature") {
    return {
      page: base.page,
      x: clamp01(Math.max(0.02, base.x - 0.02)),
      y: base.y,
      width: clamp01(Math.max(0.35, Math.min(0.48, base.width + 0.28))),
      height: clamp01(Math.max(0.07, base.height * 4)),
    };
  }
  return base;
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

function pickBestLine(
  lines: LayoutLineForRoi[],
  re: RegExp
): LayoutLineForRoi | null {
  const hits = lines.filter(l => re.test(l.content));
  if (hits.length === 0) return null;
  // Prefer shorter lines (field labels) over long paragraph hits
  hits.sort((a, b) => a.content.length - b.content.length);
  return hits[0];
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
 * When layout evidence exists, does NOT dump the generic starter grid.
 */
export function suggestRoiFromLayoutEvidence(input: {
  lines: LayoutLineForRoi[];
  selectionRows: SelectionMarkRow[];
  hasChecklist: boolean;
  layoutAvailable: boolean;
}): ProposedRoiRegion[] {
  const { lines, selectionRows, hasChecklist, layoutAvailable } = input;
  const regions: ProposedRoiRegion[] = [];
  const usedNames = new Set<string>();

  if (layoutAvailable && lines.length > 0) {
    // Header: union of top-of-page lines (branding / title band)
    const topLines = lines.filter(l => l.yPercent <= 12);
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
            x: 0.02,
            y: clamp01(union.y - 0.005),
            width: 0.96,
            height: clamp01(Math.max(0.06, union.height + 0.02)),
          },
          confidence: 0.8,
          source: "ocr-layout",
          why: `OCR top-of-page band (${topLines.length} lines)`,
          accepted: true,
        });
        usedNames.add("header");
      }
    }

    for (const matcher of FIELD_LABEL_MATCHERS) {
      if (usedNames.has(matcher.name)) continue;
      const line = pickBestLine(lines, matcher.re);
      if (!line) continue;
      const bounds = expandCapture(line, matcher.expand);
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
        confidence: 0.88,
        source: "ocr-layout",
        why: `OCR line matched /${matcher.re.source}/ at ~${line.yPercent.toFixed(0)}% page: “${line.content.slice(0, 60)}”`,
        accepted: true,
      });
      usedNames.add(matcher.name);
    }

    if (hasChecklist) {
      const markBoxes = selectionRows
        .map(r => r.bbox)
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map(b => ({
          x: b.x / 100,
          y: b.y / 100,
          width: b.width / 100,
          height: b.height / 100,
        }));
      const headerLine = pickBestLine(
        lines,
        /\bok\b.*\badv\b|\bok\b[\s|/]+adv[\s|/]+fail/i
      );
      let tickBounds = unionBoxes(markBoxes);
      if (headerLine) {
        const hb = expandCapture(headerLine, "labelValueBelow");
        const headerBox = {
          x: 0.04,
          y: hb.y,
          width: 0.92,
          height: clamp01(Math.max(0.25, hb.height + 0.2)),
        };
        tickBounds = unionBoxes(
          tickBounds ? [tickBounds, headerBox] : [headerBox]
        );
      }
      if (tickBounds) {
        // Pad to include requirement text column on the left
        const padded = {
          x: clamp01(Math.min(0.04, tickBounds.x - 0.12)),
          y: clamp01(tickBounds.y - 0.02),
          width: clamp01(
            Math.max(0.7, tickBounds.width + (tickBounds.x - 0.04) + 0.04)
          ),
          height: clamp01(Math.max(0.2, tickBounds.height + 0.04)),
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
              ? `Checklist geometry from ${markBoxes.length} selection marks + OCR headers`
              : "Checklist headers detected in OCR layout",
          accepted: true,
        });
        usedNames.add("tickboxBlock");
      }
    }

    // Combined signature block if both parties found close together
    const eng = regions.find(r => r.name === "engineerSignature");
    const cust = regions.find(r => r.name === "customerSignature");
    if (eng && cust) {
      const union = unionBoxes([eng.bounds, cust.bounds]);
      if (union) {
        regions.push({
          name: "signatureBlock",
          page: eng.page,
          bounds: {
            x: clamp01(union.x - 0.01),
            y: clamp01(union.y - 0.01),
            width: clamp01(union.width + 0.02),
            height: clamp01(union.height + 0.02),
          },
          fields: ["engineerSignOff", "customerSignature"],
          confidence: 0.85,
          source: "ocr-layout",
          why: "Union of engineer + customer signature OCR hits",
          accepted: true,
        });
        usedNames.add("signatureBlock");
      }
    }

    return regions;
  }

  // No layout geometry — explicit generic fallback (must be announced loudly in UI)
  const starter = createStudioStarterRoi();
  return starter.regions.map(r => ({
    ...r,
    fields: r.fields ?? fieldsForRoiName(r.name),
    confidence: 0.25,
    source: "starter-roi-fallback",
    why: "NO OCR GEOMETRY — generic scaffold only. Draw/resize onto the real printed fields before Save.",
    accepted: true,
  }));
}
