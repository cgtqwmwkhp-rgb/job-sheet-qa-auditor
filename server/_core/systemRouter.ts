import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";

// ============================================================================
// VERSION SCHEMA (Canonical Contract)
// ============================================================================

/**
 * Canonical version response schema.
 * This schema is the contract for the /api/trpc/system.version endpoint.
 * Any changes to this schema MUST be accompanied by:
 * 1. ADR documenting the change
 * 2. Contract test update
 * 3. Client-side type update
 */
export const VersionResponseSchema = z.object({
  /** Full Git commit SHA (40 characters) */
  gitSha: z.string().min(7).max(40),
  /** Short Git commit SHA (7 characters) */
  gitShaShort: z.string().length(7),
  /** Platform/deployment version identifier (if available) */
  platformVersion: z.string(),
  /** ISO 8601 timestamp of when the build was created */
  buildTime: z.string().datetime({ offset: true }).or(z.string()),
  /** Runtime environment (development, staging, production) */
  environment: z.enum(["development", "staging", "production"]),
  /** Schema version for forward compatibility */
  schemaVersion: z.literal("1.0.0"),
});

export type VersionResponse = z.infer<typeof VersionResponseSchema>;

// ============================================================================
// RUNTIME VERSION INFO
// ============================================================================

/**
 * Version info is injected at build/deploy time via environment variables.
 * 
 * Required environment variables:
 * - GIT_SHA: Full Git commit SHA (from CI/CD)
 * - PLATFORM_VERSION: Platform deployment version (optional)
 * - BUILD_TIME: ISO 8601 timestamp of build (from CI/CD)
 * 
 * These should be set in:
 * - CI/CD pipeline (GitHub Actions)
 * - Dockerfile
 * - docker-compose.yml
 * - Platform deployment config (Vercel, Railway, etc.)
 */
const GIT_SHA = process.env.GIT_SHA || "unknown";
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || "unknown";
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

/**
 * Determine runtime environment
 */
function getEnvironment(): "development" | "staging" | "production" {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") {
    // Check if this is staging or production based on additional env vars
    const deployEnv = process.env.DEPLOY_ENV || process.env.ENVIRONMENT;
    if (deployEnv === "staging") return "staging";
    return "production";
  }
  return "development";
}

// ============================================================================
// SYSTEM ROUTER
// ============================================================================

export const systemRouter = router({
  /**
   * Health check endpoint
   * Returns system health status and configuration
   */
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      oauthEnabled: ENV.oauthEnabled,
      config: {
        oauthConfigured: ENV.oauthEnabled,
        databaseConfigured: Boolean(ENV.databaseUrl),
        environment: ENV.isProduction ? "production" : "development",
      },
    })),

  /**
   * Version endpoint (Canonical)
   * Returns build and deployment version information.
   * 
   * This endpoint is critical for:
   * - Release verification
   * - Debugging production issues
   * - Audit trail
   * - Rollback decisions
   * 
   * The response schema is versioned for forward compatibility.
   */
  version: publicProcedure.query((): VersionResponse => ({
    gitSha: GIT_SHA,
    gitShaShort: GIT_SHA.length >= 7 ? GIT_SHA.substring(0, 7) : GIT_SHA,
    platformVersion: PLATFORM_VERSION,
    buildTime: BUILD_TIME,
    environment: getEnvironment(),
    schemaVersion: "1.0.0",
  })),

  /**
   * Notify owner endpoint (Admin
 only)
   * Sends a notification to the application owner
   */
  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
