/**
 * Live Azure DI layout fixture (captured from real prebuilt-layout call).
 * No network — uses checked-in JSON from a synthetic checklist image.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parseAzureDiResponse } from "../../services/ocrAdapter/parseAzureDiResponse";
import {
  mapSelectionMarksToRows,
  buildSelectionMarksArtifact,
  artifactToResult,
} from "../../services/selectionMarks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const live = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/azure-di-layout-live-checklist.json"),
    "utf8"
  )
);

describe("live Azure DI checklist fixture", () => {
  it("parses 12 selection marks from real layout response", () => {
    const parsed = parseAzureDiResponse(live);
    expect(parsed.selectionMarks).toHaveLength(12);
    expect(
      parsed.selectionMarks.filter(m => m.state === "selected")
    ).toHaveLength(2);
  });

  it("maps Ok, Fail, UNREADABLE for the three synthetic rows", () => {
    const parsed = parseAzureDiResponse(live);
    const header = parsed.pages[0]?.markdown || "";
    const rows = mapSelectionMarksToRows(parsed.selectionMarks, {
      headerText: header,
      lines: parsed.lines,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].choice).toBe("Ok");
    expect(rows[1].choice).toBe("Fail");
    expect(rows[2].choice).toBe("UNREADABLE");
    expect(rows[2].selectedCount).toBe(0);
    expect(rows[0].label).toMatch(/chassis|mounting/i);
    expect(rows[1].label).toMatch(/hydraulic|hoses/i);
  });

  it("surfaces Fail aggregate in complianceTickboxes hint", () => {
    const parsed = parseAzureDiResponse(live);
    const artifact = buildSelectionMarksArtifact(parsed.selectionMarks, {
      model: parsed.model,
      processingTimeMs: 1,
      headerText: parsed.pages[0]?.markdown,
      lines: parsed.lines,
    });
    const result = artifactToResult(artifact);
    expect(result.preExtractedFields.complianceTickboxes.value).toMatch(/Fail/);
    expect(result.hintsBlock).toContain("Ok");
    expect(result.hintsBlock).toContain("Fail");
    expect(result.hintsBlock).toContain("UNREADABLE");
    expect(result.hintsBlock).toMatch(/chassis|mounting/i);
  });
});

describe("selectionMarks edge cases", () => {
  function mark(
    page: number,
    x: number,
    y: number,
    state: "selected" | "unselected",
    conf = 95
  ) {
    return {
      pageNumber: page,
      state,
      confidence: conf,
      bbox: {
        x,
        y,
        width: 2,
        height: 2,
        coordinateSpace: "percent" as const,
      },
    };
  }

  it("ignores singleton marks (not a radio row)", () => {
    const rows = mapSelectionMarksToRows([mark(1, 10, 10, "selected")]);
    expect(rows).toHaveLength(0);
  });

  it("takes rightmost 4 when a row has 5+ marks", () => {
    const rows = mapSelectionMarksToRows([
      mark(1, 10, 20, "unselected"), // left noise
      mark(1, 50, 20, "selected"),
      mark(1, 60, 20, "unselected"),
      mark(1, 70, 20, "unselected"),
      mark(1, 80, 20, "unselected"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].markCount).toBe(4);
    expect(rows[0].choice).toBe("Ok");
  });

  it("keeps pages separate", () => {
    const rows = mapSelectionMarksToRows([
      mark(1, 50, 20, "selected"),
      mark(1, 60, 20, "unselected"),
      mark(1, 70, 20, "unselected"),
      mark(1, 80, 20, "unselected"),
      mark(2, 50, 20, "unselected"),
      mark(2, 60, 20, "unselected"),
      mark(2, 70, 20, "selected"),
      mark(2, 80, 20, "unselected"),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].pageNumber).toBe(1);
    expect(rows[0].choice).toBe("Ok");
    expect(rows[1].pageNumber).toBe(2);
    expect(rows[1].choice).toBe("Fail");
  });

  it("handles confidence already on 0-100 scale", () => {
    const parsed = parseAzureDiResponse({
      analyzeResult: {
        modelId: "prebuilt-layout",
        pages: [
          {
            pageNumber: 1,
            width: 100,
            height: 100,
            unit: "pixel",
            selectionMarks: [
              {
                state: "selected",
                confidence: 97,
                polygon: [50, 20, 52, 20, 52, 22, 50, 22],
              },
              {
                state: "unselected",
                confidence: 90,
                polygon: [60, 20, 62, 20, 62, 22, 60, 22],
              },
              {
                state: "unselected",
                confidence: 90,
                polygon: [70, 20, 72, 20, 72, 22, 70, 22],
              },
              {
                state: "unselected",
                confidence: 90,
                polygon: [80, 20, 82, 20, 82, 22, 80, 22],
              },
            ],
          },
        ],
      },
    });
    expect(parsed.selectionMarks[0].confidence).toBe(97);
  });
});
