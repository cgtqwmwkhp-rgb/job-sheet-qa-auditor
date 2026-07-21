import { describe, it, expect } from "vitest";
import type { EmbeddedPdfPageLayout } from "../../services/embeddedPdfText";
import type { GroundedTextLayerField } from "../../services/textLayerExtraction/types";
import {
  clusterWordsIntoLayoutLines,
  pdfWordToLayoutPercents,
  proposeRoiFromGroundedFields,
  suggestRoiFromTextLayerEvidence,
} from "../../services/templateStudio/roiProposeFromTextLayer";
import {
  assessRoiQuality,
  filterOversizedProposedRegions,
} from "../../services/templateStudio/roiQualityGates";

/** Synthetic A4 page with Job Summary-like labels (PDF user space, origin BL). */
function samplePageLayout(): EmbeddedPdfPageLayout {
  const pageW = 595;
  const pageH = 842;
  const mk = (text: string, x: number, yFromTop: number, w = 40, h = 10) => ({
    text,
    page: 1,
    x,
    y: pageH - yFromTop - h,
    width: w,
    height: h,
  });

  return {
    pageNumber: 1,
    text: "Job Summary Report Asset No DV23TRL Job ID 793 Date 15/01/2024",
    width: pageW,
    height: pageH,
    words: [
      mk("Job", 40, 30, 25),
      mk("Summary", 70, 30, 55),
      mk("Report", 130, 30, 45),
      mk("Asset", 40, 120, 35),
      mk("No", 80, 120, 20),
      mk("DV23TRL", 120, 120, 55),
      mk("Job", 40, 160, 25),
      mk("ID", 70, 160, 18),
      mk("793", 100, 160, 30),
      mk("Date", 400, 40, 30),
      mk("15/01/2024", 440, 40, 70),
      mk("Make/Model", 40, 200, 70),
      mk("Trailer", 120, 200, 45),
    ],
  };
}

describe("roiProposeFromTextLayer (PX-105)", () => {
  it("converts PDF bottom-left words to top-left percent coords", () => {
    const pct = pdfWordToLayoutPercents(
      { text: "X", page: 1, x: 0, y: 0, width: 59.5, height: 8.42 },
      595,
      842
    );
    expect(pct.xPercent).toBeCloseTo(0, 0);
    expect(pct.widthPercent).toBeCloseTo(10, 0);
    // y≈0 in PDF → near bottom → high yPercent
    expect(pct.yPercent).toBeGreaterThan(90);
  });

  it("clusters words into short label lines (not page-wide bands)", () => {
    const lines = clusterWordsIntoLayoutLines([samplePageLayout()]);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.every(l => (l.widthPercent ?? 0) <= 72)).toBe(true);
    expect(lines.some(l => /asset\s*no/i.test(l.content))).toBe(true);
    expect(lines.some(l => /job\s*id/i.test(l.content))).toBe(true);
  });

  it("places multiple tight field ROIs from text-layer geometry", () => {
    const regions = suggestRoiFromTextLayerEvidence({
      pageLayouts: [samplePageLayout()],
      textTruth:
        "Job Summary Report\nAsset No DV23TRL\nJob ID 793\nDate 15/01/2024\nMake/Model Trailer",
    });

    expect(regions.length).toBeGreaterThanOrEqual(3);
    const asset = regions.find(r => r.name === "assetId");
    const job = regions.find(r => r.name === "jobReference");
    const date = regions.find(r => r.name === "date");
    expect(asset?.source).toBe("text-layer");
    expect(job?.source).toBe("text-layer");
    expect(date?.source).toBe("text-layer");
    for (const r of [asset, job, date]) {
      expect(r!.bounds.height).toBeLessThanOrEqual(0.08);
      expect(r!.bounds.width).toBeLessThanOrEqual(0.55);
      expect(r!.bounds.width * r!.bounds.height).toBeLessThan(0.12);
    }
  });

  it("prefers grounded label-anchor boxes when provided", () => {
    const grounded: GroundedTextLayerField[] = [
      {
        fieldId: "assetId",
        value: "DV23TRL",
        page: 1,
        bbox: { page: 1, x: 120, y: 842 - 130, width: 55, height: 10 },
        source: "text_layer",
        confidence: 0.98,
        label: "Asset No",
      },
      {
        fieldId: "jobReference",
        value: "793",
        page: 1,
        bbox: { page: 1, x: 100, y: 842 - 170, width: 30, height: 10 },
        source: "text_layer",
        confidence: 0.98,
        label: "Job ID",
      },
      {
        fieldId: "date",
        value: "15/01/2024",
        page: 1,
        bbox: { page: 1, x: 440, y: 842 - 50, width: 70, height: 10 },
        source: "text_layer",
        confidence: 0.98,
        label: "Date",
      },
    ];
    const fromGrounded = proposeRoiFromGroundedFields(grounded, [
      samplePageLayout(),
    ]);
    expect(fromGrounded).toHaveLength(3);
    expect(fromGrounded.every(r => r.source === "text-layer")).toBe(true);
    expect(fromGrounded.every(r => r.bounds.height <= 0.04)).toBe(true);
  });

  it("rejects a single oversized page blob (PX-105)", () => {
    const filtered = filterOversizedProposedRegions([
      {
        name: "assetId",
        page: 1,
        bounds: { x: 0.05, y: 0.1, width: 0.9, height: 0.7 },
        confidence: 0.9,
        source: "ocr-layout",
        why: "bad blob",
        accepted: true,
      },
    ]);
    expect(filtered).toEqual([]);

    const issues = assessRoiQuality([
      {
        name: "header",
        bounds: { x: 0.05, y: 0.05, width: 0.9, height: 0.8 },
      },
    ]);
    expect(issues.some(i => i.code === "SINGLE_PAGE_BLOB")).toBe(true);
    expect(issues.some(i => i.code === "OVERSIZED_STRUCTURAL_ROI")).toBe(true);
  });

  it("returns empty when no word geometry exists", () => {
    const regions = suggestRoiFromTextLayerEvidence({
      pageLayouts: [{ pageNumber: 1, text: "", words: [] }],
    });
    expect(regions).toEqual([]);
  });
});
