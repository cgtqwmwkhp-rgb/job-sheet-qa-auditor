/**
 * Image QA Intake Gate
 *
 * Runs real pixel blur/skew/contrast checks on JPEG/PNG upload buffers
 * BEFORE any OCR spend. Garbage scans are rejected with retake feedback.
 *
 * Fail-open: unexpected errors, empty buffers, or non-raster uploads (PDF)
 * return passed:true + skipped:true — and still never call OCR for quality.
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
import { analyzeImageBuffer, calculateQualityGrade } from "./detectors";
import type { OcrPageInput } from "./imageQaService";
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
 * Test-only / internal — production intake uses pixel analysis on the buffer.
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

function failOpenResult(
  reason: string,
  analysisMethod?: IntakeGateResult["analysisMethod"]
): IntakeGateResult {
  return {
    passed: true,
    skipped: true,
    qualityScore: null,
    grade: null,
    retakeFeedback: [],
    requiresReview: false,
    reviewReasons: [],
    analysisMethod,
    ocrInvoked: false,
    error: reason,
  };
}

/**
 * Run the intake quality gate on the real upload buffer via pixel analysis.
 * Never throws — fail-open on decode/analysis errors.
 * Never invokes OCR (challenge bar: reject garbage before paying OCR).
 */
export async function runIntakeGate(
  input: IntakeGateInput,
  config: ImageQaConfig = getDefaultImageQaConfig()
): Promise<IntakeGateResult> {
  try {
    if (!input.buffer || input.buffer.length === 0) {
      return failOpenResult("Empty buffer — intake gate skipped");
    }

    const metrics = analyzeImageBuffer(input.buffer, {
      mimeType: input.mimeType,
      pageNumber: 1,
      config,
    });

    if (!metrics) {
      // PDF / unknown — cannot measure pixels without a render stack; skip
      // without paying OCR for a fake text-heuristic quality score.
      return failOpenResult(
        "Non-raster upload — pixel intake QA unsupported (no OCR invoked)",
        "unsupported"
      );
    }

    const qualityScore = metrics.overallScore;
    const threshold = config.reviewQualityThreshold;
    const hasHardFlags =
      metrics.isBlurry ||
      metrics.isSkewed ||
      metrics.isLowContrast ||
      metrics.isOverexposed ||
      metrics.isUnderexposed;
    const passed = qualityScore >= threshold && !hasHardFlags;
    const retakeFeedback = passed ? [] : buildRetakeFeedback([metrics]);
    const reviewReasons: string[] = [];
    if (metrics.isBlurry) reviewReasons.push("Image is too blurry");
    if (metrics.isSkewed) reviewReasons.push("Document appears skewed");
    if (metrics.isLowContrast) reviewReasons.push("Low contrast / washed out");
    if (metrics.isOverexposed) reviewReasons.push("Overexposed");
    if (metrics.isUnderexposed) reviewReasons.push("Underexposed");
    if (!passed && reviewReasons.length === 0) {
      reviewReasons.push(`Quality score ${qualityScore} below threshold ${threshold}`);
    }

    return {
      passed,
      skipped: false,
      qualityScore,
      grade: calculateQualityGrade(qualityScore),
      retakeFeedback,
      requiresReview: !passed,
      reviewReasons,
      pageMetrics: [metrics],
      analysisMethod: "pixel",
      ocrInvoked: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown intake gate error";
    return failOpenResult(message);
  }
}
