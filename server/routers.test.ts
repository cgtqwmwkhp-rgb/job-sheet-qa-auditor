import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    totalAudits: 150,
    passRate: '87.5',
    reviewQueue: 12,
    criticalIssues: 5,
  }),
  getJobSheets: vi.fn().mockResolvedValue([
    { id: 1, fileName: 'test.pdf', status: 'completed' },
    { id: 2, fileName: 'test2.pdf', status: 'pending' },
  ]),
  getJobSheetById: vi.fn().mockResolvedValue({
    id: 1,
    fileName: 'test.pdf',
    status: 'completed',
    fileUrl: 'https://example.com/test.pdf',
  }),
  createJobSheet: vi.fn().mockResolvedValue({ id: 3 }),
  updateJobSheetStatus: vi.fn().mockResolvedValue(undefined),
  getAuditResults: vi.fn().mockResolvedValue([
    { id: 1, jobSheetId: 1, result: 'pass', runId: 'run-123' },
  ]),
  getAuditResultByJobSheetId: vi.fn().mockResolvedValue({
    id: 1,
    jobSheetId: 1,
    result: 'pass',
    runId: 'run-123',
  }),
  getAuditFindingsByResultId: vi.fn().mockResolvedValue([
    { id: 1, severity: 'S2', reasonCode: 'MISSING_FIELD', fieldName: 'signature' },
  ]),
  getAllGoldSpecs: vi.fn().mockResolvedValue([
    { id: 1, name: 'Base Spec', version: '1.0.0', isActive: true },
  ]),
  getActiveGoldSpec: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Base Spec',
    version: '1.0.0',
    isActive: true,
  }),
  createGoldSpec: vi.fn().mockResolvedValue({ id: 2 }),
  getDisputes: vi.fn().mockResolvedValue([
    { id: 1, status: 'open', reason: 'Incorrect finding' },
  ]),
  createDispute: vi.fn().mockResolvedValue({ id: 2 }),
  updateDisputeStatus: vi.fn().mockResolvedValue(undefined),
  createWaiver: vi.fn().mockResolvedValue({ id: 1 }),
  getWaiverByFindingId: vi.fn().mockResolvedValue(null),
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, name: 'Admin User', role: 'admin' },
    { id: 2, name: 'Tech User', role: 'technician' },
  ]),
  getUserById: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Admin User',
    role: 'admin',
  }),
  getAuditLogs: vi.fn().mockResolvedValue([
    { id: 1, action: 'LOGIN', userId: 1 },
  ]),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ 
    url: 'https://s3.example.com/test.pdf',
    key: 'job-sheets/1/test.pdf'
  }),
}));

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: 'user' | 'admin' | 'qa_lead' | 'technician' = 'admin'): { 
  ctx: TrpcContext; 
  clearedCookies: CookieCall[] 
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

    expect(result).toHaveProperty('totalAudits');
    expect(result).toHaveProperty('passRate');
    expect(result).toHaveProperty('reviewQueue');
    expect(result).toHaveProperty('criticalIssues');
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

    expect(result).toHaveProperty('id', 1);
    expect(result).toHaveProperty('fileName');
  });

  it("updates job sheet status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobSheets.updateStatus({ 
      id: 1, 
      status: 'completed' 
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

    expect(result).toHaveProperty('jobSheetId', 1);
    expect(result).toHaveProperty('result');
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

    expect(result).toHaveProperty('isActive', true);
  });

  it("creates gold spec (admin only)", async () => {
    const { ctx } = createAuthContext('admin');
    const caller = appRouter.createCaller(ctx);

    const result = await caller.specs.create({
      name: 'New Spec',
      version: '2.0.0',
      schema: { fields: [] },
    });

    expect(result).toHaveProperty('id');
  });

  it("rejects non-admin from creating specs", async () => {
    const { ctx } = createAuthContext('user');
    const caller = appRouter.createCaller(ctx);

    await expect(caller.specs.create({
      name: 'New Spec',
      version: '2.0.0',
      schema: { fields: [] },
    })).rejects.toThrow();
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
      reason: 'This finding is incorrect',
    });

    expect(result).toHaveProperty('id');
  });

  it("updates dispute status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.disputes.updateStatus({
      id: 1,
      status: 'accepted',
      reviewNotes: 'Approved after review',
    });

    expect(result).toEqual({ success: true });
  });
});

describe("waivers", () => {
  it("creates a waiver (admin only)", async () => {
    const { ctx } = createAuthContext('admin');
    const caller = appRouter.createCaller(ctx);

    const result = await caller.waivers.create({
      auditFindingId: 1,
      reason: 'Exception approved by management',
    });

    expect(result).toHaveProperty('id');
  });

  it("rejects non-admin from creating waivers", async () => {
    const { ctx } = createAuthContext('user');
    const caller = appRouter.createCaller(ctx);

    await expect(caller.waivers.create({
      auditFindingId: 1,
      reason: 'Exception approved',
    })).rejects.toThrow();
  });
});

describe("users", () => {
  it("lists users (admin only)", async () => {
    const { ctx } = createAuthContext('admin');
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin from listing users", async () => {
    const { ctx } = createAuthContext('user');
    const caller = appRouter.createCaller(ctx);

    await expect(caller.users.list()).rejects.toThrow();
  });

  it("gets user by id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.users.get({ id: 1 });

    expect(result).toHaveProperty('id', 1);
  });
});

describe("auditLog", () => {
  it("lists audit logs (admin only)", async () => {
    const { ctx } = createAuthContext('admin');
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditLog.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("rejects non-admin from viewing audit logs", async () => {
    const { ctx } = createAuthContext('user');
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auditLog.list()).rejects.toThrow();
  });
});
