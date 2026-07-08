/**
 * Retake feedback helpers for the Image QA intake gate.
 *
 * Maps page-level quality flags to short, actionable retake hints.
 * Deterministic: same metrics → same messages in stable order.
 */

import type { PageQualityMetrics } from "./types";

const RETAKE_MESSAGES = {
  blurry: "Hold the camera steady and ensure the document is in focus.",
  lowContrast: "Improve lighting — avoid glare and heavy shadows.",
  skewed: "Align the document squarely in the frame to reduce skew.",
  overexposed: "Reduce brightness or move away from direct light.",
  underexposed: "Increase lighting so all text is clearly visible.",
} as const;

/**
 * Build actionable retake feedback from page quality metrics.
 */
export function buildRetakeFeedback(
  pageMetrics: PageQualityMetrics[]
): string[] {
  const feedback = new Set<string>();

  for (const page of pageMetrics) {
    if (page.isBlurry) feedback.add(RETAKE_MESSAGES.blurry);
    if (page.isLowContrast) feedback.add(RETAKE_MESSAGES.lowContrast);
    if (page.isSkewed) feedback.add(RETAKE_MESSAGES.skewed);
    if (page.isOverexposed) feedback.add(RETAKE_MESSAGES.overexposed);
    if (page.isUnderexposed) feedback.add(RETAKE_MESSAGES.underexposed);
  }

  // Stable order matching severity / common retake priority
  const order = [
    RETAKE_MESSAGES.blurry,
    RETAKE_MESSAGES.lowContrast,
    RETAKE_MESSAGES.skewed,
    RETAKE_MESSAGES.overexposed,
    RETAKE_MESSAGES.underexposed,
  ];

  return order.filter(msg => feedback.has(msg));
}
