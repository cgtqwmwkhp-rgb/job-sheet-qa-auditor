/**
 * Idempotency key module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_IDEMPOTENCY=true → enable idempotency keys in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_IDEMPOTENCY";

export function isIdempotencyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { buildIdempotencyKey } from "./key";
