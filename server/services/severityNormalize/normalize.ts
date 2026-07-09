import type { CanonicalSeverity } from "./types";

const SEVERITY_MAP: Record<string, CanonicalSeverity> = {
  critical: "S0",
  s0: "S0",
  sev0: "S0",
  high: "S1",
  s1: "S1",
  medium: "S2",
  med: "S2",
  s2: "S2",
  low: "S3",
  s3: "S3",
};

/**
 * Normalize a raw severity string to a canonical label.
 * Case-insensitive; trims surrounding whitespace.
 */
export function normalizeSeverity(raw: string): CanonicalSeverity {
  const key = raw.trim().toLowerCase();
  return SEVERITY_MAP[key] ?? "unknown";
}
