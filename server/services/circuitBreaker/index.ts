/**
 * Provider circuit breaker module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_CIRCUIT_BREAKER=true → enable breaker checks in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_CIRCUIT_BREAKER";

export function isCircuitBreakerEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { recordFailure, recordSuccess, canRequest } from "./breaker";
