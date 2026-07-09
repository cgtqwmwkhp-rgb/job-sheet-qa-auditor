/**
 * Human sampling policy module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_SAMPLING_POLICY=true → enable sampling in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_SAMPLING_POLICY";

export function isSamplingPolicyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export {
  decideSampling,
  DEFAULT_BASE_RATE,
  DEFAULT_LOW_CONFIDENCE_RATE,
  DEFAULT_LOW_CONFIDENCE_THRESHOLD,
} from "./policy";
