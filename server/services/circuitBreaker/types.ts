/**
 * Provider circuit breaker types (Phase 3.x)
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitSnapshot {
  state: CircuitState;
  failures: number;
  openedAt?: number;
}
