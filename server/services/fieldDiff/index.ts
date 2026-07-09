/**
 * Field correction diff module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_FIELD_DIFF=true → enable field diff in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_FIELD_DIFF";

export function isFieldDiffEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { diffFields } from "./diff";
