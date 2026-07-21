/**
 * Contract tests for PX-104 checklist format readers:
 * - Ford Result-column Pass/Fail text
 * - LOLER Obs. ✓/✗ glyphs
 * - Long-list recall (adaptive Y clustering + text merge)
 * - Sign-off demote when vlmUsed:false
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import type { AzureTextLine } from "../../services/ocrAdapter/parseAzureDiResponse";
import type { EmbeddedPdfPageLayout } from "../../services/embeddedPdfText";
import type { Finding } from "../../services/analyzer";
import {
  readResultColumnRows,
  readObsMarkRows,
  mergeChecklistRowSources,
  detectResultColumnBands,
  detectObsColumnBands,
  normalizeResultChoice,
  normalizeObsGlyph,
  computeAdaptiveYTolerance,
  mapSelectionMarksToRows,
  enrichRowsWithTextChecklistReaders,
  demoteSignOffMissingWhenInkUnverified,
  type SelectionMarkRow,
} from "../../services/selectionMarks";
import type { AzureSelectionMark as Mark } from "../../services/ocrAdapter/parseAzureDiResponse";
import {
  applyAuditPolicy,
  DEFAULT_AUDIT_POLICY,
} from "../../services/auditPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));

function line(
  content: string,
  opts: {
    page?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  } = {}
): AzureTextLine {
  return {
    pageNumber: opts.page ?? 1,
    content,
    xPercent: opts.x ?? 10,
    yPercent: opts.y ?? 20,
    widthPercent: opts.w ?? 30,
    heightPercent: opts.h ?? 1.2,
  };
}

function mark(
  x: number,
  y: number,
  state: "selected" | "unselected" = "unselected",
  page = 1
): Mark {
  return {
    state,
    confidence: 95,
    pageNumber: page,
    bbox: {
      x,
      y,
      width: 1.2,
      height: 1.2,
      coordinateSpace: "percent",
    },
  };
}

describe("normalizeResultChoice / normalizeObsGlyph", () => {
  it("maps Pass/Fail/OK/N/A synonyms", () => {
    expect(normalizeResultChoice("Pass")).toBe("Ok");
    expect(normalizeResultChoice("FAIL")).toBe("Fail");
    expect(normalizeResultChoice("OK")).toBe("Ok");
    expect(normalizeResultChoice("N/A")).toBe("N/A");
    expect(normalizeResultChoice("Satisfactory")).toBe("Ok");
    expect(normalizeResultChoice("junk")).toBe("UNREADABLE");
  });

  it("maps Obs. glyphs", () => {
    expect(normalizeObsGlyph("✓")).toBe("Ok");
    expect(normalizeObsGlyph("✗")).toBe("Fail");
    expect(normalizeObsGlyph("√")).toBe("Ok");
    expect(normalizeObsGlyph("×")).toBe("Fail");
  });
});

describe("Result-column reader (Ford format)", () => {
  const fordLines: AzureTextLine[] = [
    line("Item Description", { x: 8, y: 18, w: 40 }),
    line("Result", { x: 72, y: 18, w: 12 }),
    line("Check oil level and condition", { x: 8, y: 24, w: 45 }),
    line("Pass", { x: 74, y: 24, w: 8 }),
    line("Inspect brake pads for wear", { x: 8, y: 28, w: 45 }),
    line("Fail", { x: 74, y: 28, w: 8 }),
    line("Verify tyre pressures", { x: 8, y: 32, w: 40 }),
    line("N/A", { x: 74, y: 32, w: 8 }),
  ];

  it("detects Result column header band", () => {
    const bands = detectResultColumnBands(fordLines);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(bands[0].xMin).toBeGreaterThan(50);
  });

  it("reads Pass/Fail/N/A from Result column (was unread)", () => {
    const rows = readResultColumnRows({ lines: fordLines });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const byLabel = Object.fromEntries(
      rows.map(r => [r.label.toLowerCase(), r.choice])
    );
    expect(
      Object.values(byLabel).filter(c => c === "Ok").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      Object.values(byLabel).filter(c => c === "Fail").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      Object.values(byLabel).filter(c => c === "N/A").length
    ).toBeGreaterThanOrEqual(1);
    expect(rows.every(r => r.source === "result_column")).toBe(true);
  });

  it("reads Result values from text-layer word boxes", () => {
    const pageLayouts: EmbeddedPdfPageLayout[] = [
      {
        pageNumber: 1,
        text: "Result Pass Fail",
        width: 100,
        height: 100,
        words: [
          { text: "Item", page: 1, x: 5, y: 80, width: 10, height: 2 },
          { text: "Result", page: 1, x: 70, y: 80, width: 12, height: 2 },
          { text: "Oil", page: 1, x: 5, y: 70, width: 8, height: 2 },
          { text: "level", page: 1, x: 14, y: 70, width: 10, height: 2 },
          { text: "Pass", page: 1, x: 72, y: 70, width: 8, height: 2 },
          { text: "Brakes", page: 1, x: 5, y: 60, width: 12, height: 2 },
          { text: "Fail", page: 1, x: 72, y: 60, width: 8, height: 2 },
        ],
      },
    ];
    const rows = readResultColumnRows({ pageLayouts });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some(r => r.choice === "Ok")).toBe(true);
    expect(rows.some(r => r.choice === "Fail")).toBe(true);
  });
});

describe("Obs. marks reader (LOLER)", () => {
  const lolerLines: AzureTextLine[] = [
    line("Examination item", { x: 8, y: 20, w: 40 }),
    line("Obs.", { x: 80, y: 20, w: 10 }),
    line("Chain wear and stretch", { x: 8, y: 26, w: 40 }),
    line("✓", { x: 82, y: 26, w: 4 }),
    line("Hook deformation or cracks", { x: 8, y: 30, w: 42 }),
    line("✗", { x: 82, y: 30, w: 4 }),
    line("Load plate legible", { x: 8, y: 34, w: 35 }),
    line("✔", { x: 82, y: 34, w: 4 }),
  ];

  it("detects Obs. column header", () => {
    expect(detectObsColumnBands(lolerLines).length).toBeGreaterThanOrEqual(1);
  });

  it("reads ✓/✗ Obs. glyphs (was unread)", () => {
    const rows = readObsMarkRows({ lines: lolerLines });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter(r => r.choice === "Ok").length).toBeGreaterThanOrEqual(
      2
    );
    expect(rows.filter(r => r.choice === "Fail").length).toBeGreaterThanOrEqual(
      1
    );
    expect(rows.every(r => r.source === "obs_marks")).toBe(true);
  });
});

describe("long-list recall", () => {
  it("adaptive Y tolerance tightens on dense mark grids", () => {
    const marks: Mark[] = [];
    // 40 rows × 4 columns, 1.0% vertical spacing (dense)
    for (let row = 0; row < 40; row++) {
      const y = 20 + row * 1.0;
      marks.push(
        mark(58, y, row % 5 === 0 ? "selected" : "unselected"),
        mark(66, y),
        mark(74, y),
        mark(83, y)
      );
    }
    const tol = computeAdaptiveYTolerance(marks, 1.5);
    expect(tol).toBeLessThan(1.5);
    expect(tol).toBeGreaterThanOrEqual(0.55);

    const rows = mapSelectionMarksToRows(marks, {
      headerText: "Ok Adv. Fail N/A",
    });
    // Fixed 1.5% would merge neighbours; adaptive should keep most rows
    expect(rows.length).toBeGreaterThanOrEqual(35);
  });

  it("merges text Result rows into sparse radio recall", () => {
    const radio: SelectionMarkRow[] = [
      {
        rowIndex: 0,
        pageNumber: 1,
        label: "Check oil level and condition",
        choice: "Ok",
        confidence: 95,
        selectedCount: 1,
        markCount: 4,
        bbox: {
          x: 58,
          y: 23,
          width: 4,
          height: 2,
          coordinateSpace: "percent",
        },
      },
    ];
    const resultRows = readResultColumnRows({
      lines: [
        line("Result", { x: 72, y: 18, w: 12 }),
        line("Check oil level and condition", { x: 8, y: 24, w: 45 }),
        line("Pass", { x: 74, y: 24, w: 8 }),
        line("Inspect brake pads for wear", { x: 8, y: 28, w: 45 }),
        line("Fail", { x: 74, y: 28, w: 8 }),
        line("Verify tyre pressures", { x: 8, y: 32, w: 40 }),
        line("N/A", { x: 74, y: 32, w: 8 }),
      ],
    });
    const merged = mergeChecklistRowSources({ radioRows: radio, resultRows });
    expect(merged.textRowsAdded).toBeGreaterThanOrEqual(2);
    expect(merged.rows.length).toBeGreaterThanOrEqual(3);
    expect(merged.preferredSource).toBe("merged");
  });

  it("enrichRowsWithTextChecklistReaders fills gaps", () => {
    const enriched = enrichRowsWithTextChecklistReaders([], {
      lines: [
        line("Result", { x: 72, y: 18, w: 12 }),
        line("Primary hydraulic hose", { x: 8, y: 24, w: 40 }),
        line("Pass", { x: 74, y: 24, w: 8 }),
        line("Secondary relief valve", { x: 8, y: 28, w: 40 }),
        line("Fail", { x: 74, y: 28, w: 8 }),
      ],
    });
    expect(enriched.resultRowCount).toBeGreaterThanOrEqual(2);
    expect(enriched.rows.some(r => r.choice === "Fail")).toBe(true);
    expect(enriched.preferredSource).toBe("result_column");
  });
});

describe("sign-off demote when vlmUsed:false", () => {
  function finding(overrides: Partial<Finding> = {}): Finding {
    return {
      ruleId: "G001",
      fieldName: "engineerSignOff",
      severity: "S1",
      reasonCode: "MISSING_FIELD",
      rawSnippet: "Signature",
      normalisedSnippet: "Absent",
      confidence: 40,
      pageNumber: 1,
      whyItMatters: "Sign-off missing",
      suggestedFix: "Add signature",
      ...overrides,
    };
  }

  it("demotes MAJOR sign-off missing when VLM ink was not used", () => {
    const cleaned = demoteSignOffMissingWhenInkUnverified([finding()], {
      vlmUsed: false,
    });
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].severity).toBe("S3");
    expect(cleaned[0].reasonCode).toBe("LOW_CONFIDENCE");
    expect(cleaned[0].whyItMatters).toMatch(/vlmUsed:false/i);
  });

  it("records Present when label present and VLM skipped", () => {
    const cleaned = demoteSignOffMissingWhenInkUnverified([finding()], {
      vlmUsed: false,
      signatureLabelPresent: true,
    });
    expect(cleaned[0].severity).toBe("S3");
    expect(cleaned[0].normalisedSnippet).toBe("Present");
  });

  it("keeps MAJOR when VLM ink was used", () => {
    const cleaned = demoteSignOffMissingWhenInkUnverified([finding()], {
      vlmUsed: true,
    });
    expect(cleaned[0].severity).toBe("S1");
    expect(cleaned[0].reasonCode).toBe("MISSING_FIELD");
  });

  it("does not touch non-sign-off findings", () => {
    const other = finding({
      fieldName: "assetId",
      severity: "S1",
      reasonCode: "MISSING_FIELD",
    });
    const cleaned = demoteSignOffMissingWhenInkUnverified([other], {
      vlmUsed: false,
    });
    expect(cleaned[0].severity).toBe("S1");
  });

  it("PR-A: demoted finding stays non-major after applyAuditPolicy (DEF-C040 undo guard)", () => {
    // finding()'s ruleId "G001" is not DEF-C040, but its fieldName
    // "engineerSignOff" matches DEF-C040's fieldAliases — this is exactly
    // the path that previously let applyAuditPolicy remap the honesty
    // demote back to MAJOR.
    const cleaned = demoteSignOffMissingWhenInkUnverified([finding()], {
      vlmUsed: false,
    });
    const applied = applyAuditPolicy({
      findings: cleaned,
      formFamily: "default",
      policy: DEFAULT_AUDIT_POLICY,
      currentResult: "PASS",
    });
    expect(applied.hasMajorFails).toBe(false);
    expect(applied.overallResult).toBe("PASS");
    expect(applied.findings[0].failClass).toBe("informational");
  });
});

describe("documentProcessor wiring (PX-104)", () => {
  it("passes pageLayouts into selection marks and demotes unverified sign-off", () => {
    const dp = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf-8"
    );
    expect(dp).toContain("pageLayouts: textLayerPageLayouts");
    expect(dp).toContain("demoteSignOffMissingWhenInkUnverified");
    expect(dp).toContain("vlmInkResult?.imageQa?.vlmUsed === true");
  });
});
