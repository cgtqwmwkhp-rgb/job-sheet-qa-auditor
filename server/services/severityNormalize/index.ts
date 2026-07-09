/**
 * Severity normalization module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_SEVERITY_NORMALIZE=true → enable normalization in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_SEVERITY_NORMALIZE";

export function isSeverityNormalizeEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { normalizeSeverity } from "./normalize";
