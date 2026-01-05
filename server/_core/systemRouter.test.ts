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

  it("should include environment field", async () => {
    process.env.NODE_ENV = "production";
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
