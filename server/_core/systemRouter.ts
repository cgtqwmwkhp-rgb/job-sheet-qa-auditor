import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";

// Runtime environment variables for version info (injected at build/deploy time)
const GIT_SHA = process.env.GIT_SHA || "unknown";
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || "unknown";
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

export const systemRouter = router({
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
        // Use APP_ENV for environment identity
        environment: ENV.appEnvironment,
      },
    })),

  version: publicProcedure.query(() => ({
    gitSha: GIT_SHA,
    gitShaShort: GIT_SHA.substring(0, 7),
    platformVersion: PLATFORM_VERSION,
    buildTime: BUILD_TIME,
    // Use APP_ENV for environment identity (staging vs production vs development)
    environment: ENV.appEnvironment,
  })),

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

  /**
   * PR-3: Platform config drift endpoint (admin-only)
   * 
   * Returns key configuration flags for ops monitoring.
   * Used to detect configuration drift between environments.
   * Secrets are redacted - only presence is shown.
   */
  platformConfig: adminProcedure.query(() => {
    // Safety flags - critical for production
    const safetyFlags = {
      enablePurgeExecution: process.env.ENABLE_PURGE_EXECUTION === "true",
      enableScheduler: process.env.ENABLE_SCHEDULER === "true",
      enableGeminiInsights: process.env.ENABLE_GEMINI_INSIGHTS === "true",
    };

    // Storage configuration
    const storageConfig = {
      provider: process.env.STORAGE_PROVIDER || "local",
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || "(not set)",
      // Redacted - only show if configured
      connectionStringConfigured: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
    };

    // Database configuration (redacted)
    const databaseConfig = {
      configured: Boolean(process.env.DATABASE_URL),
      // Extract host only for drift detection (no credentials)
      host: process.env.DATABASE_URL
        ? process.env.DATABASE_URL.match(/@([^:/]+)/)?.[1] || "(hidden)"
        : "(not configured)",
    };

    // API keys (redacted - only show presence)
    const apiKeysConfigured = {
      mistral: Boolean(process.env.MISTRAL_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      oauth: Boolean(process.env.OAUTH_SERVER_URL),
    };

    // Version info
    const versionInfo = {
      gitSha: GIT_SHA,
      gitShaShort: GIT_SHA.substring(0, 7),
      platformVersion: PLATFORM_VERSION,
      buildTime: BUILD_TIME,
      environment: ENV.appEnvironment,
      nodeEnv: process.env.NODE_ENV || "development",
    };

    return {
      timestamp: new Date().toISOString(),
      safetyFlags,
      storageConfig,
      databaseConfig,
      apiKeysConfigured,
      versionInfo,
      // Config hash for drift detection
      configHash: generateConfigHash(safetyFlags, storageConfig, versionInfo),
    };
  }),
});

/**
 * Generate a simple hash of key config values for drift detection.
 * Used to quickly compare configs between environments.
 */
function generateConfigHash(
  safetyFlags: Record<string, boolean>,
  storageConfig: Record<string, unknown>,
  versionInfo: Record<string, unknown>
): string {
  const configString = JSON.stringify({
    sf: safetyFlags,
    sp: storageConfig.provider,
    sc: storageConfig.containerName,
    env: versionInfo.environment,
  });
  // Simple hash (not cryptographic, just for comparison)
  let hash = 0;
  for (let i = 0; i < configString.length; i++) {
    const char = configString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
