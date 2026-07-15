/**
 * Technician attribution SLO types (Wave-4 A3)
 *
 * Unattributed processed sheets must stay under a configured rate.
 * Honest unavailable when cohort N is below the readiness threshold.
 */

export type AttributionSloStatus = "pass" | "fail" | "unavailable";

export interface AttributionCohortInput {
  /** Total processed sheets in the measurement window. */
  totalSheets: number;
  /** Sheets with no technicianId attribution. */
  unattributedSheets: number;
}

export interface AttributionSloMetrics {
  totalSheets: number;
  unattributedSheets: number;
  attributedSheets: number;
  unattributedRate: number | null;
  minSheetsRequired: number;
  measurementReady: boolean;
  provisionalUnattributedRate?: number;
  note?: string;
}

export interface AttributionSloResult {
  status: AttributionSloStatus;
  metrics: AttributionSloMetrics;
  maxUnattributedRate: number;
  blockers: string[];
}

export interface AttributionSloOptions {
  maxUnattributedRate?: number;
  minSheetsRequired?: number;
}

/** Default max unattributed share (5%). */
export const ATTRIBUTION_MAX_UNATTRIBUTED_RATE = 0.05;

/** Default minimum sheets before the SLO is measurement-ready. */
export const ATTRIBUTION_MIN_SHEETS = 50;
