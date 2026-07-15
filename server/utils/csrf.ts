/**
 * CSRF (Cross-Site Request Forgery) Protection
 *
 * Provides CSRF token generation and validation for sensitive mutations.
 * Protects against unauthorized state-changing requests from malicious sites.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";

/**
 * CSRF token configuration.
 * Tokens are stateless and validated via HMAC signature.
 */
const TOKEN_LIFETIME_MS = 3600000; // 1 hour

function getCsrfSecret(): string {
  return process.env.CSRF_SECRET || process.env.JWT_SECRET || "";
}

function csrfError(
  message: string,
  code: "BAD_REQUEST" | "FORBIDDEN" = "FORBIDDEN"
): never {
  throw new TRPCError({ code, message });
}

function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Explicit origins are needed only when the SPA is hosted separately from the
 * API. Same-origin deployments derive the expected origin from Host, including
 * Azure's forwarded host/protocol headers.
 */
export function getTrustedCsrfOrigins(req: Request): Set<string> {
  const configured = process.env.CSRF_TRUSTED_ORIGINS?.split(",")
    .map(origin => {
      try {
        return new URL(origin.trim()).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  if (configured?.length) {
    return new Set(configured);
  }

  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
  if (!host) return new Set();

  const forwardedProto = getHeader(req, "x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  return new Set([`${protocol}://${host}`]);
}

/**
 * Origin validation is always active for browser mutations, including when a
 * CSRF signing secret is unavailable in a local environment. It prevents a
 * malicious site from sending credentialed cross-site requests.
 */
export function validateCsrfOrigin(req: Request): void {
  const origin = getHeader(req, "origin");
  if (!origin) {
    csrfError("CSRF origin required for state-changing requests.");
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    csrfError("Invalid CSRF origin.");
  }

  if (!getTrustedCsrfOrigins(req).has(normalizedOrigin)) {
    csrfError("CSRF origin is not trusted.");
  }
}

/**
 * Generate a CSRF token for the current session.
 * Token includes timestamp for expiration validation.
 *
 * @param sessionId - Unique session identifier (e.g., user ID + session token)
 * @returns Base64-encoded CSRF token
 */
export function generateCsrfToken(sessionId: string): string {
  const csrfSecret = getCsrfSecret();
  if (!csrfSecret) {
    // In development, return a placeholder token
    return "dev-csrf-token";
  }

  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  // Session identifiers commonly contain `:` (for example `user:42`), so
  // encode them before constructing the colon-delimited signed payload.
  const encodedSessionId = Buffer.from(sessionId).toString("base64url");
  const payload = `${encodedSessionId}:${timestamp}:${nonce}`;

  // Create HMAC signature
  const signature = createHash("sha256")
    .update(`${csrfSecret}:${payload}`)
    .digest("hex");

  // Combine payload and signature
  const token = `${payload}:${signature}`;
  return Buffer.from(token).toString("base64");
}

/**
 * Validate a CSRF token.
 * Checks signature and expiration.
 *
 * @param token - The CSRF token to validate
 * @param sessionId - Expected session identifier
 * @throws TRPCError with code FORBIDDEN if invalid
 */
export function validateCsrfToken(token: string, sessionId: string): void {
  const csrfSecret = getCsrfSecret();
  if (!csrfSecret) {
    // In development, skip validation
    return;
  }

  if (!token) {
    csrfError("CSRF token missing. Please refresh the page and try again.");
  }

  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64").toString("utf-8");
  } catch {
    csrfError("Invalid CSRF token format.");
  }

  const parts = decoded.split(":");
  if (parts.length !== 4) {
    csrfError("Invalid CSRF token structure.");
  }

  const [encodedSessionId, timestampStr, nonce, providedSignature] = parts;
  let tokenSessionId: string;
  try {
    tokenSessionId = Buffer.from(encodedSessionId, "base64url").toString(
      "utf-8"
    );
  } catch {
    csrfError("Invalid CSRF token session.");
  }

  // Validate session match
  if (tokenSessionId !== sessionId) {
    csrfError("CSRF token session mismatch. Please sign in again.");
  }

  // Validate expiration
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_LIFETIME_MS) {
    csrfError("CSRF token expired. Please refresh the page and try again.");
  }

  // Validate signature
  const payload = `${encodedSessionId}:${timestampStr}:${nonce}`;
  const expectedSignature = createHash("sha256")
    .update(`${csrfSecret}:${payload}`)
    .digest("hex");

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    csrfError("CSRF token signature invalid.");
  }
}

/**
 * Middleware factory for tRPC procedures that require CSRF protection.
 * Use for sensitive mutations (delete, status changes, role updates).
 *
 * @example
 * const csrfProtectedProcedure = protectedProcedure.use(csrfMiddleware());
 *
 * router({
 *   deleteJobSheet: csrfProtectedProcedure
 *     .input(z.object({ id: z.number(), csrfToken: z.string() }))
 *     .mutation(({ input }) => { ... })
 * });
 */
export function csrfMiddleware() {
  return async function csrfValidation(opts: any) {
    const { ctx, input, next } = opts;

    // tRPC parses input before middleware, so use a request header rather than
    // adding csrfToken to every mutation's Zod schema. The input fallback keeps
    // direct callers using the original middleware contract working.
    const csrfToken = getHeader(ctx.req, "x-csrf-token") || input?.csrfToken;
    validateCsrfOrigin(ctx.req);

    if (!csrfToken) {
      csrfError("CSRF token required for this operation.", "BAD_REQUEST");
    }

    // Generate session ID from user context
    const sessionId = ctx.user?.id ? `user:${ctx.user.id}` : "anonymous";

    // Validate token
    validateCsrfToken(csrfToken, sessionId);

    return next();
  };
}

/**
 * Check if CSRF protection is enabled.
 * Returns false in development if CSRF_SECRET not set.
 */
export function isCsrfEnabled(): boolean {
  return getCsrfSecret().length >= 32;
}

/**
 * Get the current CSRF protection status for client display.
 */
export function getCsrfStatus() {
  return {
    enabled: isCsrfEnabled(),
    tokenLifetimeMs: TOKEN_LIFETIME_MS,
    warning: !isCsrfEnabled()
      ? "CSRF protection disabled - set CSRF_SECRET for production"
      : undefined,
  };
}
