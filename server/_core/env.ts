/**
 * Application environment types
 * - development: Local development
 * - staging: Azure staging environment
 * - production: Azure production environment
 */
export type AppEnvironment = "development" | "staging" | "production";

/**
 * Determine the application environment from APP_ENV or NODE_ENV
 * Priority: APP_ENV > NODE_ENV > default to "development"
 */
function getAppEnvironment(): AppEnvironment {
  const appEnv = process.env.APP_ENV?.toLowerCase();
  if (appEnv === "staging" || appEnv === "production" || appEnv === "development") {
    return appEnv;
  }
  // Fallback to NODE_ENV for backwards compatibility
  if (process.env.NODE_ENV === "production") {
    // If NODE_ENV is production but APP_ENV not set, assume production
    return "production";
  }
  return "development";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // OAuth is enabled only when OAUTH_SERVER_URL is configured
  oauthEnabled: Boolean(process.env.OAUTH_SERVER_URL),
  // Dev bypass allows authentication without OAuth in development
  devBypassAuth: process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production",
  // Application environment (staging vs production vs development)
  appEnvironment: getAppEnvironment(),
};
