import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    totalAudits: 150,
    passRate: "87.5",
    reviewQueue: 12,
    criticalIssues: 5,
  }),
  getJobSheets: vi.fn().mockResolvedValue([
    { id: 1, fileName: "test.pdf", status: "completed" },
    { id: 2, fileName: "test2.pdf", status: "pending" },
  ]),
  getJobSheetById: vi.fn().mockResolvedValue({
    id: 1,
    fileName: "test.pdf",
    status: "completed",
    fileUrl: "https://example.com/test.pdf",
  }),
  createJobSheet: vi.fn().mockResolvedValue({ id: 3 }),
  updateJobSheetStatus: vi.fn().mockResolvedValue(undefined),
  getAuditResults: vi
    .fn()
    .mockResolvedValue([
      { id: 1, jobSheetId: 1, result: "pass", runId: "run-123" },
    ]),
  getAuditResultByJobSheetId: vi.fn().mockResolvedValue({
    id: 1,
    jobSheetId: 1,
    result: "pass",
    runId: "run-123",
  }),
  getAuditFindingsByResultId: vi.fn().mockResolvedValue([
    {
      id: 1,
      severity: "S2",
      reasonCode: "MISSING_FIELD",
      fieldName: "signature",
    },
  ]),
  getAllGoldSpecs: vi
    .fn()
    .mockResolvedValue([
      { id: 1, name: "Base Spec", version: "1.0.0", isActive: true },
    ]),
  getActiveGoldSpec: vi.fn().mockResolvedValue({
    id: 1,
    name: "Base Spec",
    version: "1.0.0",
    isActive: true,
  }),
  createGoldSpec: vi.fn().mockResolvedValue({ id: 2 }),
  getDisputes: vi
    .fn()
    .mockResolvedValue([
      { id: 1, status: "open", reason: "Incorrect finding" },
    ]),
  createDispute: vi.fn().mockResolvedValue({ id: 2 }),
  updateDisputeStatus: vi.fn().mockResolvedValue(undefined),
  createWaiver: vi.fn().mockResolvedValue({ id: 1 }),
  getWaiverByFindingId: vi.fn().mockResolvedValue(null),
  deleteWaiver: vi.fn().mockResolvedValue(undefined),
  getAuditFindingById: vi.fn().mockResolvedValue({
    id: 1,
    auditResultId: 1,
    resolutionStatus: "open",
    fieldName: "signature",
  }),
  updateFindingResolution: vi.fn().mockResolvedValue(undefined),
  getAuditResultById: vi.fn().mockResolvedValue({
    id: 1,
    jobSheetId: 1,
    result: "fail",
  }),
  updateAuditResultStatus: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, name: "Admin User", role: "admin" },
    { id: 2, name: "Tech User", role: "technician" },
  ]),
  getUserById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Admin User",
    role: "admin",
  }),
  getAuditLogs: vi
    .fn()
    .mockResolvedValue([{ id: 1, action: "LOGIN", userId: 1 }]),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: "https://s3.example.com/test.pdf",
    key: "job-sheets/1/test.pdf",
  }),
}));

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(
  role: "user" | "admin" | "qa_lead" | "technician" = "admin"
): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("stats.dashboard", () => {
  it("returns dashboard statistics for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stats.dashboard();

    expect(result).toHaveProperty("totalAudits");
    expect(result).toHaveProperty("passRate");
    expect(result).toHaveProperty("reviewQueue");
    expect(result).toHaveProperty("criticalIssues");
    expect(result.totalAudits).toBe(150);
  });

  it("throws unauthorized for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stats.dashboard()).rejects.toThrow();
  });
});

describe("jobSheets", () => {
  it("lists job sheets for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobSheets.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("gets a single job sheet by id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobSheets.get({ id: 1 });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("fileName");
  });

  it("updates job sheet status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobSheets.updateStatus({
      id: 1,
      status: "completed",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("audits", () => {
  it("lists audit results", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.audits.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("gets audit result by job sheet id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.audits.getByJobSheet({ jobSheetId: 1 });

    expect(result).toHaveProperty("jobSheetId", 1);
    expect(result).toHaveProperty("result");
  });

  it("gets findings for an audit result", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.audits.getFindings({ auditResultId: 1 });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("specs", () => {
  it("lists all gold specs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.specs.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("gets active gold spec", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.specs.getActive();

    expect(result).toHaveProperty("isActive", true);
  });

  it("creates gold spec (admin only)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.specs.create({
      name: "New Spec",
      version: "2.0.0",
      schema: { fields: [] },
    });

    expect(result).toHaveProperty("id");
  });

  it("rejects non-admin from creating specs", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.specs.create({
        name: "New Spec",
        version: "2.0.0",
        schema: { fields: [] },
      })
    ).rejects.toThrow();
  });
});

describe("disputes", () => {
  it("lists disputes", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.disputes.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a dispute", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.disputes.create({
      auditFindingId: 1,
      reason: "This finding is incorrect",
    });

    expect(result).toHaveProperty("id");
  });

  it("updates dispute status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.disputes.updateStatus({
      id: 1,
      status: "accepted",
      reviewNotes: "Approved after review",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("waivers", () => {
  it("creates a waiver (admin only)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.waivers.create({
      auditFindingId: 1,
      reason: "Exception approved by management",
    });

    expect(result).toHaveProperty("id");
  });

  it("rejects non-admin from creating waivers", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.waivers.create({
        auditFindingId: 1,
        reason: "Exception approved",
      })
    ).rejects.toThrow();
  });
});

describe("auditActions (PR-10)", () => {
  it("lists supported actions", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.supportedActions();
    expect(result.findingActions).toContain("waive");
    expect(result.findingActions).toContain("override");
    expect(result.findingActions).toContain("flag");
    expect(result.findingActions).toContain("approve");
    expect(result.undoSupported).toBe(true);
    expect(result.bulkApproveSupported).toBe(true);
    expect(result.fieldCorrectionSupported).toBe(true);
  });

  it("overrides a finding", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.override({
      findingId: 1,
      reason: "False positive",
    });

    expect(result.success).toBe(true);
    expect(result.resolutionStatus).toBe("overridden");
    expect(result.undoToken).toContain("undo:1:");
  });

  it("flags a finding", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.flag({
      findingId: 1,
      reason: "Needs review",
    });

    expect(result.success).toBe(true);
    expect(result.resolutionStatus).toBe("flagged");
  });

  it("waives a finding (admin only)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.waive({
      findingId: 1,
      reason: "Exception",
    });

    expect(result.success).toBe(true);
    expect(result.resolutionStatus).toBe("waived");
  });

  it("rejects non-admin waive", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auditActions.waive({ findingId: 1, reason: "nope" })
    ).rejects.toThrow();
  });

  it("approves a job sheet", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.approveJobSheet({
      jobSheetId: 1,
      reason: "OK",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("completed");
  });

  it("undos a finding action", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First apply an action so previousResolutionStatus is set via mock chain
    await caller.auditActions.override({
      findingId: 1,
      reason: "temp",
    });

    // Mock returns open by default — update mock for undo path
    const db = await import("./db");
    vi.mocked(db.getAuditFindingById).mockResolvedValueOnce({
      id: 1,
      auditResultId: 1,
      resolutionStatus: "overridden",
      previousResolutionStatus: "open",
      fieldName: "signature",
    } as any);

    const result = await caller.auditActions.undo({ findingId: 1 });
    expect(result.success).toBe(true);
    expect(result.action).toBe("undo");
  });
});

describe("users", () => {
  it("lists users (admin only)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin from listing users", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(caller.users.list()).rejects.toThrow();
  });

  it("gets user by id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.get({ id: 1 });

    expect(result).toHaveProperty("id", 1);
  });
});

describe("auditLog", () => {
  it("lists audit logs (admin only)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditLog.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin from viewing audit logs", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auditLog.list()).rejects.toThrow();
  });
});
