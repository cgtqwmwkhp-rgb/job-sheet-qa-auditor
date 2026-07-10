import { describe, it, expect } from "vitest";
import {
  clampPercent,
  findingToViewerBox,
  findingsToViewerBoxes,
  isValidPercentBBox,
  resolveFindingPage,
  severityToBoxColor,
  syncSelectionFromBox,
  syncSelectionFromFinding,
} from "./pdfFindingSync";

describe("isValidPercentBBox", () => {
  it("accepts PR-2 percent coordinateSpace boxes", () => {
    expect(
      isValidPercentBBox({
        x: 10,
        y: 20,
        width: 30,
        height: 15,
        coordinateSpace: "percent",
        source: "ocr_block",
      })
    ).toBe(true);
  });

  it("accepts legacy x/y/width/height without coordinateSpace", () => {
    expect(isValidPercentBBox({ x: 0, y: 0, width: 50, height: 10 })).toBe(
      true
    );
  });

  it("rejects non-percent coordinateSpace", () => {
    expect(
      isValidPercentBBox({
        x: 1,
        y: 1,
        width: 2,
        height: 2,
        coordinateSpace: "pixel",
      })
    ).toBe(false);
  });

  it("rejects zero/negative size or missing fields", () => {
    expect(isValidPercentBBox({ x: 1, y: 1, width: 0, height: 2 })).toBe(false);
    expect(isValidPercentBBox({ x: 1, y: 1, width: 2, height: -1 })).toBe(
      false
    );
    expect(isValidPercentBBox(null)).toBe(false);
    expect(isValidPercentBBox({ x: 1, y: 1 })).toBe(false);
  });
});

describe("clampPercent", () => {
  it("clamps into 0–100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe("severityToBoxColor", () => {
  it("maps severity and status to colors", () => {
    expect(severityToBoxColor("critical")).toBe("#ef4444");
    expect(severityToBoxColor("S2")).toBe("#f97316");
    expect(severityToBoxColor(undefined, "passed")).toBe("#22c55e");
    expect(severityToBoxColor(undefined, undefined)).toBe("#ef4444");
  });
});

describe("resolveFindingPage", () => {
  it("prefers pageNumber over box page", () => {
    expect(
      resolveFindingPage({
        id: 1,
        pageNumber: 3,
        box: { page: 1, x: 0, y: 0, width: 10, height: 10 },
      })
    ).toBe(3);
  });

  it("falls back to box.page then boundingBox.page", () => {
    expect(
      resolveFindingPage({
        id: 1,
        box: { page: 2, x: 0, y: 0, width: 10, height: 10 },
      })
    ).toBe(2);
    expect(
      resolveFindingPage({
        id: 1,
        boundingBox: {
          x: 1,
          y: 1,
          width: 2,
          height: 2,
          coordinateSpace: "percent",
          page: 4,
        },
      })
    ).toBe(4);
  });

  it("returns null when no page is known", () => {
    expect(resolveFindingPage({ id: 1 })).toBeNull();
  });
});

describe("findingToViewerBox", () => {
  it("maps PR-2 percent bbox onto DocumentViewer shape", () => {
    const box = findingToViewerBox({
      id: 42,
      pageNumber: 2,
      field: "Signature",
      severity: "critical",
      boundingBox: {
        x: 12.5,
        y: 80,
        width: 40,
        height: 8,
        coordinateSpace: "percent",
        source: "ocr_signature_block",
      },
    });
    expect(box).toEqual({
      id: 42,
      page: 2,
      x: 12.5,
      y: 80,
      width: 40,
      height: 8,
      color: "#ef4444",
      label: "Signature",
    });
  });

  it("prefers pre-normalized box when present", () => {
    const box = findingToViewerBox({
      id: "a",
      box: {
        page: 1,
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        color: "#0000ff",
        label: "Custom",
      },
      boundingBox: {
        x: 99,
        y: 99,
        width: 1,
        height: 1,
        coordinateSpace: "percent",
      },
    });
    expect(box?.x).toBe(5);
    expect(box?.color).toBe("#0000ff");
    expect(box?.label).toBe("Custom");
  });

  it("returns null without a usable bbox", () => {
    expect(findingToViewerBox({ id: 1, pageNumber: 1 })).toBeNull();
    expect(
      findingToViewerBox({
        id: 1,
        boundingBox: {
          coordinateSpace: "pixel",
          x: 1,
          y: 1,
          width: 1,
          height: 1,
        },
      })
    ).toBeNull();
  });
});

describe("findingsToViewerBoxes", () => {
  it("skips findings without bboxes", () => {
    const boxes = findingsToViewerBoxes([
      { id: 1, pageNumber: 1 },
      {
        id: 2,
        pageNumber: 1,
        boundingBox: {
          x: 10,
          y: 10,
          width: 20,
          height: 5,
          coordinateSpace: "percent",
        },
      },
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].id).toBe(2);
  });
});

describe("syncSelectionFromFinding / syncSelectionFromBox", () => {
  it("selects finding and resolves focus page for PDF jump", () => {
    const result = syncSelectionFromFinding({
      id: 7,
      pageNumber: 3,
      field: "timeOut",
      boundingBox: {
        x: 1,
        y: 1,
        width: 2,
        height: 2,
        coordinateSpace: "percent",
      },
    });
    expect(result).toEqual({
      activeBoxId: 7,
      focusPage: 3,
      focusLabel: "timeOut",
      hasBox: true,
    });
  });

  it("still returns focusPage from pageNumber when bbox missing", () => {
    expect(
      syncSelectionFromFinding({ id: 9, pageNumber: 2, field: "timeIn" })
    ).toEqual({
      activeBoxId: 9,
      focusPage: 2,
      focusLabel: "timeIn",
      hasBox: false,
    });
  });

  it("defaults focusPage to 1 when page and bbox are missing", () => {
    expect(syncSelectionFromFinding({ id: 11, field: "timeOut" })).toEqual({
      activeBoxId: 11,
      focusPage: 1,
      focusLabel: "timeOut",
      hasBox: false,
    });
  });

  it("clears selection for null finding", () => {
    expect(syncSelectionFromFinding(null)).toEqual({
      activeBoxId: null,
      focusPage: null,
      focusLabel: null,
      hasBox: false,
    });
  });

  it("maps box click to activeBoxId for findings list scroll", () => {
    expect(syncSelectionFromBox(55)).toEqual({ activeBoxId: 55 });
    expect(syncSelectionFromBox("box-1")).toEqual({ activeBoxId: "box-1" });
  });
});
