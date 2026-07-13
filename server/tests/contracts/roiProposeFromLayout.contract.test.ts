import { describe, it, expect } from "vitest";
import { suggestRoiFromLayoutEvidence } from "../../services/templateStudio/roiProposeFromLayout";

describe("suggestRoiFromLayoutEvidence (precision-first)", () => {
  const sampleLines = [
    {
      pageNumber: 1,
      content: "Job Summary Report",
      xPercent: 10,
      yPercent: 4,
      widthPercent: 40,
      heightPercent: 2,
    },
    {
      pageNumber: 1,
      content: "Asset Details",
      xPercent: 8,
      yPercent: 18,
      widthPercent: 20,
      heightPercent: 1.5,
    },
    {
      pageNumber: 1,
      content: "Asset No",
      xPercent: 8,
      yPercent: 22,
      widthPercent: 10,
      heightPercent: 1.4,
    },
    {
      pageNumber: 1,
      content: "Make/Model",
      xPercent: 8,
      yPercent: 26,
      widthPercent: 12,
      heightPercent: 1.4,
    },
    {
      pageNumber: 1,
      content: "Site Address",
      xPercent: 8,
      yPercent: 30,
      widthPercent: 14,
      heightPercent: 1.4,
    },
    {
      pageNumber: 1,
      content: "Date:",
      xPercent: 8,
      yPercent: 55,
      widthPercent: 8,
      heightPercent: 1.4,
    },
    {
      pageNumber: 1,
      content: "Job ID",
      xPercent: 55,
      yPercent: 78,
      widthPercent: 8,
      heightPercent: 1.4,
    },
  ];

  it("places Job Reference on Job ID with a tight row box", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: sampleLines,
    });

    const job = regions.find(r => r.name === "jobReference");
    expect(job).toBeTruthy();
    expect(job!.source).toBe("ocr-layout");
    expect(job!.bounds.y).toBeGreaterThan(0.7);
    expect(job!.bounds.height).toBeLessThanOrEqual(0.04);
    expect(job!.bounds.width).toBeLessThanOrEqual(0.42);
  });

  it("does NOT match Asset Details as Asset ID", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: sampleLines,
    });

    const asset = regions.find(r => r.name === "assetId");
    expect(asset).toBeTruthy();
    expect(asset!.why.toLowerCase()).toContain("asset no");
    expect(asset!.why.toLowerCase()).not.toContain("asset details");
    expect(asset!.bounds.height).toBeLessThanOrEqual(0.04);
    // Near Asset No row (~22%), not a tall blob
    expect(asset!.bounds.y).toBeGreaterThan(0.15);
    expect(asset!.bounds.y).toBeLessThan(0.35);
  });

  it("keeps Site Address as a single-row capture, not a page-tall block", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: sampleLines,
    });

    const site = regions.find(r => r.name === "siteAddress");
    expect(site).toBeTruthy();
    expect(site!.bounds.height).toBeLessThanOrEqual(0.04);
    expect(site!.bounds.width).toBeLessThanOrEqual(0.42);
  });

  it("rejects section-header false positives", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: [
        {
          pageNumber: 1,
          content: "Asset Details",
          xPercent: 10,
          yPercent: 20,
          widthPercent: 20,
          heightPercent: 2,
        },
        {
          pageNumber: 1,
          content: "Completion Details",
          xPercent: 10,
          yPercent: 50,
          widthPercent: 25,
          heightPercent: 2,
        },
      ],
    });
    expect(regions.find(r => r.name === "assetId")).toBeUndefined();
  });

  it("announces generic fallback when OCR layout is unavailable", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: false,
      hasChecklist: true,
      selectionRows: [],
      lines: [],
    });
    expect(regions.every(r => r.source === "starter-roi-fallback")).toBe(true);
  });
});
