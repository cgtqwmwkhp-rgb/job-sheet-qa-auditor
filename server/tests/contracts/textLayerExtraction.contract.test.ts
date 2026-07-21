/**
 * W0/W1 text-layer-first contracts (PR1 / PX-100 / PX-103).
 *
 * Run011-style born-digital Job Summary: classify → label-anchor headers →
 * skip primary Mistral wiring → grounded date abstain for ungrounded values.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  classifyDocument,
  classifyPageKind,
  buildTextLayerResult,
  extractFieldsFromPlainText,
  toDbDocumentStrategy,
  synthesizeOcrResultFromTextLayer,
  backfillAuthoritativeExtractedFields,
  isDateLabelBleedValue,
  stripLabelBleedSuffix,
  CANONICAL_HEADER_FIELD_IDS,
  PAGE_DIGITAL_MIN_CHARS,
  type ExtractedFieldMap,
} from "../../services/textLayerExtraction";
import {
  extractEmbeddedPdfText,
  textItemToWordBox,
  usableTextLength,
  type EmbeddedPdfTextResult,
  type EmbeddedPdfPageLayout,
  type PdfTextWord,
} from "../../services/embeddedPdfText";
import {
  applyFieldVote,
  applyGroundedDateGateToVote,
  dateLabelNearValue,
  dateValueAppearsInText,
  FEATURE_FIELD_VOTE,
  voteField,
} from "../../services/fieldVoting";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/text-layer");
const RUN011_TEXT = fs.readFileSync(
  path.join(FIXTURE_DIR, "run011-pto-wx65vmh.txt"),
  "utf-8"
);
const RUN011_GT = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "run011-pto-wx65vmh.gt.json"), "utf-8")
) as {
  headers: Record<string, string>;
  ungroundedDateMustAbstain: string;
  documentStrategyExpected: string;
};

const JETTER_TEXT = fs.readFileSync(
  path.join(FIXTURE_DIR, "jetter-job-629.txt"),
  "utf-8"
);
const JETTER_GT = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "jetter-job-629.gt.json"), "utf-8")
) as { headers: Record<string, string> };

const LOLER_TEXT = fs.readFileSync(
  path.join(FIXTURE_DIR, "loler-cert-8842.txt"),
  "utf-8"
);
const LOLER_GT = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, "loler-cert-8842.gt.json"), "utf-8")
) as { headers: Record<string, string> };

const MINIMAL_TEXT_PDF = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 12 Tf 72 720 Td (Job Summary Report Asset BN21ACO Technician) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000360 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
433
%%EOF`;

describe("textLayerExtraction classify (W0)", () => {
  it("marks sparse pages as scan and rich pages as born_digital", () => {
    expect(classifyPageKind(0, 0)).toBe("empty");
    expect(classifyPageKind(5, 1)).toBe("scan");
    expect(classifyPageKind(PAGE_DIGITAL_MIN_CHARS, 2)).toBe("born_digital");
    expect(classifyPageKind(10, 8)).toBe("born_digital");
  });

  it("skips primary OCR for Run011-style born-digital Job Summary text", () => {
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: RUN011_TEXT,
      pages: [RUN011_TEXT],
      pageCount: 1,
      pageLayouts: [
        {
          pageNumber: 1,
          text: RUN011_TEXT,
          words: [],
        },
      ],
      words: [],
    };
    const c = classifyDocument(embedded);
    expect(c.kind).toBe("born_digital");
    expect(c.skipPrimaryOcr).toBe(true);
    expect(c.documentStrategy).toBe("text_layer");
    expect(toDbDocumentStrategy("text_layer")).toBe("embedded_text");
  });

  it("does not skip OCR when text layer is empty", () => {
    const c = classifyDocument({
      success: false,
      fullText: "",
      pages: [],
      pageCount: 0,
      pageLayouts: [],
      words: [],
      error: "NO_TEXT",
    });
    expect(c.skipPrimaryOcr).toBe(false);
    expect(c.documentStrategy).toBe("ocr");
  });
});

describe("label-anchor header extract (PX-100)", () => {
  it("extracts Asset/Job/Date/Make/Customer/Technician from Run011 fixture", () => {
    const fields = extractFieldsFromPlainText(RUN011_TEXT, 1);
    const byId = Object.fromEntries(fields.map(f => [f.fieldId, f]));

    expect(byId.assetId?.value).toBe(RUN011_GT.headers.assetId);
    expect(byId.jobReference?.value).toBe(RUN011_GT.headers.jobReference);
    expect(byId.date?.value).toBe(RUN011_GT.headers.date);
    expect(byId.dateOfService?.value).toBe(RUN011_GT.headers.dateOfService);
    expect(byId.makeModel?.value).toMatch(/PTO/i);
    expect(byId.customerName?.value).toMatch(/SGN/i);
    expect(byId.technicianName?.value).toMatch(/richard\.newton/i);

    for (const f of fields) {
      expect(f.source).toBe("text_layer");
      expect(f.confidence).toBeGreaterThanOrEqual(0.9);
      expect(f.page).toBe(1);
    }
  });

  it("does not promote Next Service Date as dateOfService", () => {
    const fields = extractFieldsFromPlainText(RUN011_TEXT, 1);
    const date = fields.find(f => f.fieldId === "date");
    expect(date?.value).toBe("16/07/2026");
    expect(date?.value).not.toBe("16/07/2027");
  });

  it("buildTextLayerResult stamps text_layer strategy + preExtracted map", () => {
    const result = buildTextLayerResult({
      success: true,
      fullText: RUN011_TEXT,
      pages: [RUN011_TEXT],
      pageCount: 1,
      pageLayouts: [{ pageNumber: 1, text: RUN011_TEXT, words: [] }],
      words: [],
    });
    expect(result.classification.documentStrategy).toBe(
      RUN011_GT.documentStrategyExpected
    );
    expect(result.classification.skipPrimaryOcr).toBe(true);
    expect(result.preExtracted.assetId?.value).toBe("WX65VMH");
    expect(result.preExtracted.jobReference?.value).toBe("218");
    expect(result.preExtracted.date?.value).toBe("16/07/2026");
  });
});

describe("label-anchor extract coverage (PX-106)", () => {
  /** Synthetic geometry mirroring a Jetter job sheet's word boxes. */
  function jetterPageLayout(): EmbeddedPdfPageLayout {
    const pageH = 842;
    const mk = (
      text: string,
      x: number,
      yFromTop: number,
      w = 40,
      h = 10
    ): PdfTextWord => ({
      text,
      page: 1,
      x,
      y: pageH - yFromTop - h,
      width: w,
      height: h,
    });
    const words: PdfTextWord[] = [
      mk("Asset", 40, 80, 35),
      mk("No", 80, 80, 20),
      mk("JT99XYZ", 120, 80, 55),
      mk("Date", 40, 120, 30),
      mk("22/07/2026", 90, 120, 70),
      // "ID :" merged as one word — space before colon (root cause 1).
      mk("Job", 40, 160, 25),
      mk("ID :", 70, 160, 30),
      mk("629", 105, 160, 30),
      // Same-line Technician + trailing Signature marker (root cause 2).
      mk("Technician:", 40, 200, 65),
      mk("John", 110, 200, 30),
      mk("Smith", 145, 200, 35),
      mk("Signature", 185, 200, 55),
    ];
    return {
      pageNumber: 1,
      text: JETTER_TEXT,
      words,
    };
  }

  it("resolves Job ID with space-before-colon token via geometry", () => {
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: JETTER_TEXT,
      pages: [JETTER_TEXT],
      pageCount: 1,
      pageLayouts: [jetterPageLayout()],
      words: jetterPageLayout().words,
    };
    const result = buildTextLayerResult(embedded);

    expect(result.preExtracted.jobReference?.value).toBe(
      JETTER_GT.headers.jobReference
    );
    expect(result.preExtracted.technicianName?.value).toBe(
      JETTER_GT.headers.technicianName
    );
  });

  it("extracts ≥5/6 canonical headers from Jetter-like text + geometry", () => {
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: JETTER_TEXT,
      pages: [JETTER_TEXT],
      pageCount: 1,
      pageLayouts: [jetterPageLayout()],
      words: jetterPageLayout().words,
    };
    const result = buildTextLayerResult(embedded);

    const canonicalIds = [
      "assetId",
      "jobReference",
      "date",
      "makeModel",
      "customerName",
      "technicianName",
    ];
    const present = canonicalIds.filter(id => result.preExtracted[id]);
    expect(present.length).toBeGreaterThanOrEqual(5);
    expect(present).toContain("jobReference");
    expect(present).toContain("technicianName");

    for (const id of canonicalIds) {
      if (JETTER_GT.headers[id] && result.preExtracted[id]) {
        expect(result.preExtracted[id]?.value).toBe(JETTER_GT.headers[id]);
      }
    }
  });

  it("backfills missing canonical headers from plain text even when geometry already grounded ≥3 fields", () => {
    // makeModel/customerName have no geometry words above — only reachable
    // via the document-level plain-text backfill (root cause 3).
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: JETTER_TEXT,
      pages: [JETTER_TEXT],
      pageCount: 1,
      pageLayouts: [jetterPageLayout()],
      words: jetterPageLayout().words,
    };
    const result = buildTextLayerResult(embedded);

    expect(result.preExtracted.makeModel?.value).toBe(
      JETTER_GT.headers.makeModel
    );
    expect(result.preExtracted.customerName?.value).toBe(
      JETTER_GT.headers.customerName
    );
  });

  it("extracts LOLER-style Make and Model / Print Name / Date of Examination", () => {
    const fields = extractFieldsFromPlainText(LOLER_TEXT, 1);
    const byId = Object.fromEntries(fields.map(f => [f.fieldId, f]));

    expect(byId.assetId?.value).toBe(LOLER_GT.headers.assetId);
    expect(byId.jobReference?.value).toBe(LOLER_GT.headers.jobReference);
    expect(byId.date?.value).toBe(LOLER_GT.headers.date);
    expect(byId.makeModel?.value).toBe(LOLER_GT.headers.makeModel);
    expect(byId.customerName?.value).toBe(LOLER_GT.headers.customerName);
    expect(byId.technicianName?.value).toBe(LOLER_GT.headers.technicianName);
  });

  it("buildTextLayerResult surfaces LOLER headers end-to-end", () => {
    const result = buildTextLayerResult({
      success: true,
      fullText: LOLER_TEXT,
      pages: [LOLER_TEXT],
      pageCount: 1,
      pageLayouts: [{ pageNumber: 1, text: LOLER_TEXT, words: [] }],
      words: [],
    });
    expect(result.preExtracted.makeModel?.value).toBe(
      LOLER_GT.headers.makeModel
    );
    expect(result.preExtracted.technicianName?.value).toBe(
      LOLER_GT.headers.technicianName
    );
    expect(result.preExtracted.date?.value).toBe(LOLER_GT.headers.date);
  });
});

describe("authoritative persist backfill (Sprint1.5 PR-B / PX-106)", () => {
  /** Same synthetic geometry as the label-anchor coverage suite above. */
  function jetterPageLayout(): EmbeddedPdfPageLayout {
    const pageH = 842;
    const mk = (
      text: string,
      x: number,
      yFromTop: number,
      w = 40,
      h = 10
    ): PdfTextWord => ({
      text,
      page: 1,
      x,
      y: pageH - yFromTop - h,
      width: w,
      height: h,
    });
    const words: PdfTextWord[] = [
      mk("Asset", 40, 80, 35),
      mk("No", 80, 80, 20),
      mk("JT99XYZ", 120, 80, 55),
      mk("Date", 40, 120, 30),
      mk("22/07/2026", 90, 120, 70),
      mk("Job", 40, 160, 25),
      mk("ID :", 70, 160, 30),
      mk("629", 105, 160, 30),
      mk("Technician:", 40, 200, 65),
      mk("John", 110, 200, 30),
      mk("Smith", 145, 200, 35),
      mk("Signature", 185, 200, 55),
    ];
    return { pageNumber: 1, text: JETTER_TEXT, words };
  }

  it("backfills graded {} with ≥5/6 canonical headers from the Jetter text-layer snapshot", () => {
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: JETTER_TEXT,
      pages: [JETTER_TEXT],
      pageCount: 1,
      pageLayouts: [jetterPageLayout()],
      words: jetterPageLayout().words,
    };
    const textLayer = buildTextLayerResult(embedded);

    // Gemini returned {} — root cause of Run013 grading 0/6.
    const graded: ExtractedFieldMap = {};
    const backfilled = backfillAuthoritativeExtractedFields(
      graded,
      textLayer.preExtracted
    );

    const canonicalIds = [
      "assetId",
      "jobReference",
      "date",
      "makeModel",
      "customerName",
      "technicianName",
    ];
    const present = canonicalIds.filter(
      id => backfilled[id] && backfilled[id].value.trim().length > 0
    );
    expect(present.length).toBeGreaterThanOrEqual(5);
  });

  it("never overwrites a nonempty graded value with an authoritative one", () => {
    const graded: ExtractedFieldMap = {
      assetId: { value: "GEMINI-VALUE", confidence: 40, pageNumber: 1 },
    };
    const backfilled = backfillAuthoritativeExtractedFields(graded, {
      assetId: { value: "JT99XYZ", confidence: 98, pageNumber: 1 },
    });
    expect(backfilled.assetId.value).toBe("GEMINI-VALUE");
  });

  it("treats an empty-string graded value as absent and backfills it", () => {
    const graded: ExtractedFieldMap = {
      assetId: { value: "", confidence: 0, pageNumber: 1 },
    };
    const backfilled = backfillAuthoritativeExtractedFields(graded, {
      assetId: { value: "JT99XYZ", confidence: 98, pageNumber: 1 },
    });
    expect(backfilled.assetId.value).toBe("JT99XYZ");
  });

  it("skips an authoritative value that is itself empty", () => {
    const graded: ExtractedFieldMap = {};
    const backfilled = backfillAuthoritativeExtractedFields(graded, {
      assetId: { value: "   ", confidence: 98, pageNumber: 1 },
    });
    expect(backfilled.assetId).toBeUndefined();
  });

  it("only touches canonical header fields, not arbitrary keys", () => {
    expect(CANONICAL_HEADER_FIELD_IDS).toContain("makeModel");
    expect(CANONICAL_HEADER_FIELD_IDS).toContain("customerName");
    expect(CANONICAL_HEADER_FIELD_IDS).toContain("technicianName");
    const graded: ExtractedFieldMap = {};
    const backfilled = backfillAuthoritativeExtractedFields(graded, {
      engineerSignOff: { value: "Present", confidence: 90, pageNumber: 1 },
    });
    expect(backfilled.engineerSignOff).toBeUndefined();
  });
});

describe("LOLER jobRef date+label bleed rejection (PX-106)", () => {
  it("flags a jobRef value with a date glued to an Asset No label", () => {
    expect(isDateLabelBleedValue("12/07/2026AssetNo")).toBe(true);
    expect(isDateLabelBleedValue("LOLER-8842")).toBe(false);
  });

  it("leaves jobReference unread rather than persisting date+label bleed", () => {
    const bledText = [
      "LOLER Inspection Certificate",
      "Job Reference: 12/07/2026AssetNo",
      "Asset No: JCB-CRANE-04",
      "Date of Examination: 12/07/2026",
    ].join("\n");
    const fields = extractFieldsFromPlainText(bledText, 1);
    const jobRef = fields.find(f => f.fieldId === "jobReference");
    expect(jobRef).toBeUndefined();
  });

  it("still extracts the real LOLER jobReference when unbled", () => {
    const fields = extractFieldsFromPlainText(LOLER_TEXT, 1);
    const jobRef = fields.find(f => f.fieldId === "jobReference");
    expect(jobRef?.value).toBe(LOLER_GT.headers.jobReference);
  });
});

describe("Winch jobNumber/jobRef date+label bleed rejection (PX-112)", () => {
  // "Make" bleed was not covered by the original PX-106 token list — widened
  // by PX-112 alongside Site/Address, so this is a genuine regression case.
  const bledWinchText = [
    "Winch Job Summary",
    "Job Ref: 21/07/2026Make",
    "Asset No: WNCH-2201",
    "Date: 21/07/2026",
  ].join("\n");

  it("flags the Make-label date bleed the same as the original AssetNo case", () => {
    expect(isDateLabelBleedValue("21/07/2026Make")).toBe(true);
  });

  it("Wave B: flags spaced date + Asset label bleed", () => {
    expect(isDateLabelBleedValue("14 07 2026 Asset n")).toBe(true);
  });

  it("leaves jobReference AND its jobNumber alias unread rather than persisting date+label bleed", () => {
    const fields = extractFieldsFromPlainText(bledWinchText, 1);
    const byId = Object.fromEntries(fields.map(f => [f.fieldId, f]));
    expect(byId.jobReference).toBeUndefined();
    expect(byId.jobNumber).toBeUndefined();
    // The real date field is unaffected by jobRef's bleed rejection.
    expect(byId.date?.value).toBe("21/07/2026");
  });

  it("Wave B: spaced Winch jobRef bleed stays unread and abstains", () => {
    const abstainFieldIds = new Set<string>();
    const text = [
      "Thorough Examination — Winch",
      "Job Ref: 14 07 2026 Asset n",
      "Asset No: WNCH-2201",
      "Date: 14/07/2026",
    ].join("\n");
    const fields = extractFieldsFromPlainText(text, 1, undefined, {
      abstainFieldIds,
    });
    const byId = Object.fromEntries(fields.map(f => [f.fieldId, f]));
    expect(byId.jobReference).toBeUndefined();
    expect(byId.jobNumber).toBeUndefined();
    expect(abstainFieldIds.has("jobReference")).toBe(true);
    expect(abstainFieldIds.has("jobNumber")).toBe(true);
  });
});

describe("next-field label-bleed suffix stripping (PX-112)", () => {
  it("strips an underscore-glued next-field label from an ID-shaped value", () => {
    expect(stripLabelBleedSuffix("3031532_MAKE")).toBe("3031532");
    expect(stripLabelBleedSuffix("3031532_MODEL")).toBe("3031532");
  });

  it("strips a no-space-glued next-field label from an ID-shaped value", () => {
    expect(stripLabelBleedSuffix("3031532MAKE")).toBe("3031532");
  });

  it("leaves ordinary values (non-digit-led, or no glued label) untouched", () => {
    expect(stripLabelBleedSuffix("JT99XYZ")).toBe("JT99XYZ");
    expect(stripLabelBleedSuffix("CANDIDATE")).toBe("CANDIDATE");
    expect(stripLabelBleedSuffix("LOLER-8842")).toBe("LOLER-8842");
  });

  /** Synthetic geometry: a Jetter Asset No value glued to a MAKE label. */
  function jetterBleedPageLayout(): EmbeddedPdfPageLayout {
    const pageH = 842;
    const mk = (
      text: string,
      x: number,
      yFromTop: number,
      w = 40,
      h = 10
    ): PdfTextWord => ({
      text,
      page: 1,
      x,
      y: pageH - yFromTop - h,
      width: w,
      height: h,
    });
    const words: PdfTextWord[] = [
      mk("Asset", 40, 80, 35),
      mk("No", 80, 80, 20),
      // No-space PDF bleed: value + next field's label glued into one token.
      mk("3031532_MAKE", 120, 80, 90),
    ];
    return { pageNumber: 1, text: "Asset No: 3031532_MAKE", words };
  }

  it("resolves the Jetter assetId as 3031532, not 3031532_MAKE", () => {
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: "Asset No: 3031532_MAKE",
      pages: ["Asset No: 3031532_MAKE"],
      pageCount: 1,
      pageLayouts: [jetterBleedPageLayout()],
      words: jetterBleedPageLayout().words,
    };
    const result = buildTextLayerResult(embedded);
    expect(result.preExtracted.assetId?.value).toBe("3031532");
    expect(result.preExtracted.assetId?.value).not.toBe("3031532_MAKE");
  });

  /**
   * Wave B PX-115: long-header layout — Asset No cell empty on the label
   * row because Make sits on the same line; value lives on the next line.
   * Must not overcorrect to empty (0/6) after the bleed strip.
   */
  function jetterWrappedHeaderLayout(): EmbeddedPdfPageLayout {
    const pageH = 842;
    const mk = (
      text: string,
      x: number,
      yFromTop: number,
      w = 40,
      h = 10
    ): PdfTextWord => ({
      text,
      page: 1,
      x,
      y: pageH - yFromTop - h,
      width: w,
      height: h,
    });
    const words: PdfTextWord[] = [
      mk("Asset", 40, 80, 35),
      mk("No", 80, 80, 20),
      mk("Make", 220, 80, 35),
      mk("JetterPro", 260, 80, 55),
      mk("3031532", 40, 100, 55),
      mk("Model", 220, 100, 35),
      mk("X200", 260, 100, 35),
      mk("Customer", 40, 140, 50),
      mk("Thames", 100, 140, 45),
      mk("Water", 150, 140, 40),
      mk("Date", 40, 180, 30),
      mk("14/07/2026", 90, 180, 70),
      mk("Job", 40, 220, 25),
      mk("ID", 70, 220, 20),
      mk("629", 100, 220, 30),
    ];
    return {
      pageNumber: 1,
      text: [
        "Asset No Make JetterPro",
        "3031532 Model X200",
        "Customer: Thames Water",
        "Date: 14/07/2026",
        "Job ID: 629",
      ].join("\n"),
      words,
    };
  }

  it("Wave B PX-115: wrapped Jetter header yields assetId 3031532 (not empty, not *_MAKE)", () => {
    const layout = jetterWrappedHeaderLayout();
    const embedded: EmbeddedPdfTextResult = {
      success: true,
      fullText: layout.text,
      pages: [layout.text],
      pageCount: 1,
      pageLayouts: [layout],
      words: layout.words,
    };
    const result = buildTextLayerResult(embedded);
    expect(result.preExtracted.assetId?.value).toBe("3031532");
    expect(result.preExtracted.assetId?.value).not.toBe("3031532_MAKE");

    const canonicalIds = [
      "assetId",
      "jobReference",
      "date",
      "makeModel",
      "customerName",
      "technicianName",
    ];
    const present = canonicalIds.filter(id => result.preExtracted[id]);
    expect(present.length).toBeGreaterThanOrEqual(5);
    expect(present).toContain("assetId");
  });
});

describe("embeddedPdfText words+bboxes", () => {
  it("derives bbox from TextItem transform", () => {
    const box = textItemToWordBox(
      {
        str: "WX65VMH",
        transform: [12, 0, 0, 12, 100, 700],
        width: 48,
        height: 12,
      },
      1
    );
    expect(box).not.toBeNull();
    expect(box!.text).toBe("WX65VMH");
    expect(box!.x).toBe(100);
    expect(box!.y).toBe(700);
    expect(box!.width).toBe(48);
    expect(box!.page).toBe(1);
  });

  it("extractEmbeddedPdfText returns pageLayouts + words", async () => {
    const result = await extractEmbeddedPdfText(Buffer.from(MINIMAL_TEXT_PDF));
    expect(result.success).toBe(true);
    expect(result.pageLayouts.length).toBe(1);
    expect(result.words.length).toBeGreaterThan(0);
    expect(result.fullText.toLowerCase()).toContain("job summary");
  });
});

describe("grounded date gate (PX-103)", () => {
  const prev = process.env[FEATURE_FIELD_VOTE];

  it("dateValueAppearsInText + label near value", () => {
    expect(dateValueAppearsInText("16/07/2026", RUN011_TEXT)).toBe(true);
    expect(dateLabelNearValue("16/07/2026", RUN011_TEXT, "date")).toBe(true);
    expect(
      dateValueAppearsInText(RUN011_GT.ungroundedDateMustAbstain, RUN011_TEXT)
    ).toBe(false);
    expect(
      dateLabelNearValue(
        RUN011_GT.ungroundedDateMustAbstain,
        RUN011_TEXT,
        "date"
      )
    ).toBe(false);
  });

  it("abstains when vote promotes ungrounded date @ high confidence", () => {
    const vote = voteField("dateOfService", [
      {
        engine: "ensemble",
        fieldId: "dateOfService",
        value: RUN011_GT.ungroundedDateMustAbstain,
        confidence: 1,
        evidenceStrength: "strong",
      },
    ]);
    expect(vote.abstained).toBe(false); // single-engine would promote without gate
    const gated = applyGroundedDateGateToVote(vote, RUN011_TEXT);
    expect(gated.abstained).toBe(true);
    expect(gated.value).toBeNull();
    expect(gated.reasonCode).toBe("UNGROUNDED_DATE");
    expect(gated.fallbackValue).toBe(RUN011_GT.ungroundedDateMustAbstain);
  });

  it("allows grounded Date: value from text layer", () => {
    process.env[FEATURE_FIELD_VOTE] = "true";
    try {
      const result = applyFieldVote({
        force: true,
        textLayer: {
          date: { value: "16/07/2026", confidence: 98, pageNumber: 1 },
          dateOfService: { value: "16/07/2026", confidence: 98, pageNumber: 1 },
        },
        primary: {
          date: { value: "23/07/2024", confidence: 100, pageNumber: 1 },
        },
        sourceText: RUN011_TEXT,
      });
      expect(result.votedFields.date?.value).toBe("16/07/2026");
      expect(result.votedFields.dateOfService?.value).toBe("16/07/2026");
      // Ungrounded 23/07/2024 must not win
      expect(result.votedFields.date?.value).not.toBe("23/07/2024");
    } finally {
      if (prev === undefined) delete process.env[FEATURE_FIELD_VOTE];
      else process.env[FEATURE_FIELD_VOTE] = prev;
    }
  });

  it("applyFieldVote abstains when only ungrounded date candidates exist", () => {
    const result = applyFieldVote({
      force: true,
      primary: {
        date: { value: "23/07/2024", confidence: 100, pageNumber: 1 },
        dateOfService: { value: "23/07/2024", confidence: 100, pageNumber: 1 },
      },
      sourceText: RUN011_TEXT,
    });
    expect(result.votedFields.date).toBeUndefined();
    expect(result.votedFields.dateOfService).toBeUndefined();
    expect(result.batch?.fields.date?.reasonCode).toBe("ABSTAIN");
  });
});

describe("documentProcessor Stage 1 invert wiring", () => {
  const dpPath = path.resolve(__dirname, "../../services/documentProcessor.ts");
  const dp = fs.readFileSync(dpPath, "utf-8");

  it("classifies text layer before Mistral and can skip primary OCR", () => {
    expect(dp).toContain("extractTextLayerFromUrl");
    expect(dp).toContain("Text Layer Classification");
    expect(dp).toContain("skipPrimaryOcr");
    expect(dp).toContain("SKIPPED_TEXT_LAYER");
    expect(dp).toContain("synthesizeOcrResultFromTextLayer");
    const classifyIdx = dp.indexOf("Text Layer Classification");
    const ocrIdx = dp.indexOf('stage: "OCR Text Extraction"');
    expect(classifyIdx).toBeGreaterThan(-1);
    expect(ocrIdx).toBeGreaterThan(classifyIdx);
  });

  it("stamps logical documentStrategy text_layer and maps DB enum", () => {
    expect(dp).toContain("documentStrategyLogical");
    expect(dp).toContain("toDbDocumentStrategy");
    expect(dp).toContain("documentStrategy: documentStrategyLogical");
  });

  it("wires grounded date gate sourceText into field vote", () => {
    expect(dp).toContain("sourceText: extractedText");
    expect(dp).toContain("textLayer: Object.keys(textLayerPreExtracted)");
  });

  it("retires post-OCR enrichWithEmbeddedPdfText as Stage 1 digital gate", () => {
    expect(dp).not.toContain("enrichWithEmbeddedPdfText");
  });
});

describe("synthesizeOcrResultFromTextLayer", () => {
  it("builds pipeline-compatible pages with text_layer provider", () => {
    const syn = synthesizeOcrResultFromTextLayer(["page one", "page two"]);
    expect(syn.success).toBe(true);
    expect(syn.provider).toBe("text_layer");
    expect(syn.totalPages).toBe(2);
    expect(syn.pages[0].markdown).toBe("page one");
    expect(
      usableTextLength(syn.pages.map(p => p.markdown).join("\n"))
    ).toBeGreaterThan(0);
  });
});
