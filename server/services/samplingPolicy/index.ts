/**
 * Human sampling policy module (Phase 3.x / Wave-4 A3)
 *
 * Feature flag (default OFF):
 * - FEATURE_SAMPLING_POLICY=true → emit PASS sampling artifact from documentProcessor
 */

export const FEATURE_FLAG = "FEATURE_SAMPLING_POLICY";

export function isSamplingPolicyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export {
  decideSampling,
  decidePassSampling,
  evaluatePassSampleMissRate,
  DEFAULT_BASE_RATE,
  DEFAULT_LOW_CONFIDENCE_RATE,
  DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  DEFAULT_PASS_SAMPLE_RATE,
  DEFAULT_MAX_PASS_SAMPLE_MISS_RATE,
  DEFAULT_PASS_SAMPLE_MIN_SAMPLES,
} from "./policy";
