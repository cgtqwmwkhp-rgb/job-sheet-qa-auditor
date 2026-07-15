/**
 * Technician attribution SLO (Wave-4 A3)
 *
 * Feature flag (default OFF for processor artifact emission):
 * - FEATURE_ATTRIBUTION_SLO=true → attach measurement artifact when wired
 */

export const FEATURE_FLAG = "FEATURE_ATTRIBUTION_SLO";

export function isAttributionSloEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { evaluateAttributionSlo } from "./measure";
