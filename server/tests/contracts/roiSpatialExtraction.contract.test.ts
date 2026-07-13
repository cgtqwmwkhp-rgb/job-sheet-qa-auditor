import { describe, it, expect } from "vitest";
import {
  extractFieldsFromRoiSpatial,
  lineInRoi,
  markCenterInRoi,
  mergeRoiSpatialFields,
  parseValueFromRegionText,
  pointInPercentRect,
  roiBoundsToPercent,
} from "../../services/roiSpatialExtraction";
import type { AzureSelectionMark, AzureTextLine } from "../../services/ocrAdapter/parseAzureDiResponse";
import type { RoiConfig } from "../../services/templateRegistry/types";

describe("roiSpatialExtraction", () => {
  const roi: RoiConfig = {
    regions: [
      {
        name: "assetId",
        page: 1,
        bounds: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 },
        fields: ["assetId"],
      },
      {
        name: "tickboxBlock",
        page: 1,
        bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.4 },
        fields: ["complianceTickboxes"],
      },
      {
        name: "Wheel_Nut_Torque",
        page: 1,
        bounds: { x: 0.1, y: 0.75, width: 0.5, height: 0.06 },
        fields: ["Wheel_Nut_Torque"],
      },
    ],
  };

  it("converts 0–1 ROI bounds to percent", () => {
    expect(roiBoundsToPercent({ x: 0.1, y: 0.2, width: 0.3, height: 0.05 })).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 5,
    });
  });

  it("pointInPercentRect detects containment", () => {
    const rect = { x: 10, y: 10, width: 20, height: 10 };
    expect(pointInPercentRect(15, 15, rect)).toBe(true);
    expect(pointInPercentRect(5, 15, rect)).toBe(false);
  });

  it("filters lines into assetId ROI and extracts value", () => {
    const lines: AzureTextLine[] = [
      { pageNumber: 1, content: "Asset No: SWNG14", xPercent: 15, yPercent: 12 },
      { pageNumber: 1, content: "Noise outside", xPercent: 80, yPercent: 80 },
    ];
    const result = extractFieldsFromRoiSpatial({ roiConfig: roi, lines });
    expect(result.fields.assetId?.value).toMatch(/SWNG14/);
    expect(result.linesMatched).toBeGreaterThan(0);
  });

  it("parses labeled numeric torque from region text", () => {
    expect(
      parseValueFromRegionText("Wheel Nut Torque (NM): 115", "Wheel_Nut_Torque", [
        {
          field: "Wheel_Nut_Torque",
          label: "Wheel Nut Torque",
          type: "number",
          required: false,
          aliases: ["Wheel Nut Torque"],
        },
      ])
    ).toBe("115");
  });

  it("filters selection marks into tickboxBlock ROI", () => {
    const marks: AzureSelectionMark[] = [
      {
        pageNumber: 1,
        state: "selected",
        confidence: 0.95,
        bbox: { x: 40, y: 45, width: 2, height: 2, coordinateSpace: "percent" },
      },
      {
        pageNumber: 1,
        state: "unselected",
        confidence: 0.9,
        bbox: { x: 50, y: 45, width: 2, height: 2, coordinateSpace: "percent" },
      },
      {
        pageNumber: 1,
        state: "unselected",
        confidence: 0.9,
        bbox: { x: 60, y: 45, width: 2, height: 2, coordinateSpace: "percent" },
      },
      {
        pageNumber: 1,
        state: "unselected",
        confidence: 0.9,
        bbox: { x: 70, y: 45, width: 2, height: 2, coordinateSpace: "percent" },
      },
      // Outside ROI
      {
        pageNumber: 1,
        state: "selected",
        confidence: 0.99,
        bbox: { x: 10, y: 90, width: 2, height: 2, coordinateSpace: "percent" },
      },
    ];
    const result = extractFieldsFromRoiSpatial({
      roiConfig: roi,
      selectionMarks: marks,
      lines: [],
      headerText: "Ok Adv Fail N/A",
    });
    expect(result.fields.complianceTickboxes).toBeDefined();
    expect(markCenterInRoi(marks[0], roi.regions[1])).toBe(true);
    expect(markCenterInRoi(marks[4], roi.regions[1])).toBe(false);
  });

  it("mergeRoiSpatialFields prefers ROI for listed keys", () => {
    const merged = mergeRoiSpatialFields(
      {
        assetId: { value: "OLD", confidence: 50, pageNumber: 1 },
        date: { value: "keep", confidence: 90, pageNumber: 1 },
      },
      {
        assetId: { value: "NEW", confidence: 80, pageNumber: 1 },
        date: { value: "roi-date", confidence: 70, pageNumber: 1 },
      },
      { preferRoiFor: new Set(["assetId"]) }
    );
    expect(merged.assetId.value).toBe("NEW");
    expect(merged.date.value).toBe("keep"); // ROI conf lower and not prefer-listed override by conf only — 70 < 90
  });

  it("lineInRoi respects page", () => {
    const region = roi.regions[0];
    const line: AzureTextLine = {
      pageNumber: 2,
      content: "x",
      xPercent: 15,
      yPercent: 12,
    };
    expect(lineInRoi(line, region)).toBe(false);
  });
});
