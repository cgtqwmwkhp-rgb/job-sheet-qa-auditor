/**
 * Idempotency key types (Phase 3.x)
 *
 * Pure deterministic key helpers — no jobQueue or processor coupling.
 */

export interface IdempotencyKey {
  key: string;
  scope: string;
}
