/**
 * PII redaction module (Phase 3.x)
 *
 * Feature flag (default OFF):
 * - FEATURE_REDACTION=true → enable redaction in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_REDACTION";

export function isRedactionEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { redactPii } from "./redact";
