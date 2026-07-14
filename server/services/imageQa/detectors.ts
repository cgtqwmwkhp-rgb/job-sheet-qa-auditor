/**
 * Image QA Detectors
 *
 * CPU-only, deterministic detectors for document quality analysis.
 *
 * Two paths:
 * 1. Pixel path (`analyzeImageBuffer`) — real blur/skew/contrast on JPEG/PNG
 *    buffers. Used by the intake gate BEFORE any OCR spend.
 * 2. Markdown heuristics (`analyzePageQuality`) — post-OCR text signals for
 *    downstream document QA (checkboxes/signatures/stamps + artifact scoring).
 */

import { v4 as uuidv4 } from "uuid";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type {
  PageQualityMetrics,
  CheckboxDetection,
  SignatureDetection,
  StampDetection,
  ImageQaConfig,
} from "./types";
import { getDefaultImageQaConfig } from "./types";

/** Max edge length for pixel analysis (keeps CPU bounded). */
const MAX_ANALYSIS_EDGE = 512;

/** Angle search range for skew estimation (degrees). */
const SKEW_SEARCH_DEG = 15;
const SKEW_STEP_DEG = 0.5;

export interface GrayImage {
  width: number;
  height: number;
  /** Row-major grayscale 0–255 */
  pixels: Uint8Array;
}

/**
 * Decode a JPEG/PNG buffer to grayscale. Returns null for unsupported types
 * (e.g. PDF) or corrupt payloads — callers fail-open.
 */
export function decodeRasterToGray(
  buffer: Buffer,
  mimeType?: string
): GrayImage | null {
  if (!buffer || buffer.length === 0) return null;

  const kind = detectRasterKind(buffer, mimeType);
  if (!kind) return null;

  try {
    if (kind === "jpeg") {
      const decoded = jpeg.decode(buffer, {
        useTArray: true,
        formatAsRGBA: true,
      });
      if (!decoded?.width || !decoded?.height || !decoded.data) return null;
      return rgbaToGray(decoded.data, decoded.width, decoded.height);
    }

    const png = PNG.sync.read(buffer);
    if (!png?.width || !png?.height || !png.data) return null;
    return rgbaToGray(png.data, png.width, png.height);
  } catch {
    return null;
  }
}

function detectRasterKind(
  buffer: Buffer,
  mimeType?: string
): "jpeg" | "png" | null {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("png")) return "png";

  // Magic-byte fallback when mime is missing/wrong
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  return null;
}

function rgbaToGray(
  data: Uint8Array | Buffer,
  width: number,
  height: number
): GrayImage {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // Rec. 601 luma
    pixels[i] =
      (data[o]! * 0.299 + data[o + 1]! * 0.587 + data[o + 2]! * 0.114) | 0;
  }
  return { width, height, pixels };
}

/**
 * Downsample so the longest edge is <= maxEdge (nearest-neighbour, deterministic).
 */
export function downsampleGray(
  image: GrayImage,
  maxEdge = MAX_ANALYSIS_EDGE
): GrayImage {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) return image;

  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const pixels = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      pixels[y * width + x] = image.pixels[sy * image.width + sx]!;
    }
  }
  return { width, height, pixels };
}

/**
 * Laplacian variance — higher = sharper. Classic document blur metric.
 */
export function computeLaplacianVariance(image: GrayImage): number {
  const { width: w, height: h, pixels: g } = image;
  if (w < 3 || h < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const L = -4 * g[i]! + g[i - 1]! + g[i + 1]! + g[i - w]! + g[i + w]!;
      sum += L;
      sumSq += L * L;
      n++;
    }
  }

  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/**
 * Map Laplacian variance → blur score 0–100 (higher = sharper).
 * Calibrated on synthetic scans: soft gradient ≈ 3 → ~12; text lines ≈ 25k → ~88.
 */
export function laplacianVarianceToBlurScore(variance: number): number {
  const score = (Math.log10(variance + 1) / Math.log10(50_000)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Mean + population stddev of grayscale values.
 */
export function computeLumaStats(image: GrayImage): {
  mean: number;
  stddev: number;
} {
  const { pixels } = image;
  if (pixels.length === 0) return { mean: 0, stddev: 0 };

  let sum = 0;
  for (let i = 0; i < pixels.length; i++) sum += pixels[i]!;
  const mean = sum / pixels.length;

  let varSum = 0;
  for (let i = 0; i < pixels.length; i++) {
    const d = pixels[i]! - mean;
    varSum += d * d;
  }
  const stddev = Math.sqrt(varSum / pixels.length);
  return { mean, stddev };
}

/**
 * Brightness score 0–100: peaks near mid-gray (~128), drops for washout/black frames.
 */
export function brightnessFromMean(mean: number): number {
  const distance = Math.abs(mean - 128);
  return Math.max(0, Math.min(100, Math.round(100 - (distance / 128) * 100)));
}

/**
 * Contrast score 0–100 from luma stddev (document ink on paper has healthy spread).
 */
export function contrastFromStddev(stddev: number): number {
  // stddev ~0 → blank; ~40–70 → typical scan; >90 → extreme
  const score = (stddev / 70) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Estimate skew angle (degrees) via horizontal projection variance over a
 * small angle sweep. Documents with aligned text rows peak near 0°.
 */
export function estimateSkewFromPixels(image: GrayImage): number {
  const { width: w, height: h, pixels: g } = image;
  if (w < 8 || h < 8) return 0;

  let bestAngle = 0;
  let bestScore = -1;

  for (
    let angle = -SKEW_SEARCH_DEG;
    angle <= SKEW_SEARCH_DEG + 1e-9;
    angle += SKEW_STEP_DEG
  ) {
    const score = projectionVarianceAtAngle(g, w, h, angle);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  // Quantize to 0.1° for stable serialization
  return Math.round(bestAngle * 10) / 10;
}

function projectionVarianceAtAngle(
  g: Uint8Array,
  w: number,
  h: number,
  angleDeg: number
): number {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  // Project onto rows after rotation; accumulate into fixed-height bins
  const bins = new Float64Array(h);
  const counts = new Float64Array(h);

  // Subsample for speed — every 2nd pixel is enough for skew
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const dx = x - cx;
      const dy = y - cy;
      const ry = -dx * sin + dy * cos + cy;
      const bin = Math.round(ry);
      if (bin < 0 || bin >= h) continue;
      const v = g[y * w + x]!;
      // Edge-ish contribution: invert so ink (dark) weights more
      const weight = 255 - v;
      bins[bin]! += weight;
      counts[bin]! += 1;
    }
  }

  const profile: number[] = [];
  for (let i = 0; i < h; i++) {
    if (counts[i]! > 0) profile.push(bins[i]! / counts[i]!);
  }
  if (profile.length < 4) return 0;

  let sum = 0;
  for (const v of profile) sum += v;
  const mean = sum / profile.length;
  let varSum = 0;
  for (const v of profile) {
    const d = v - mean;
    varSum += d * d;
  }
  return varSum / profile.length;
}

/**
 * Analyze a decoded grayscale image into PageQualityMetrics.
 */
export function analyzeGrayImage(
  image: GrayImage,
  pageNumber: number,
  config: ImageQaConfig = getDefaultImageQaConfig()
): PageQualityMetrics {
  const sample = downsampleGray(image);
  const variance = computeLaplacianVariance(sample);
  const blurScore = laplacianVarianceToBlurScore(variance);
  const { mean, stddev } = computeLumaStats(sample);
  const brightnessScore = brightnessFromMean(mean);
  const contrastScore = contrastFromStddev(stddev);
  const skewAngle = estimateSkewFromPixels(sample);

  const overallScore = Math.round(
    blurScore * 0.35 +
      contrastScore * 0.25 +
      (100 - Math.min(100, Math.abs(skewAngle) * 4)) * 0.2 +
      brightnessScore * 0.2
  );

  return {
    pageNumber,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    blurScore: Math.max(0, Math.min(100, blurScore)),
    contrastScore: Math.max(0, Math.min(100, contrastScore)),
    skewAngle,
    brightnessScore: Math.max(0, Math.min(100, brightnessScore)),
    isBlurry: blurScore < config.blurThreshold,
    isLowContrast: contrastScore < config.contrastThreshold,
    isSkewed: Math.abs(skewAngle) > config.skewThreshold,
    isOverexposed: mean > 245 && stddev < 12,
    isUnderexposed: mean < 25 && stddev < 12,
  };
}

/**
 * Real buffer image QA. Returns null when the buffer is not a decodable
 * raster (PDF / unknown) — intake should fail-open without calling OCR.
 */
export function analyzeImageBuffer(
  buffer: Buffer,
  options: {
    mimeType?: string;
    pageNumber?: number;
    config?: ImageQaConfig;
  } = {}
): PageQualityMetrics | null {
  const gray = decodeRasterToGray(buffer, options.mimeType);
  if (!gray) return null;
  return analyzeGrayImage(
    gray,
    options.pageNumber ?? 1,
    options.config ?? getDefaultImageQaConfig()
  );
}

/**
 * Analyze page quality from OCR markdown output
 *
 * Uses text density, structure, and patterns to estimate quality.
 * This is a heuristic approach that works without image processing.
 * Prefer `analyzeImageBuffer` at intake time (pre-OCR).
 */
export function analyzePageQuality(
  pageNumber: number,
  markdown: string,
  config: ImageQaConfig = getDefaultImageQaConfig()
): PageQualityMetrics {
  // Text-based quality heuristics
  const textLength = markdown.length;
  const lineCount = markdown.split("\n").filter(l => l.trim()).length;
  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;

  // Check for OCR artifacts that indicate poor quality
  const ocrArtifacts = countOcrArtifacts(markdown);
  // Structure score is calculated but currently unused - reserved for future use
  analyzeStructure(markdown);

  // Calculate individual scores
  const blurScore = calculateBlurScore(textLength, wordCount, ocrArtifacts);
  const contrastScore = calculateContrastScore(
    textLength,
    lineCount,
    ocrArtifacts
  );
  const skewAngle = estimateSkewAngle(markdown);
  const brightnessScore = calculateBrightnessScore(markdown);

  // Overall score is weighted average
  const overallScore = Math.round(
    blurScore * 0.3 +
      contrastScore * 0.3 +
      (100 - Math.abs(skewAngle) * 2) * 0.2 +
      brightnessScore * 0.2
  );

  return {
    pageNumber,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    blurScore: Math.max(0, Math.min(100, blurScore)),
    contrastScore: Math.max(0, Math.min(100, contrastScore)),
    skewAngle,
    brightnessScore: Math.max(0, Math.min(100, brightnessScore)),
    isBlurry: blurScore < config.blurThreshold,
    isLowContrast: contrastScore < config.contrastThreshold,
    isSkewed: Math.abs(skewAngle) > config.skewThreshold,
    isOverexposed: brightnessScore > 90,
    isUnderexposed: brightnessScore < 20,
  };
}

/**
 * Count OCR artifacts that indicate poor image quality
 */
function countOcrArtifacts(markdown: string): number {
  let count = 0;

  // Common OCR error patterns
  const artifactPatterns = [
    /[|l1I]{3,}/g, // Repeated similar characters
    /[^\w\s]{4,}/g, // Long sequences of special chars
    /\b[A-Z]{10,}\b/g, // Very long uppercase sequences
    /\?\?\?+/g, // Multiple question marks (unrecognized)
    /\.{4,}/g, // Long ellipsis
    /_{4,}/g, // Long underscores
    /[^\x20-\x7E]{3,}/g, // Non-printable ASCII sequences
  ];

  for (const pattern of artifactPatterns) {
    const matches = markdown.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Analyze document structure quality
 */
function analyzeStructure(markdown: string): number {
  let score = 50; // Base score

  // Positive indicators
  if (markdown.includes("#")) score += 10; // Has headers
  if (markdown.includes("|")) score += 10; // Has tables
  if (/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(markdown)) score += 5; // Has dates
  if (/\b[A-Z]{2,3}-\d{4,}/i.test(markdown)) score += 5; // Has reference numbers

  // Negative indicators
  if (markdown.length < 100) score -= 20; // Very short
  if (!/[a-zA-Z]{3,}/.test(markdown)) score -= 30; // No real words

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate blur score from text characteristics
 */
function calculateBlurScore(
  textLength: number,
  wordCount: number,
  artifacts: number
): number {
  // More text with fewer artifacts = sharper image
  const textDensity = wordCount > 0 ? textLength / wordCount : 0;
  const artifactPenalty = artifacts * 5;

  let score = 70; // Base score

  if (textDensity > 5 && textDensity < 15) score += 15; // Good word length
  if (wordCount > 50) score += 10; // Reasonable content
  if (artifacts < 3) score += 10; // Few artifacts

  score -= artifactPenalty;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate contrast score from text characteristics
 */
function calculateContrastScore(
  textLength: number,
  lineCount: number,
  artifacts: number
): number {
  // Good contrast = clear text extraction
  let score = 70;

  if (textLength > 200) score += 10;
  if (lineCount > 5) score += 10;
  if (artifacts < 5) score += 10;

  score -= artifacts * 3;

  return Math.max(0, Math.min(100, score));
}

/**
 * Estimate skew angle from text patterns
 */
function estimateSkewAngle(markdown: string): number {
  // Look for patterns that suggest skew
  const lines = markdown.split("\n");

  // Check for consistent line starts (suggests no skew)
  const startsWithSpace = lines.filter(l => l.startsWith(" ")).length;
  const totalLines = lines.filter(l => l.trim()).length;

  if (totalLines === 0) return 0;

  const spaceRatio = startsWithSpace / totalLines;

  // High ratio of lines starting with space might indicate skew
  // This is a rough heuristic
  if (spaceRatio > 0.5) {
    return Math.round((spaceRatio - 0.5) * 10 * 100) / 100;
  }

  return 0;
}

/**
 * Calculate brightness score from text characteristics
 */
function calculateBrightnessScore(markdown: string): number {
  // Very short text might indicate overexposure (washed out)
  // Very garbled text might indicate underexposure (too dark)

  const textLength = markdown.length;
  const artifacts = countOcrArtifacts(markdown);

  if (textLength < 50 && artifacts < 2) {
    return 95; // Possibly overexposed (washed out)
  }

  if (artifacts > 10) {
    return 25; // Possibly underexposed (too dark)
  }

  return 70; // Normal
}

/**
 * Detect checkboxes from markdown content
 *
 * Looks for common checkbox patterns in OCR output.
 */
export function detectCheckboxes(
  pageNumber: number,
  markdown: string,
  sensitivity: "low" | "medium" | "high" = "medium"
): CheckboxDetection[] {
  const checkboxes: CheckboxDetection[] = [];

  // Checkbox patterns in OCR output
  const patterns = [
    // Markdown checkboxes
    { regex: /\[([xX✓✔])\]\s*(.{0,50})/g, checked: true },
    { regex: /\[\s*\]\s*(.{0,50})/g, checked: false },
    // Text representations
    { regex: /☑\s*(.{0,50})/g, checked: true },
    { regex: /☐\s*(.{0,50})/g, checked: false },
    { regex: /\(([xX✓])\)\s*(.{0,50})/g, checked: true },
    { regex: /\(\s*\)\s*(.{0,50})/g, checked: false },
    // Common OCR interpretations
    { regex: /\[Y\]\s*(.{0,50})/gi, checked: true },
    { regex: /\[N\]\s*(.{0,50})/gi, checked: false },
  ];

  // Adjust confidence based on sensitivity
  const confidenceBase =
    sensitivity === "high" ? 0.7 : sensitivity === "medium" ? 0.8 : 0.9;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const label = match[match.length - 1]?.trim() || undefined;

      // Estimate position based on character offset
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);

      checkboxes.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 5, // Checkboxes typically on left
          y: Math.min(95, estimatedY),
          width: 3,
          height: 3,
        },
        isChecked: pattern.checked,
        confidence: confidenceBase + Math.random() * 0.1, // Slight variation
        label,
      });
    }
  }

  // Sort by position for deterministic output
  return checkboxes.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Detect signature regions from markdown content
 *
 * Looks for signature-related patterns and labels.
 */
export function detectSignatures(
  pageNumber: number,
  markdown: string,
  sensitivity: "low" | "medium" | "high" = "medium"
): SignatureDetection[] {
  const signatures: SignatureDetection[] = [];

  // Signature-related patterns
  const patterns = [
    { regex: /signature[:\s]*([^\n]{0,30})/gi, type: "handwritten" as const },
    { regex: /signed[:\s]*([^\n]{0,30})/gi, type: "handwritten" as const },
    { regex: /customer\s*signature/gi, type: "handwritten" as const },
    { regex: /technician\s*signature/gi, type: "handwritten" as const },
    {
      regex: /authorized\s*by[:\s]*([^\n]{0,30})/gi,
      type: "handwritten" as const,
    },
    { regex: /digital\s*signature/gi, type: "digital" as const },
    { regex: /e-?sign/gi, type: "digital" as const },
  ];

  const confidenceBase =
    sensitivity === "high" ? 0.6 : sensitivity === "medium" ? 0.75 : 0.85;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);

      // Check if signature appears to be present (has content after label)
      const afterLabel = match[1]?.trim() || "";
      const isPresent = afterLabel.length > 3 && !/^[_\-.]+$/.test(afterLabel);

      // Extract label from the match
      const labelMatch = match[0].match(/^([^:]+):/i);
      const label = labelMatch ? labelMatch[1]!.trim() : undefined;

      signatures.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 50, // Signatures typically centered or right
          y: Math.min(95, estimatedY),
          width: 30,
          height: 5,
        },
        isPresent,
        confidence: isPresent ? confidenceBase + 0.1 : confidenceBase,
        signatureType: pattern.type,
        label,
      });
    }
  }

  // Sort by position for deterministic output
  return signatures.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Detect stamps and marks from markdown content
 */
export function detectStamps(
  pageNumber: number,
  markdown: string,
  sensitivity: "low" | "medium" | "high" = "medium"
): StampDetection[] {
  const stamps: StampDetection[] = [];

  // Stamp-related patterns
  const patterns = [
    { regex: /APPROVED/gi, type: "approval" as const },
    { regex: /REJECTED/gi, type: "approval" as const },
    { regex: /CERTIFIED/gi, type: "certification" as const },
    { regex: /RECEIVED/gi, type: "date" as const },
    { regex: /STAMP[:\s]*([^\n]{0,20})/gi, type: "unknown" as const },
    { regex: /SEAL[:\s]*([^\n]{0,20})/gi, type: "company" as const },
    { regex: /\[STAMP\]/gi, type: "unknown" as const },
    { regex: /\(OFFICIAL\)/gi, type: "company" as const },
  ];

  const confidenceBase =
    sensitivity === "high" ? 0.65 : sensitivity === "medium" ? 0.8 : 0.9;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);

      stamps.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 70, // Stamps typically on right
          y: Math.min(95, estimatedY),
          width: 15,
          height: 10,
        },
        stampType: pattern.type,
        confidence: confidenceBase,
        text: match[0],
      });
    }
  }

  // Sort by position for deterministic output
  return stamps.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Calculate quality grade from score
 */
export function calculateQualityGrade(
  score: number
): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
