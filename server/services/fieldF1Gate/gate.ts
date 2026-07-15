/**
 * Field exact-match F1 gate evaluation (Wave-4 A3)
 *
 * Returns unavailable (not fail) when N is insufficient — never greenwash.
 */

import { measureFieldExactMatchF1 } from "./measure";
import {
  FIELD_F1_MIN_SAMPLES,
  FIELD_F1_MIN_SCORE,
  type FieldF1GateOptions,
  type FieldF1GateResult,
  type FieldObservation,
} from "./types";

function selectObservations(
  observations: FieldObservation[],
  criticalOnly: boolean
): FieldObservation[] {
  if (!criticalOnly) return observations;
  return observations.filter(
    obs => obs.severity === "S0" || obs.severity === "S1" || !obs.severity
  );
}

/**
 * Evaluate the field-F1 challenge bar.
 *
 * - unavailable: measurement not ready (insufficient N)
 * - pass: ready and f1 ≥ minExactMatchF1
 * - fail: ready and f1 below floor
 */
export function evaluateFieldF1Gate(
  observations: FieldObservation[],
  opts: FieldF1GateOptions = {}
): FieldF1GateResult {
  const minSamplesRequired = opts.minSamplesRequired ?? FIELD_F1_MIN_SAMPLES;
  const minExactMatchF1 = opts.minExactMatchF1 ?? FIELD_F1_MIN_SCORE;
  const selected = selectObservations(observations, opts.criticalOnly === true);
  const metrics = measureFieldExactMatchF1(selected, minSamplesRequired);

  if (!metrics.measurementReady || metrics.f1 === null) {
    return {
      status: "unavailable",
      metrics,
      minExactMatchF1,
      blockers: [
        metrics.note ??
          `Field-F1 unavailable: need ≥${minSamplesRequired} labelled observations (have ${metrics.sampleCount}).`,
      ],
    };
  }

  if (metrics.f1 + 1e-12 < minExactMatchF1) {
    return {
      status: "fail",
      metrics,
      minExactMatchF1,
      blockers: [
        `Field exact-match F1 ${metrics.f1.toFixed(4)} below floor ${minExactMatchF1}.`,
      ],
    };
  }

  return {
    status: "pass",
    metrics,
    minExactMatchF1,
    blockers: [],
  };
}
