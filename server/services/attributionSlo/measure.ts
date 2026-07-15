/**
 * Technician attribution SLO measurement (Wave-4 A3)
 */

import {
  ATTRIBUTION_MAX_UNATTRIBUTED_RATE,
  ATTRIBUTION_MIN_SHEETS,
  type AttributionCohortInput,
  type AttributionSloOptions,
  type AttributionSloResult,
} from "./types";

/**
 * Evaluate unattributed-sheet rate against the attribution SLO.
 *
 * Returns unavailable (not fail) when sheet count is below readiness.
 */
export function evaluateAttributionSlo(
  input: AttributionCohortInput,
  opts: AttributionSloOptions = {}
): AttributionSloResult {
  const maxUnattributedRate =
    opts.maxUnattributedRate ?? ATTRIBUTION_MAX_UNATTRIBUTED_RATE;
  const minSheetsRequired = opts.minSheetsRequired ?? ATTRIBUTION_MIN_SHEETS;

  const totalSheets = Math.max(0, Math.floor(input.totalSheets));
  const unattributedSheets = Math.max(
    0,
    Math.min(totalSheets, Math.floor(input.unattributedSheets))
  );
  const attributedSheets = totalSheets - unattributedSheets;
  const rate = totalSheets === 0 ? 0 : unattributedSheets / totalSheets;
  const measurementReady = totalSheets >= minSheetsRequired;

  if (!measurementReady) {
    return {
      status: "unavailable",
      metrics: {
        totalSheets,
        unattributedSheets,
        attributedSheets,
        unattributedRate: null,
        minSheetsRequired,
        measurementReady: false,
        provisionalUnattributedRate: rate,
        note:
          totalSheets === 0
            ? "No processed sheets; attribution SLO cannot be measured."
            : `Accumulating sheets toward attribution SLO readiness (${totalSheets}/${minSheetsRequired}).`,
      },
      maxUnattributedRate,
      blockers: [
        totalSheets === 0
          ? "Attribution SLO unavailable: no processed sheets."
          : `Attribution SLO unavailable: need ≥${minSheetsRequired} sheets (have ${totalSheets}).`,
      ],
    };
  }

  if (rate - 1e-12 > maxUnattributedRate) {
    return {
      status: "fail",
      metrics: {
        totalSheets,
        unattributedSheets,
        attributedSheets,
        unattributedRate: rate,
        minSheetsRequired,
        measurementReady: true,
      },
      maxUnattributedRate,
      blockers: [
        `Unattributed rate ${(rate * 100).toFixed(2)}% exceeds max ${(maxUnattributedRate * 100).toFixed(2)}%.`,
      ],
    };
  }

  return {
    status: "pass",
    metrics: {
      totalSheets,
      unattributedSheets,
      attributedSheets,
      unattributedRate: rate,
      minSheetsRequired,
      measurementReady: true,
    },
    maxUnattributedRate,
    blockers: [],
  };
}
