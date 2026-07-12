/**
 * CSRF (Cross-Site Request Forgery) Protection
 * 
 * Provides CSRF token generation and validation for sensitive mutations.
 * Protects against unauthorized state-changing requests from malicious sites.
 */

import { createHash, randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";

/**
 * CSRF token configuration.
 * Tokens are stateless and validated via HMAC signature.
 */
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || "";
const TOKEN_LIFETIME_MS = 3600000; // 1 hour

if (!CSRF_SECRET || CSRF_SECRET.length < 32) {
  console.warn(
    "[CSRF] CSRF_SECRET not set or too short. CSRF protection disabled. " +
    "Set CSRF_SECRET environment variable (min 32 chars) for production."
  );
}

/**
 * Generate a CSRF token for the current session.
 * Token includes timestamp for expiration validation.
 * 
 * @param sessionId - Unique session identifier (e.g., user ID + session token)
 * @returns Base64-encoded CSRF token
 */
export function generateCsrfToken(sessionId: string): string {
  if (!CSRF_SECRET) {
    // In development, return a placeholder token
    return "dev-csrf-token";
  }

  const timestamp = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const payload = `${sessionId}:${timestamp}:${nonce}`;
  
  // Create HMAC signature
  const signature = createHash("sha256")
    .update(`${CSRF_SECRET}:${payload}`)
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
  if (!CSRF_SECRET) {
    // In development, skip validation
    return;
  }

  if (!token) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF token missing. Please refresh the page and try again.",
    });
  }

  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64").toString("utf-8");
  } catch {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid CSRF token format.",
    });
  }

  const parts = decoded.split(":");
  if (parts.length !== 4) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid CSRF token structure.",
    });
  }

  const [tokenSessionId, timestampStr, nonce, providedSignature] = parts;

  // Validate session match
  if (tokenSessionId !== sessionId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF token session mismatch. Please sign in again.",
    });
  }

  // Validate expiration
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_LIFETIME_MS) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF token expired. Please refresh the page and try again.",
    });
  }

  // Validate signature
  const payload = `${tokenSessionId}:${timestampStr}:${nonce}`;
  const expectedSignature = createHash("sha256")
    .update(`${CSRF_SECRET}:${payload}`)
    .digest("hex");

  if (providedSignature !== expectedSignature) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF token signature invalid.",
    });
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

    // Extract CSRF token from input
    const csrfToken = input?.csrfToken;
    
    if (!csrfToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "CSRF token required for this operation.",
      });
    }

    // Generate session ID from user context
    const sessionId = ctx.user?.id ? `user:${ctx.user.id}` : "anonymous";

    // Validate token
    validateCsrfToken(csrfToken, sessionId);

    // Remove CSRF token from input before passing to procedure
    if (input) {
      delete input.csrfToken;
    }

    return next();
  };
}

/**
 * Check if CSRF protection is enabled.
 * Returns false in development if CSRF_SECRET not set.
 */
export function isCsrfEnabled(): boolean {
  return Boolean(CSRF_SECRET && CSRF_SECRET.length >= 32);
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
