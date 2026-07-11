/**
 * Contract tests for selection mark parsing + Ok/Adv/Fail/N/A mapping.
 * Fixture-driven — no live Azure HTTP.
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import {
  parseAzureDiResponse,
  polygonToPercentBBox,
} from "../../services/ocrAdapter/parseAzureDiResponse";
import {
  mapSelectionMarksToRows,
  inferColumnOrder,
  buildSelectionMarksArtifact,
  formatSelectionMarksHints,
  isSelectionMarksEnabled,
  countHighConfidenceFailMarks,
  hasBlockingFailMarks,
  FEATURE_FLAG,
} from "../../services/selectionMarks";
import type { SelectionMarksArtifact } from "../../services/selectionMarks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const layoutFixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/azure-di-layout-selection-marks.json"),
    "utf8"
  )
);

describe("polygonToPercentBBox", () => {
  it("converts inch polygon to percent of page", () => {
    const bbox = polygonToPercentBBox(
      [5.0, 2.0, 5.3, 2.0, 5.3, 2.3, 5.0, 2.3],
      8.5,
      11
    );
    expect(bbox).toBeDefined();
    expect(bbox!.x).toBeCloseTo((5.0 / 8.5) * 100, 1);
    expect(bbox!.y).toBeCloseTo((2.0 / 11) * 100, 1);
    expect(bbox!.coordinateSpace).toBe("percent");
  });
});

describe("parseAzureDiResponse selectionMarks", () => {
  it("extracts selectionMarks from layout fixture", () => {
    const parsed = parseAzureDiResponse(layoutFixture);
    expect(parsed.model).toBe("prebuilt-layout");
    expect(parsed.selectionMarks).toHaveLength(8);
    expect(
      parsed.selectionMarks.filter(m => m.state === "selected")
    ).toHaveLength(2);
    expect(parsed.selectionMarks[0].confidence).toBeGreaterThan(90);
    expect(parsed.selectionMarks[0].bbox.coordinateSpace).toBe("percent");
    expect(parsed.pages[0].markdown).toContain("Tail Lift Inspection");
  });

  it("returns empty selectionMarks for read-only fixture shape", () => {
    const parsed = parseAzureDiResponse({
      analyzeResult: {
        modelId: "prebuilt-read",
        content: "No marks",
        pages: [
          { pageNumber: 1, width: 8.5, height: 11, unit: "inch", lines: [] },
        ],
      },
    });
    expect(parsed.selectionMarks).toEqual([]);
  });
});

describe("mapSelectionMarksToRows", () => {
  it("maps Ok selected / others unselected → Ok", () => {
    const parsed = parseAzureDiResponse(layoutFixture);
    const rows = mapSelectionMarksToRows(parsed.selectionMarks, {
      headerText: "Task Description Ok Adv. Fail N/A",
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].choice).toBe("Ok");
    expect(rows[0].selectedCount).toBe(1);
    expect(rows[0].markCount).toBe(4);
    expect(rows[1].choice).toBe("Adv");
  });

  it("marks multi-selected or none-selected as UNREADABLE", () => {
    const marks = parseAzureDiResponse(layoutFixture).selectionMarks.slice(
      0,
      4
    );
    // Force two selected
    marks[0] = { ...marks[0], state: "selected" };
    marks[1] = { ...marks[1], state: "selected" };
    const rows = mapSelectionMarksToRows(marks);
    expect(rows).toHaveLength(1);
    expect(rows[0].choice).toBe("UNREADABLE");
  });

  it("inferColumnOrder reads Ok Adv Fail N/A headers", () => {
    expect(inferColumnOrder("Ok Adv. Fail N/A")).toEqual([
      "Ok",
      "Adv",
      "Fail",
      "N/A",
    ]);
  });
});

describe("selectionMarks artifact + hints", () => {
  it("builds artifact and Gemini hint block", () => {
    const parsed = parseAzureDiResponse(layoutFixture);
    const artifact = buildSelectionMarksArtifact(parsed.selectionMarks, {
      model: "prebuilt-layout",
      processingTimeMs: 12,
      headerText: "Ok Adv. Fail N/A",
    });
    expect(artifact.summary.marksDetected).toBe(8);
    expect(artifact.summary.readableRows).toBeGreaterThanOrEqual(2);
    const hints = formatSelectionMarksHints(artifact.rows);
    expect(hints).toContain("Selection Marks");
    expect(hints).toContain("Ok");
  });
});

describe("isSelectionMarksEnabled", () => {
  const prevFlag = process.env[FEATURE_FLAG];
  const prevEndpoint = process.env.AZURE_DI_ENDPOINT;
  const prevKey = process.env.AZURE_DI_KEY;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env[FEATURE_FLAG];
    else process.env[FEATURE_FLAG] = prevFlag;
    if (prevEndpoint === undefined) delete process.env.AZURE_DI_ENDPOINT;
    else process.env.AZURE_DI_ENDPOINT = prevEndpoint;
    if (prevKey === undefined) delete process.env.AZURE_DI_KEY;
    else process.env.AZURE_DI_KEY = prevKey;
  });

  it("respects explicit false", () => {
    process.env[FEATURE_FLAG] = "false";
    process.env.AZURE_DI_ENDPOINT =
      "https://example.cognitiveservices.azure.com";
    process.env.AZURE_DI_KEY = "fake";
    expect(isSelectionMarksEnabled()).toBe(false);
  });

  it("defaults on when Azure DI configured", () => {
    delete process.env[FEATURE_FLAG];
    process.env.AZURE_DI_ENDPOINT =
      "https://example.cognitiveservices.azure.com";
    process.env.AZURE_DI_KEY = "fake";
    expect(isSelectionMarksEnabled()).toBe(true);
  });

  it("defaults off when Azure DI not configured", () => {
    delete process.env[FEATURE_FLAG];
    delete process.env.AZURE_DI_ENDPOINT;
    delete process.env.AZURE_DI_KEY;
    expect(isSelectionMarksEnabled()).toBe(false);
  });
});

describe("countHighConfidenceFailMarks", () => {
  it("ignores low-confidence Fail circles (empty-column false positives)", () => {
    const artifact = {
      rows: [
        { choice: "Fail", confidence: 40, rowIndex: 0 },
        { choice: "Fail", confidence: 55, rowIndex: 1 },
        { choice: "Ok", confidence: 95, rowIndex: 2 },
        { choice: "Fail", confidence: 90, rowIndex: 3 },
      ],
    } as SelectionMarksArtifact;
    expect(countHighConfidenceFailMarks(artifact)).toBe(1);
    expect(hasBlockingFailMarks(artifact)).toBe(true);
    expect(countHighConfidenceFailMarks(artifact, 95)).toBe(0);
  });

  it("documentProcessor uses high-confidence Fail count for consistency", () => {
    const dp = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf-8"
    );
    expect(dp).toContain("countHighConfidenceFailMarks");
  });
});

describe("documentProcessor wiring", () => {
  it("wires Selection Marks stage and hints", () => {
    const dp = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf-8"
    );
    expect(dp).toContain("runSelectionMarkDetection");
    expect(dp).toContain("Selection Marks");
    expect(dp).toContain("selectionMarks:");
    const analyzer = readFileSync(
      resolve(__dirname, "../../services/analyzer.ts"),
      "utf-8"
    );
    expect(analyzer).toContain("Selection Marks hints");
  });
});
