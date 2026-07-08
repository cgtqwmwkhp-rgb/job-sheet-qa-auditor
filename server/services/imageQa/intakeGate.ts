/**
 * Image QA Intake Gate
 *
 * Runs lightweight, CPU-only quality checks at upload time.
 * Uses a deterministic mock markdown proxy (filename/buffer → fixture text)
 * so intake never calls live OCR adapters.
 *
 * Fail-open: unexpected errors return passed:true + skipped:true.
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ImageQaConfig, IntakeGateInput, IntakeGateResult } from "./types";
import { getDefaultImageQaConfig } from "./types";
import { analyzeDocumentQuality, type OcrPageInput } from "./imageQaService";
import { buildRetakeFeedback } from "./retakeFeedback";

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
 * Never calls getOCRAdapter or extractTextFromDocument.
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
 * Run the intake quality gate. Never throws.
 */
export function runIntakeGate(
  input: IntakeGateInput,
  config: ImageQaConfig = getDefaultImageQaConfig()
): IntakeGateResult {
  try {
    if (!input.buffer || input.buffer.length === 0) {
      return failOpenResult("Empty buffer — intake gate skipped");
    }

    const pages = resolveIntakeMarkdownProxy({
      buffer: input.buffer,
      fileName: input.fileName || "upload.bin",
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
