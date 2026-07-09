import type { HoldItem, SlaStatus } from "./types";

const HOUR = 60 * 60 * 1000;

export const DEFAULT_SLA_BY_SEVERITY: Record<string, number> = {
  S0: 4 * HOUR,
  S1: 8 * HOUR,
  S2: 24 * HOUR,
  S3: 72 * HOUR,
  unknown: 48 * HOUR,
};

export function evaluateHoldSla(
  item: HoldItem,
  opts?: {
    now?: Date;
    slaBySeverity?: Record<string, number>;
  }
): SlaStatus {
  const now = opts?.now ?? new Date();
  const slaBySeverity = opts?.slaBySeverity ?? DEFAULT_SLA_BY_SEVERITY;
  const opened =
    item.openedAt instanceof Date ? item.openedAt : new Date(item.openedAt);
  const ageMs = Math.max(0, now.getTime() - opened.getTime());
  const sev = (item.severity ?? "unknown").trim() || "unknown";
  const deadlineMs =
    slaBySeverity[sev] ??
    slaBySeverity.unknown ??
    DEFAULT_SLA_BY_SEVERITY.unknown;
  return {
    id: item.id,
    ageMs,
    deadlineMs,
    breached: ageMs > deadlineMs,
  };
}
