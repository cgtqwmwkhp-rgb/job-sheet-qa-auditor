/**
 * ECE measurement readiness (Wave-6 P5)
 *
 * Single source for whether labelled review samples are sufficient to publish ECE.
 */

import { ECE_MIN_SAMPLES } from "./reviewLabels";

export type EceReadinessStatus = "ready" | "insufficient" | "disabled";

export interface EceReadinessDescription {
  ready: boolean;
  minSamples: number;
  labelledCount: number;
  status: EceReadinessStatus;
  note?: string;
}

export function describeEceReadiness(input: {
  labelledCount: number;
  calibrationEnabled?: boolean;
}): EceReadinessDescription {
  const minSamples = ECE_MIN_SAMPLES;
  const labelledCount = Math.max(0, input.labelledCount);
  const calibrationEnabled = input.calibrationEnabled ?? true;

  if (!calibrationEnabled) {
    return {
      ready: false,
      minSamples,
      labelledCount,
      status: "disabled",
      note: "FEATURE_CALIBRATION is off; ECE measurement is not emitted.",
    };
  }

  if (labelledCount >= minSamples) {
    return {
      ready: true,
      minSamples,
      labelledCount,
      status: "ready",
    };
  }

  return {
    ready: false,
    minSamples,
    labelledCount,
    status: "insufficient",
    note:
      labelledCount === 0
        ? "No labelled review samples; ECE cannot be measured."
        : `Accumulating review labels toward ECE readiness (${labelledCount}/${minSamples}).`,
  };
}
