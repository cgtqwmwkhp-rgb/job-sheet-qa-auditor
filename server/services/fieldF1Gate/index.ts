/**
 * Field exact-match F1 gate (Wave-4 A3)
 *
 * Feature flag (default OFF for processor artifact emission):
 * - FEATURE_FIELD_F1_GATE=true → attach measurement artifact when wired
 *
 * The weekly/CI gate script may run without the flag — measurement is pure.
 */

export const FEATURE_FLAG = "FEATURE_FIELD_F1_GATE";

export function isFieldF1GateEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { measureFieldExactMatchF1 } from "./measure";
export { evaluateFieldF1Gate } from "./gate";
