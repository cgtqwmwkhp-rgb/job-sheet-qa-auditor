/**
 * Shadow / champion-challenger module (PR-21 / PR-AI-11)
 *
 * Shadow mode on live traffic; disagreement reporting; pass-rate pp deltas;
 * canary switches. Feature-flagged (FEATURE_SHADOW_CHALLENGER).
 * Measure pp deltas in advisory shadow mode before enabling canary.
 */

export * from "./types";
export * from "./config";
export * from "./compare";
export * from "./evaluate";
export * from "./summary";
export * from "./measurement";
