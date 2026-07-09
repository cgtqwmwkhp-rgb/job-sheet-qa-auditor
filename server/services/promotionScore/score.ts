/**
 * Promotion readiness scoring (Phase 3.x)
 *
 * Pure penalty-based score from calibration and release signals.
 */

import type { PromotionScore, PromotionSignals } from "./types";

export interface ScorePromotionOptions {
  readyThreshold?: number;
}

const DEFAULT_READY_THRESHOLD = 70;

export function scorePromotion(
  signals: PromotionSignals,
  opts: ScorePromotionOptions = {}
): PromotionScore {
  let score = 100;
  const reasons: string[] = [];

  if (signals.ece !== undefined && signals.ece > 0.1) {
    score -= 20;
    reasons.push(`ECE ${signals.ece} exceeds threshold 0.1 (-20)`);
  }

  if (signals.overturnRate !== undefined && signals.overturnRate > 0.15) {
    score -= 25;
    reasons.push(
      `Overturn rate ${signals.overturnRate} exceeds threshold 0.15 (-25)`
    );
  }

  if (
    signals.shadowAgreementRate !== undefined &&
    signals.shadowAgreementRate < 0.9
  ) {
    score -= 15;
    reasons.push(
      `Shadow agreement rate ${signals.shadowAgreementRate} below threshold 0.9 (-15)`
    );
  }

  if (signals.smokePassRate !== undefined && signals.smokePassRate < 1) {
    score -= 30;
    reasons.push(
      `Smoke pass rate ${signals.smokePassRate} below threshold 1 (-30)`
    );
  }

  const readyThreshold = opts.readyThreshold ?? DEFAULT_READY_THRESHOLD;
  const clampedScore = Math.max(0, Math.min(100, score));

  return {
    score: clampedScore,
    ready: clampedScore >= readyThreshold,
    reasons,
  };
}
