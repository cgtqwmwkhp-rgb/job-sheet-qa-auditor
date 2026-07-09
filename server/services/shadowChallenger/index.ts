/**
 * Shadow / champion-challenger module (PR-21)
 *
 * Shadow mode on live traffic; disagreement reporting; canary switches.
 * Feature-flagged (FEATURE_SHADOW_CHALLENGER). Mocks-only challenger overnight.
 */

export * from "./types";
export * from "./config";
export * from "./compare";
export * from "./evaluate";
export * from "./summary";
