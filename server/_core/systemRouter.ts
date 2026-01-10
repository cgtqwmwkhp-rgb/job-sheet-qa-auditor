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
});
