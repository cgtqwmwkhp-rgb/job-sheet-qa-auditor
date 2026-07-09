/**
 * Hold-queue SLA clock evaluation (Phase 3.x)
 */

import type { HoldItem, SlaStatus } from "./types";

const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_SLA_BY_SEVERITY: Record<string, number> = {
  S0: 4 * HOUR_MS,
  S1: 8 * HOUR_MS,
  S2: 24 * HOUR_MS,
  S3: 72 * HOUR_MS,
  unknown: 48 * HOUR_MS,
};

export interface EvaluateHoldSlaOptions {
  now?: Date;
  slaBySeverity?: Record<string, number>;
}

function resolveOpenedAtMs(openedAt: string | Date): number {
  if (openedAt instanceof Date) {
    return openedAt.getTime();
  }
  return new Date(openedAt).getTime();
}

function resolveDeadlineMs(
  severity: string | undefined,
  slaBySeverity: Record<string, number>
): number {
  if (severity !== undefined && severity in slaBySeverity) {
    return slaBySeverity[severity]!;
  }
  return slaBySeverity.unknown ?? 48 * HOUR_MS;
}

export function evaluateHoldSla(
  item: HoldItem,
  opts?: EvaluateHoldSlaOptions
): SlaStatus {
  const now = opts?.now ?? new Date();
  const slaBySeverity = opts?.slaBySeverity ?? DEFAULT_SLA_BY_SEVERITY;
  const openedAtMs = resolveOpenedAtMs(item.openedAt);
  const ageMs = Math.max(0, now.getTime() - openedAtMs);
  const deadlineMs = resolveDeadlineMs(item.severity, slaBySeverity);
  const breached = ageMs > deadlineMs;

  return {
    id: item.id,
    ageMs,
    breached,
    deadlineMs,
  };
}
