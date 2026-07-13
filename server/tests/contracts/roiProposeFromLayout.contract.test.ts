import { describe, it, expect } from "vitest";
import { suggestRoiFromLayoutEvidence } from "../../services/templateStudio/roiProposeFromLayout";

describe("suggestRoiFromLayoutEvidence", () => {
  it("places Job Reference on OCR Job ID geometry — not a generic scaffold", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: false,
      selectionRows: [],
      lines: [
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
          content: "Job ID",
          xPercent: 55,
          yPercent: 78,
          widthPercent: 8,
          heightPercent: 1.5,
        },
        {
          pageNumber: 1,
          content: "Asset No",
          xPercent: 8,
          yPercent: 22,
          widthPercent: 10,
          heightPercent: 1.5,
        },
      ],
    });

    expect(regions.every(r => r.source === "ocr-layout")).toBe(true);
    expect(regions.some(r => r.source === "starter-roi-fallback")).toBe(false);

    const job = regions.find(r => r.name === "jobReference");
    expect(job).toBeTruthy();
    expect(job!.bounds.y).toBeGreaterThan(0.6);
    expect(job!.why.toLowerCase()).toContain("job id");

    const asset = regions.find(r => r.name === "assetId");
    expect(asset).toBeTruthy();
    expect(asset!.bounds.y).toBeLessThan(0.4);
  });

  it("announces generic fallback when OCR layout is unavailable", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: false,
      hasChecklist: true,
      selectionRows: [],
      lines: [],
    });
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every(r => r.source === "starter-roi-fallback")).toBe(true);
    expect(regions[0].why.toLowerCase()).toMatch(/no ocr|generic/);
  });

  it("builds tickboxBlock from selection-mark geometry", () => {
    const regions = suggestRoiFromLayoutEvidence({
      layoutAvailable: true,
      hasChecklist: true,
      selectionRows: [
        {
          rowIndex: 0,
          pageNumber: 1,
          label: "Tyres",
          choice: "Ok",
          confidence: 90,
          selectedCount: 1,
          markCount: 4,
          bbox: {
            x: 70,
            y: 40,
            width: 5,
            height: 3,
            coordinateSpace: "percent",
          },
        },
        {
          rowIndex: 1,
          pageNumber: 1,
          label: "Lights",
          choice: "Fail",
          confidence: 90,
          selectedCount: 1,
          markCount: 4,
          bbox: {
            x: 70,
            y: 50,
            width: 5,
            height: 3,
            coordinateSpace: "percent",
          },
        },
      ],
      lines: [
        {
          pageNumber: 1,
          content: "Ok Adv Fail N/A",
          xPercent: 60,
          yPercent: 35,
          widthPercent: 30,
          heightPercent: 2,
        },
      ],
    });
    const tick = regions.find(r => r.name === "tickboxBlock");
    expect(tick).toBeTruthy();
    expect(tick!.source).toBe("ocr-layout");
    expect(tick!.bounds.height).toBeGreaterThan(0.1);
  });
});
