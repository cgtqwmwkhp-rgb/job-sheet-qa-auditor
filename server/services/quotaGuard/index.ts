/**
 * API/model quota guard module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_QUOTA_GUARD=true → enable quota checks in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_QUOTA_GUARD";

export function isQuotaGuardEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { checkQuota } from "./guard";
