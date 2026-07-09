/**
 * Pure field correction diff helpers (Phase 3.x)
 *
 * Compares string field maps before and after reviewer correction.
 * No DB, no documentProcessor — safe to unit/contract test in isolation.
 */

import type { FieldDiff } from "./types";

function normalize(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Diff two field maps by union of keys.
 * `changed` is true when trimmed values differ (missing keys treated as "").
 */
export function diffFields(
  before: Record<string, string>,
  after: Record<string, string>
): FieldDiff[] {
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)])
  );

  return keys.sort().map(fieldKey => {
    const beforeVal = before[fieldKey] ?? "";
    const afterVal = after[fieldKey] ?? "";
    const changed = normalize(beforeVal) !== normalize(afterVal);

    return {
      fieldKey,
      before: beforeVal,
      after: afterVal,
      changed,
    };
  });
}
