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

  it("should include environment in config using APP_ENV", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "staging";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.health({ timestamp: Date.now() });

    // APP_ENV takes priority over NODE_ENV
    expect(result.config.environment).toBe("staging");
  });

  it("should fallback to production when NODE_ENV=production and APP_ENV not set", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;

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

describe("systemRouter.version", () => {
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
    process.env.GIT_SHA = "abc123";
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

    // Only expected fields should be present
    expect(Object.keys(result).sort()).toEqual([
      "buildTime",
      "environment",
      "gitSha",
      "gitShaShort",
      "platformVersion",
    ]);
  });

  it("should include environment field using APP_ENV", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "staging";
    process.env.GIT_SHA = "abc123";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    // APP_ENV takes priority
    expect(result.environment).toBe("staging");
  });

  it("should fallback to production when NODE_ENV=production and APP_ENV not set", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
    process.env.GIT_SHA = "abc123";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    expect(result.environment).toBe("production");
  });

  it("should return deterministic response structure", async () => {
    process.env.GIT_SHA = "test123";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({});
    const result = await caller.version();

    // Verify response structure is deterministic
    expect(Object.keys(result).sort()).toEqual([
      "buildTime",
      "environment",
      "gitSha",
      "gitShaShort",
      "platformVersion",
    ]);
  });
});

describe("systemRouter.platformConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return safety flags", async () => {
    process.env.ENABLE_PURGE_EXECUTION = "false";
    process.env.ENABLE_SCHEDULER = "false";
    process.env.ENABLE_GEMINI_INSIGHTS = "true";

    const { systemRouter } = await import("./systemRouter");
    // platformConfig requires admin context - mock it
    const caller = systemRouter.createCaller({ user: { id: 1, role: "admin" } });
    const result = await caller.platformConfig();

    expect(result.safetyFlags.enablePurgeExecution).toBe(false);
    expect(result.safetyFlags.enableScheduler).toBe(false);
    expect(result.safetyFlags.enableGeminiInsights).toBe(true);
  });

  it("should redact secrets - only show presence", async () => {
    process.env.MISTRAL_API_KEY = "secret-key-123";
    process.env.GEMINI_API_KEY = "another-secret";
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/db";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({ user: { id: 1, role: "admin" } });
    const result = await caller.platformConfig();

    // Should indicate presence but not expose values
    expect(result.apiKeysConfigured.mistral).toBe(true);
    expect(result.apiKeysConfigured.gemini).toBe(true);
    expect(result.databaseConfig.configured).toBe(true);

    // Should not contain actual secrets
    const responseString = JSON.stringify(result);
    expect(responseString).not.toContain("secret-key-123");
    expect(responseString).not.toContain("another-secret");
    expect(responseString).not.toContain("password");
  });

  it("should return deterministic config hash", async () => {
    process.env.ENABLE_PURGE_EXECUTION = "false";
    process.env.STORAGE_PROVIDER = "azure";
    process.env.APP_ENV = "staging";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({ user: { id: 1, role: "admin" } });
    
    const result1 = await caller.platformConfig();
    const result2 = await caller.platformConfig();

    // Hash should be deterministic
    expect(result1.configHash).toBe(result2.configHash);
  });

  it("should include version info", async () => {
    process.env.GIT_SHA = "abc123def";
    process.env.PLATFORM_VERSION = "main";
    process.env.APP_ENV = "staging";

    const { systemRouter } = await import("./systemRouter");
    const caller = systemRouter.createCaller({ user: { id: 1, role: "admin" } });
    const result = await caller.platformConfig();

    expect(result.versionInfo.gitShaShort).toBe("abc123d");
    expect(result.versionInfo.environment).toBe("staging");
  });
});
