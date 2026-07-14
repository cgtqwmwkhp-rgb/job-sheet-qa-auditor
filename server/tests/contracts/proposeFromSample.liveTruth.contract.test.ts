import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/ocr", () => ({
  extractTextFromDocument: vi.fn(),
}));

vi.mock(
  "../../services/ocrAdapter/azureDocumentIntelligenceAdapter",
  () => ({
    extractLayoutSelectionMarks: vi.fn(),
  })
);

vi.mock("../../services/templateStudio/sampleStore", () => ({
  getStudioSampleUrl: vi.fn(),
}));

import { extractTextFromDocument } from "../../services/ocr";
import { extractLayoutSelectionMarks } from "../../services/ocrAdapter/azureDocumentIntelligenceAdapter";
import { getStudioSampleUrl } from "../../services/templateStudio/sampleStore";
import { proposeFromSample } from "../../services/templateStudio/proposeFromSample";

describe("proposeFromSample live-engine unity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "");
  });

  it("uses live OCR text for fields and Azure geometry for ROIs", async () => {
    vi.mocked(getStudioSampleUrl).mockResolvedValue({
      url: "https://example.test/sample.pdf",
      meta: {
        versionId: 42,
        fileName: "sample.pdf",
        fileType: "application/pdf",
        fileKey: "studio/42/sample.pdf",
        fileHash: "abc",
        uploadedBy: 1,
        uploadedAt: new Date().toISOString(),
      },
    });

    vi.mocked(extractTextFromDocument).mockResolvedValue({
      success: true,
      pages: [
        {
          pageNumber: 1,
          markdown:
            "Job Summary Report\nJob ID: LIVE-999\nAsset No: A1\nDate: 02/02/2026\n",
        },
      ],
      totalPages: 1,
      model: "mistral-ocr-latest",
      provider: "mistral",
    });

    vi.mocked(extractLayoutSelectionMarks).mockResolvedValue({
      success: true,
      selectionMarks: [],
      lines: [
        {
          pageNumber: 1,
          content: "Job ID",
          xPercent: 55,
          yPercent: 78,
          widthPercent: 8,
          heightPercent: 1.4,
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
          content: "Date:",
          xPercent: 8,
          yPercent: 55,
          widthPercent: 8,
          heightPercent: 1.4,
        },
      ],
      pages: [],
      model: "prebuilt-layout",
      processingTimeMs: 1,
      layoutText: "Azure-only wording that production will not see",
    });

    const proposal = await proposeFromSample({
      versionId: 42,
      templateName: "Live Unity",
    });

    expect(extractTextFromDocument).toHaveBeenCalledWith(
      "https://example.test/sample.pdf"
    );
    expect(extractLayoutSelectionMarks).toHaveBeenCalledWith(
      "https://example.test/sample.pdf"
    );

    expect(proposal.textTruthSource).toBe("live-ocr");
    expect(proposal.textTruthProvider).toBe("mistral");
    expect(proposal.geometrySource).toBe("azure-layout");
    expect(proposal.layoutTextPreview).toContain("LIVE-999");
    expect(proposal.layoutTextPreview).not.toContain(
      "Azure-only wording that production will not see"
    );

    const jobField = proposal.fields.find(
      f => f.field.field === "jobReference"
    );
    expect(jobField?.source).toBe("live-ocr-label");
    expect(jobField?.why).toMatch(/live-ocr/);

    const jobRoi = proposal.roiRegions.find(r => r.name === "jobReference");
    expect(jobRoi).toBeTruthy();
    expect(jobRoi!.source).toBe("ocr-layout");
    expect(jobRoi!.why).toMatch(/live text truth confirmed/i);
    expect(jobRoi!.bounds.y).toBeGreaterThan(0.7);
  });

  it("falls back to Azure layout text when live OCR fails", async () => {
    vi.mocked(getStudioSampleUrl).mockResolvedValue({
      url: "https://example.test/sample.pdf",
      meta: {
        versionId: 42,
        fileName: "sample.pdf",
        fileType: "application/pdf",
        fileKey: "studio/42/sample.pdf",
        fileHash: "abc",
        uploadedBy: 1,
        uploadedAt: new Date().toISOString(),
      },
    });

    vi.mocked(extractTextFromDocument).mockResolvedValue({
      success: false,
      pages: [],
      totalPages: 0,
      model: "mistral-ocr-latest",
      error: "MISTRAL_API_KEY missing",
    });

    vi.mocked(extractLayoutSelectionMarks).mockResolvedValue({
      success: true,
      selectionMarks: [],
      lines: [
        {
          pageNumber: 1,
          content: "Job ID",
          xPercent: 55,
          yPercent: 78,
          widthPercent: 8,
          heightPercent: 1.4,
        },
      ],
      pages: [],
      model: "prebuilt-layout",
      processingTimeMs: 1,
      layoutText: "Job ID AZURE-FALLBACK",
    });

    const proposal = await proposeFromSample({ versionId: 7 });

    expect(proposal.textTruthSource).toBe("azure-layout-fallback");
    expect(proposal.geometrySource).toBe("azure-layout");
    expect(proposal.layoutTextPreview).toContain("AZURE-FALLBACK");
    expect(proposal.layoutError).toMatch(/not production text truth/i);
  });
});
