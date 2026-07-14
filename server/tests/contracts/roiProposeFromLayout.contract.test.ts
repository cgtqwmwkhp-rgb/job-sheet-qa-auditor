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

  it("returns empty ROI (not a generic scaffold) when OCR layout is unavailable", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: false,
      hasChecklist: true,
      selectionRows: [],
      lines: [],
    });
    expect(regions).toEqual([]);
  });

  it("places Completion Details Yes/No and checklist-related labels from OCR lines", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: true,
      selectionRows: [],
      lines: [
        {
          pageNumber: 1,
          content: "All Works Completed? No",
          xPercent: 8,
          yPercent: 30,
          widthPercent: 28,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Return Visit Needed? Yes",
          xPercent: 50,
          yPercent: 34,
          widthPercent: 28,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Asset Safe To Use? No",
          xPercent: 50,
          yPercent: 38,
          widthPercent: 26,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Compliance Type: Service - SB",
          xPercent: 50,
          yPercent: 22,
          widthPercent: 30,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Job Duration: 2.3",
          xPercent: 8,
          yPercent: 50,
          widthPercent: 18,
          heightPercent: 1.4,
        },
      ],
    });

    expect(regions.find(r => r.name === "allWorksCompleted")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "returnVisitNeeded")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "assetSafeToUse")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "complianceType")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "jobDuration")?.source).toBe(
      "ocr-layout"
    );
  });

  it("places tyre tread, wheel pressure, and nut torque measurement ROIs", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: [
        {
          pageNumber: 1,
          content: "OSF Tyre Tread Depth: 6mm",
          xPercent: 8,
          yPercent: 40,
          widthPercent: 35,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Tyre Size and Set Pressure: Size: 195/50R13C PSI: 95",
          xPercent: 8,
          yPercent: 55,
          widthPercent: 55,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Wheel Nut Torque (NM): 115",
          xPercent: 8,
          yPercent: 70,
          widthPercent: 30,
          heightPercent: 1.4,
        },
        {
          pageNumber: 1,
          content: "Hub Nut Torque: (NM): 280",
          xPercent: 8,
          yPercent: 74,
          widthPercent: 30,
          heightPercent: 1.4,
        },
      ],
    });

    expect(regions.find(r => r.name === "tyreTreadDepth")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "wheelPressures")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "wheelNutTorque")?.source).toBe(
      "ocr-layout"
    );
    expect(regions.find(r => r.name === "hubNutTorque")?.source).toBe(
      "ocr-layout"
    );
  });
});
