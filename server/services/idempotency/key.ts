import { createHash } from "crypto";

/**
 * Build a deterministic idempotency key from a scope and ordered parts.
 *
 * Format: `{scope}:{sha256(parts joined by |).hex.slice(0, 32)}`
 */
export function buildIdempotencyKey(scope: string, parts: string[]): string {
  const trimmedScope = scope.trim();
  if (!trimmedScope) {
    throw new Error("Idempotency scope must not be empty");
  }

  const payload = parts.join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 32);

  return `${trimmedScope}:${hash}`;
}
