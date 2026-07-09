/**
 * Image QA Intake Gate
 *
 * Runs lightweight quality checks at upload time by OCRing the real upload
 * buffer, then scoring OCR markdown via analyzeDocumentQuality.
 *
 * Fail-open: unexpected errors (including OCR failures) return
 * passed:true + skipped:true.
 *
 * resolveIntakeMarkdownProxy remains available for deterministic unit tests
 * of the fixture map itself — it is not used on the production path.
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ImageQaConfig, IntakeGateInput, IntakeGateResult } from "./types";
import { getDefaultImageQaConfig } from "./types";
import { analyzeDocumentQuality, type OcrPageInput } from "./imageQaService";
import { buildRetakeFeedback } from "./retakeFeedback";
import { extractTextFromBase64 } from "../ocr";

const FEATURE_FLAG = "FEATURE_IMAGE_QA_INTAKE";

/** Filename tokens → fixture basename (under server/tests/fixtures/imageQa/) */
const FILENAME_FIXTURE_MAP: Record<string, string> = {
  "good-scan": "good-scan.md",
  good_scan: "good-scan.md",
  "blurry-scan": "blurry-scan.md",
  blurry_scan: "blurry-scan.md",
  "skewed-scan": "blurry-scan.md",
  skewed_scan: "blurry-scan.md",
  "low-quality": "blurry-scan.md",
  low_quality: "blurry-scan.md",
};

/** Buffer content markers → fixture (for tests that pass fixture bytes) */
const CONTENT_MARKERS: Array<{ needle: string; fixture: string }> = [
  { needle: "JS-2024-001", fixture: "good-scan.md" },
  { needle: "|||ll11IIl|||", fixture: "blurry-scan.md" },
];

function resolveFixtureDir(): string {
  // Prefer repo-relative path from this file (works in vitest + tsx)
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidate = join(here, "../../tests/fixtures/imageQa");
    if (existsSync(candidate)) return candidate;
  } catch {
    // import.meta may be unavailable in some CJS contexts
  }
  return join(process.cwd(), "server/tests/fixtures/imageQa");
}

function loadFixtureMarkdown(fixtureName: string): string {
  const path = join(resolveFixtureDir(), fixtureName);
  return readFileSync(path, "utf8");
}

/**
 * Deterministic mock map: filename / buffer → OCR-like markdown pages.
 * Test-only / internal — production intake uses OCR on the real buffer.
 * Never calls getOCRAdapter or extractTextFromBase64.
 */
export function resolveIntakeMarkdownProxy(input: {
  buffer: Buffer;
  fileName: string;
}): OcrPageInput[] {
  const lowerName = input.fileName.toLowerCase();

  for (const [token, fixture] of Object.entries(FILENAME_FIXTURE_MAP)) {
    if (lowerName.includes(token)) {
      return [{ pageNumber: 1, markdown: loadFixtureMarkdown(fixture) }];
    }
  }

  const asText = input.buffer.toString("utf8");
  for (const { needle, fixture } of CONTENT_MARKERS) {
    if (asText.includes(needle)) {
      return [{ pageNumber: 1, markdown: loadFixtureMarkdown(fixture) }];
    }
  }

  // Hash-stable fallback: even-hash → good, odd-hash → blurry
  const hash = createHash("sha256").update(input.buffer).digest();
  const fixture = hash[0]! % 2 === 0 ? "good-scan.md" : "blurry-scan.md";
  return [{ pageNumber: 1, markdown: loadFixtureMarkdown(fixture) }];
}

export function isImageQaIntakeEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

function failOpenResult(reason: string): IntakeGateResult {
  return {
    passed: true,
    skipped: true,
    qualityScore: null,
    grade: null,
    retakeFeedback: [],
    requiresReview: false,
    reviewReasons: [],
    error: reason,
  };
}

/**
 * OCR the upload buffer and map pages to OcrPageInput[].
 * Throws / returns empty on failure — caller fail-opens.
 */
async function resolveIntakePagesFromBuffer(input: {
  buffer: Buffer;
  mimeType?: string;
}): Promise<OcrPageInput[]> {
  const ocrResult = await extractTextFromBase64(
    input.buffer.toString("base64"),
    input.mimeType || "application/pdf"
  );

  if (!ocrResult.success) {
    throw new Error(ocrResult.error || "OCR extraction failed");
  }

  if (!ocrResult.pages || ocrResult.pages.length === 0) {
    throw new Error("OCR returned no pages");
  }

  return ocrResult.pages.map(page => ({
    pageNumber: page.pageNumber,
    markdown: page.markdown ?? "",
  }));
}

/**
 * Run the intake quality gate on the real upload buffer via OCR.
 * Never throws — fail-open on OCR or analysis errors.
 */
export async function runIntakeGate(
  input: IntakeGateInput,
  config: ImageQaConfig = getDefaultImageQaConfig()
): Promise<IntakeGateResult> {
  try {
    if (!input.buffer || input.buffer.length === 0) {
      return failOpenResult("Empty buffer — intake gate skipped");
    }

    const pages = await resolveIntakePagesFromBuffer({
      buffer: input.buffer,
      mimeType: input.mimeType,
    });

    const documentId =
      input.documentId ||
      createHash("sha256")
        .update(input.buffer)
        .update(input.fileName || "")
        .digest("hex")
        .slice(0, 16);

    const qaResult = analyzeDocumentQuality(documentId, pages, config);
    const threshold = config.reviewQualityThreshold;
    const qualityScore = qaResult.documentQuality.overallScore;
    const passed = qaResult.success && qualityScore >= threshold;
    const retakeFeedback = passed
      ? []
      : buildRetakeFeedback(qaResult.pageMetrics);

    return {
      passed,
      skipped: false,
      qualityScore,
      grade: qaResult.documentQuality.qualityGrade,
      retakeFeedback,
      requiresReview: qaResult.documentQuality.requiresReview,
      reviewReasons: qaResult.documentQuality.reviewReasons,
      pageMetrics: qaResult.pageMetrics,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown intake gate error";
    return failOpenResult(message);
  }
}
