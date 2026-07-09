import type { CircuitSnapshot } from "./types";

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Record a provider failure — opens the circuit when failures reach threshold.
 */
export function recordFailure(
  snap: CircuitSnapshot,
  opts?: { threshold?: number; now?: number }
): CircuitSnapshot {
  const threshold = opts?.threshold ?? DEFAULT_FAILURE_THRESHOLD;
  const now = opts?.now ?? Date.now();
  const failures = snap.failures + 1;

  if (failures >= threshold) {
    return {
      state: "open",
      failures,
      openedAt: snap.openedAt ?? now,
    };
  }

  return { ...snap, failures };
}

/**
 * Record a provider success — resets the circuit to closed with zero failures.
 */
export function recordSuccess(_snap: CircuitSnapshot): CircuitSnapshot {
  return { state: "closed", failures: 0 };
}

/**
 * Whether a request may proceed — false while open and within cooldown.
 * Cooldown-elapsed open circuits are allowed (half-open probe semantics).
 */
export function canRequest(
  snap: CircuitSnapshot,
  opts?: { cooldownMs?: number; now?: number }
): boolean {
  const cooldownMs = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = opts?.now ?? Date.now();

  if (snap.state === "closed" || snap.state === "half_open") {
    return true;
  }

  if (snap.openedAt === undefined) {
    return true;
  }

  return now - snap.openedAt >= cooldownMs;
}
