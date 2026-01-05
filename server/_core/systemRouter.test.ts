import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("systemRouter.health", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return oauthEnabled=true when OAUTH_SERVER_URL is set", async () => {
    process.env.OAUTH_SERVER_URL = "https://oauth.example.com";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.health({ timestamp: Date.now() });

    expect(result.ok).toBe(true);
    expect(result.oauthEnabled).toBe(true);
    expect(result.config.oauthConfigured).toBe(true);
  });

  it("should return oauthEnabled=false when OAUTH_SERVER_URL is not set", async () => {
    delete process.env.OAUTH_SERVER_URL;

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.health({ timestamp: Date.now() });

    expect(result.ok).toBe(true);
    expect(result.oauthEnabled).toBe(false);
    expect(result.config.oauthConfigured).toBe(false);
  });

  it("should include environment in config", async () => {
    process.env.NODE_ENV = "production";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.health({ timestamp: Date.now() });

    expect(result.config.environment).toBe("production");
  });

  it("should return deterministic response structure", async () => {
    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.health({ timestamp: Date.now() });

    // Verify response structure is deterministic
    expect(Object.keys(result).sort()).toEqual(["config", "oauthEnabled", "ok"]);
    expect(Object.keys(result.config).sort()).toEqual([
      "databaseConfigured",
      "environment",
      "oauthConfigured",
    ]);
  });
});

describe("systemRouter.version (Canonical Contract)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return gitSha from GIT_SHA env when set", async () => {
    process.env.GIT_SHA = "abc123def456789";
    process.env.PLATFORM_VERSION = "v1.2.3";
    process.env.BUILD_TIME = "2026-01-05T12:00:00Z";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.gitSha).toBe("abc123def456789");
    expect(result.gitShaShort).toBe("abc123d");
    expect(result.platformVersion).toBe("v1.2.3");
    expect(result.buildTime).toBe("2026-01-05T12:00:00Z");
  });

  it("should return 'unknown' when GIT_SHA env is not set", async () => {
    delete process.env.GIT_SHA;
    delete process.env.PLATFORM_VERSION;

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.gitSha).toBe("unknown");
    expect(result.platformVersion).toBe("unknown");
  });

  it("should not expose any secrets in version response", async () => {
    process.env.GIT_SHA = "abc123def";
    process.env.MISTRAL_API_KEY = "secret-mistral-key";
    process.env.GEMINI_API_KEY = "secret-gemini-key";
    process.env.DATABASE_URL = "mysql://user:password@localhost/db";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    const responseString = JSON.stringify(result);

    // Ensure no secrets are exposed
    expect(responseString).not.toContain("secret-mistral-key");
    expect(responseString).not.toContain("secret-gemini-key");
    expect(responseString).not.toContain("password");
    expect(responseString).not.toContain("DATABASE_URL");
  });

  it("should include schemaVersion field for forward compatibility", async () => {
    process.env.GIT_SHA = "abc123def";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.schemaVersion).toBe("1.0.0");
  });

  it("should return canonical response structure (CONTRACT)", async () => {
    process.env.GIT_SHA = "test123abc";
    process.env.NODE_ENV = "production";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    // CANONICAL CONTRACT: These fields MUST be present
    expect(Object.keys(result).sort()).toEqual([
      "buildTime",
      "environment",
      "gitSha",
      "gitShaShort",
      "platformVersion",
      "schemaVersion",
    ]);

    // Type checks
    expect(typeof result.gitSha).toBe("string");
    expect(typeof result.gitShaShort).toBe("string");
    expect(typeof result.platformVersion).toBe("string");
    expect(typeof result.buildTime).toBe("string");
    expect(typeof result.environment).toBe("string");
    expect(typeof result.schemaVersion).toBe("string");

    // gitShaShort must be 7 characters or less (for "unknown")
    expect(result.gitShaShort.length).toBeLessThanOrEqual(7);

    // environment must be one of the allowed values
    expect(["development", "staging", "production"]).toContain(result.environment);
  });

  it("should validate against VersionResponseSchema", async () => {
    process.env.GIT_SHA = "abc123def456789";
    process.env.BUILD_TIME = "2026-01-05T12:00:00Z";
    process.env.NODE_ENV = "production";

    const { systemRouter, VersionResponseSchema } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    // Schema validation should pass
    const parseResult = VersionResponseSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  it("should return staging environment when DEPLOY_ENV=staging", async () => {
    process.env.GIT_SHA = "abc123def";
    process.env.NODE_ENV = "production";
    process.env.DEPLOY_ENV = "staging";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.environment).toBe("staging");
  });

  it("should return production environment when NODE_ENV=production", async () => {
    process.env.GIT_SHA = "abc123def";
    process.env.NODE_ENV = "production";
    delete process.env.DEPLOY_ENV;

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.environment).toBe("production");
  });

  it("should return development environment when NODE_ENV is not production", async () => {
    process.env.GIT_SHA = "abc123def";
    process.env.NODE_ENV = "development";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.environment).toBe("development");
  });
});
