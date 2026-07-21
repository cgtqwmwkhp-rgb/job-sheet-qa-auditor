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
  PAGE_DIGITAL_MIN_CHARS,
} from "../../services/textLayerExtraction";
import {
  extractEmbeddedPdfText,
  textItemToWordBox,
  usableTextLength,
  type EmbeddedPdfTextResult,
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
