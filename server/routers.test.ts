import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
<<<<<<< HEAD
=======
  // Review-claim store falls back to in-memory when getDb() is null.
>>>>>>> ac3e7be (fix(review): mock getDb for review-claim guards in router tests)
  getDb: vi.fn().mockResolvedValue(null),
  getDashboardStats: vi.fn().mockResolvedValue({
    totalAudits: 150,
    passRate: "87.5",
    reviewQueue: 12,
    criticalIssues: 5,
  }),
  getExecutiveSummaryStats: vi.fn().mockResolvedValue({
    totalAudits: 42,
    passRate: "90.5",
    reviewQueue: 12,
    criticalIssues: 3,
    period: {
      start: "2024-06-01T00:00:00.000Z",
      end: "2024-06-30T23:59:59.999Z",
    },
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
    technicianId: 1,
    uploadedBy: 1,
  }),
  createJobSheet: vi.fn().mockResolvedValue({ id: 3 }),
  updateJobSheetStatus: vi.fn().mockResolvedValue(undefined),
  getAuditResults: vi
    .fn()
    .mockResolvedValue([
      { id: 1, jobSheetId: 1, result: "pass", runId: "run-123" },
    ]),
  getAuditResultList: vi
    .fn()
    .mockResolvedValue([
      { id: 1, jobSheetId: 1, result: "pass", runId: "run-123" },
    ]),
  getJobSheetIdsByUploader: vi.fn().mockResolvedValue([{ id: 1 }]),
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
  revokeWaiver: vi.fn().mockResolvedValue(undefined),
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
    goldSpecId: 1,
    result: "fail",
    pipelineVersion: "1.0.0",
    ocrEngineVersion: "test",
    processingTimeMs: 100,
    reportJson: {
      extractedFields: {
        signature: { value: "absent", confidence: 0.9 },
      },
    },
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
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
  runTransaction: vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({})
    ),
  getEngineerAnalyticsDocuments: vi.fn().mockResolvedValue([
    {
      technicianId: 1,
      jobSheetId: 1,
      referenceNumber: "JS-100",
      siteInfo: "London Data Center",
      result: "pass",
      confidenceScore: 92,
      processedAt: new Date("2024-06-10T10:00:00Z"),
    },
  ]),
  getEngineerAnalyticsFindings: vi.fn().mockResolvedValue([
    {
      findingId: 1,
      technicianId: 1,
      jobSheetId: 1,
      severity: "S1",
      reasonCode: "MISSING_FIELD",
      fieldName: "signature",
      resolutionStatus: "open",
      occurredAt: new Date("2024-06-10T11:00:00Z"),
    },
  ]),
  getUnattributedJobSheets: vi.fn().mockResolvedValue([]),
  getCohortAnalyticsDocuments: vi.fn().mockResolvedValue([
    {
      jobSheetId: 1,
      siteInfo: "London HQ",
      assetType: "generator",
      workType: "service",
      templateSlug: "gen-service",
      result: "pass",
      confidenceScore: 90,
      processedAt: new Date("2024-06-10T10:00:00Z"),
    },
  ]),
  getCohortAnalyticsFindings: vi.fn().mockResolvedValue([
    {
      findingId: 1,
      jobSheetId: 1,
      severity: "S2",
      reasonCode: "MISSING_FIELD",
      fieldName: "signature",
      occurredAt: new Date("2024-06-10T11:00:00Z"),
    },
  ]),
  getExceptionHoldQueueItems: vi.fn().mockResolvedValue([
    {
      jobSheetId: 1,
      referenceNumber: "JS-1",
      siteInfo: "London HQ",
      queuedAt: new Date("2024-06-19T10:00:00Z"),
      highestSeverity: "S1",
      openFindingCount: 1,
      technicianId: 2,
    },
  ]),
  getExceptionOverturnFindings: vi.fn().mockResolvedValue([
    {
      findingId: 1,
      jobSheetId: 1,
      ruleId: "RULE_SIG",
      reasonCode: "MISSING_FIELD",
      severity: "S1",
      fieldName: "signature",
      resolutionStatus: "overridden",
      siteInfo: "London HQ",
      occurredAt: new Date("2024-06-10T11:00:00Z"),
      resolvedAt: new Date("2024-06-10T12:00:00Z"),
    },
  ]),
  getDriftAnalyticsDocuments: vi.fn().mockResolvedValue([
    {
      jobSheetId: 1,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "fail",
      confidenceScore: 40,
      processedAt: new Date("2024-06-01T10:00:00Z"),
    },
    {
      jobSheetId: 2,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "fail",
      confidenceScore: 35,
      processedAt: new Date("2024-06-05T10:00:00Z"),
    },
    {
      jobSheetId: 3,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "pass",
      confidenceScore: 90,
      processedAt: new Date("2024-06-08T10:00:00Z"),
    },
    {
      jobSheetId: 4,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "fail",
      confidenceScore: 30,
      processedAt: new Date("2024-06-10T10:00:00Z"),
    },
  ]),
  getDriftAnalyticsFindings: vi.fn().mockResolvedValue([
    {
      findingId: 1,
      jobSheetId: 1,
      severity: "S1",
      occurredAt: new Date("2024-06-01T11:00:00Z"),
    },
  ]),
  getPredictiveRiskDocuments: vi.fn().mockResolvedValue([
    {
      jobSheetId: 1,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "review_queue",
      confidenceScore: 40,
      processedAt: new Date("2024-06-01T10:00:00Z"),
    },
    {
      jobSheetId: 2,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "fail",
      confidenceScore: 35,
      processedAt: new Date("2024-06-05T10:00:00Z"),
    },
    {
      jobSheetId: 3,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "review_queue",
      confidenceScore: 45,
      processedAt: new Date("2024-06-20T10:00:00Z"),
    },
    {
      jobSheetId: 4,
      technicianId: 2,
      templateSlug: "gen-service",
      assetType: "generator",
      result: "fail",
      confidenceScore: 30,
      processedAt: new Date("2024-06-25T10:00:00Z"),
    },
  ]),
  getPredictiveRiskFindings: vi.fn().mockResolvedValue([
    {
      findingId: 1,
      jobSheetId: 1,
      technicianId: 2,
      severity: "S2",
      reasonCode: "MISSING_FIELD",
      fieldName: "notes",
      resolutionStatus: "open",
      occurredAt: new Date("2024-06-01T11:00:00Z"),
    },
    {
      findingId: 2,
      jobSheetId: 2,
      technicianId: 2,
      severity: "S1",
      reasonCode: "MISSING_FIELD",
      fieldName: "signature",
      resolutionStatus: "open",
      occurredAt: new Date("2024-06-05T11:00:00Z"),
    },
    {
      findingId: 3,
      jobSheetId: 3,
      technicianId: 2,
      severity: "S3",
      reasonCode: "LOW_CONFIDENCE",
      fieldName: "serial",
      resolutionStatus: "open",
      occurredAt: new Date("2024-06-20T11:00:00Z"),
    },
  ]),
  getPredictiveRiskDisputes: vi.fn().mockResolvedValue([
    {
      id: 1,
      auditFindingId: 2,
      raisedBy: 2,
      status: "open",
      createdAt: new Date("2024-06-06T10:00:00Z"),
    },
  ]),
}));

// Mock storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: "https://s3.example.com/test.pdf",
    key: "job-sheets/1/test.pdf",
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("analytics.executiveSummary (Phase 1.6)", () => {
  it("returns period-scoped executive KPIs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getExecutiveSummary({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result.totalAudits).toBe(42);
    expect(result.passRate).toBe("90.5");
    expect(result.criticalIssues).toBe(3);
    expect(result.reviewQueue).toBe(12);
    expect(result.period.start).toBe("2024-06-01T00:00:00.000Z");
    expect(result.period.end).toBe("2024-06-30T23:59:59.999Z");
  });

  it("rejects unauthenticated executive summary", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.analytics.getExecutiveSummary()).rejects.toThrow();
  });
});

describe("analytics.engineer (PR-15)", () => {
  it("returns engineer summary for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getEngineerSummary({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result.engineerCount).toBeGreaterThanOrEqual(1);
    expect(result.leaderboard.length).toBeGreaterThanOrEqual(1);
    expect(result.leaderboard[0]).toHaveProperty("overallScore");
    expect(result.trends).toHaveProperty("timeSeries");
  });

  it("returns engineer scorecard with drill-through", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getEngineerScoreCard({
      engineerId: "1",
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result.scoreCard?.engineerId).toBe("1");
    expect(result.drilldown.length).toBeGreaterThan(0);
    expect(result.drilldown[0].jobSheetId).toBe(1);
  });

  it("rejects unauthenticated engineer summary", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.analytics.getEngineerSummary()).rejects.toThrow();
  });
});

describe("analytics.drift (PR-18)", () => {
  it("returns drift summary for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getDriftSummary({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result.summary).toHaveProperty("seriesCount");
    expect(result.summary).toHaveProperty("ece");
    expect(Array.isArray(result.series)).toBe(true);
    expect(result.calibration).toHaveProperty("bins");
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it("returns drift alerts payload", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getDriftAlerts({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result).toHaveProperty("alerts");
    expect(result.summary).toHaveProperty("alertCount");
  });

  it("rejects unauthenticated drift summary", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.analytics.getDriftSummary()).rejects.toThrow();
  });
});

describe("analytics.predictiveRisk (PR-19)", () => {
  it("returns predictive risk summary for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getPredictiveRiskSummary({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result.summary).toHaveProperty("entitiesScored");
    expect(result.summary).toHaveProperty("needingAttention");
    expect(Array.isArray(result.attentionQueue)).toBe(true);
    expect(Array.isArray(result.predictions)).toBe(true);
    expect(Array.isArray(result.fixPacks)).toBe(true);
  });

  it("returns attention queue payload", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getAttentionQueue({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result).toHaveProperty("attentionQueue");
    expect(result.summary).toHaveProperty("needingAttention");
  });

  it("returns predictive fix packs", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.getPredictiveFixPacks({
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(result).toHaveProperty("fixPacks");
    expect(typeof result.count).toBe("number");
  });

  it("rejects unauthenticated predictive risk summary", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.analytics.getPredictiveRiskSummary()).rejects.toThrow();
  });
});

describe("jobSheets", () => {
  it("lists job sheets for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.jobSheets.list();

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.hasMore).toBe(false);
    expect(db.getJobSheets).toHaveBeenCalledWith({ limit: 51 });
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

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(db.getAuditResultList).toHaveBeenCalledOnce();
    expect(db.getAuditResultList).toHaveBeenCalledWith({ limit: 51 });
    expect(db.getAuditResults).not.toHaveBeenCalled();
    expect(result.items[0]).not.toHaveProperty("reportJson");
  });

  it("applies ownership scope before the paginated audit query", async () => {
    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);
    vi.mocked(db.getJobSheetIdsByUploader).mockResolvedValueOnce([{ id: 7 }]);

    await caller.audits.list({ limit: 1, offset: 4 });

    expect(db.getJobSheetIdsByUploader).toHaveBeenCalledWith(ctx.user!.id);
    expect(db.getAuditResultList).toHaveBeenCalledWith({
      limit: 2,
      offset: 4,
      jobSheetIds: [7],
    });
  });

  it("returns an empty page without querying audits for an unauthorized scope", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);
    vi.mocked(db.getJobSheetIdsByUploader).mockResolvedValueOnce([]);

    const result = await caller.audits.list({ limit: 1, offset: 99 });

    expect(result).toEqual({ items: [], hasMore: false });
    expect(db.getAuditResultList).not.toHaveBeenCalled();
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

  it("rejects gold-spec create (deprecated → Template Studio)", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.specs.create({
        name: "New Spec",
        version: "2.0.0",
        schema: { fields: [] },
      })
    ).rejects.toThrow(/deprecated/i);
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

describe("portal", () => {
  it("returns myDashboard scoped to the signed-in technician", async () => {
    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.portal.myDashboard();

    expect(result).toHaveProperty("scorecard");
    expect(result).toHaveProperty("stats");
    expect(result).toHaveProperty("recentAudits");
    expect(result).toHaveProperty("defects");
    expect(result.source).toBe("live");
    expect(typeof result.scoreMeasured).toBe("boolean");
    expect(Array.isArray(result.recentAudits)).toBe(true);
    expect(Array.isArray(result.defects)).toBe(true);
    for (const d of result.defects) {
      expect(d.title).not.toMatch(/Blurry Serial Number/i);
      expect(d.findingId).toBeGreaterThan(0);
    }
  });
});

describe("webhooks ops receipts", () => {
  it("lists delivery receipts honestly when empty", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.webhooks.deliveryReceipts({
      limit: 10,
      event: "audit.completed",
    });

    expect(result.available).toBe(true);
    expect(result.receiptCount).toBe(0);
    expect(result.receipts).toEqual([]);
  });

  it("returns none status for audit without deliveries", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.webhooks.auditCompletedReceipt({
      auditId: 4242,
    });

    expect(result.available).toBe(true);
    expect(result.status).toBe("none");
    expect(result.receiptCount).toBe(0);
  });

  it("rejects technicians from delivery receipts", async () => {
    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.webhooks.deliveryReceipts({ limit: 5 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  it("lets a technician create a dispute on their attributed finding", async () => {
    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.disputes.create({
      auditFindingId: 1,
      reason: "Signature is on page 2",
    });

    expect(result).toHaveProperty("id");
  });

  it("rejects technician dispute on another tech's finding", async () => {
    const db = await import("./db");
    vi.mocked(db.getJobSheetById).mockResolvedValueOnce({
      id: 1,
      fileName: "test.pdf",
      status: "completed",
      fileUrl: "https://example.com/test.pdf",
      technicianId: 99,
      uploadedBy: 2,
    } as Awaited<ReturnType<typeof db.getJobSheetById>>);

    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.disputes.create({
        auditFindingId: 1,
        reason: "Not mine",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
  it("routes legacy create through the atomic waiver workflow", async () => {
    const db = await import("./db");
    vi.mocked(db.createWaiver).mockClear();
    vi.mocked(db.updateFindingResolution).mockClear();
    vi.mocked(db.logAction).mockClear();
    vi.mocked(db.runTransaction).mockClear();

    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.waivers.create({
      auditFindingId: 1,
      reason: "Exception approved by management",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      success: true,
      action: "waive",
      findingId: 1,
      resolutionStatus: "waived",
      waiverId: 1,
    });
    expect(db.runTransaction).toHaveBeenCalled();
    expect(db.updateFindingResolution).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ resolutionStatus: "waived" }),
      expect.anything()
    );
    expect(db.createWaiver).toHaveBeenCalledWith(
      expect.objectContaining({
        auditFindingId: 1,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      }),
      expect.anything()
    );
    expect(db.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "FINDING_WAIVE" }),
      expect.objectContaining({ required: true, tx: expect.anything() })
    );
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

  it("allows qa_lead to override a finding", async () => {
    const { ctx } = createAuthContext("qa_lead");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auditActions.override({
      findingId: 1,
      reason: "QA lead override",
    });

    expect(result.success).toBe(true);
    expect(result.resolutionStatus).toBe("overridden");
  });

  it("rejects technician from override", async () => {
    const { ctx } = createAuthContext("technician");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auditActions.override({ findingId: 1, reason: "nope" })
    ).rejects.toThrow();
  });

  it("rejects default user role from approveJobSheet", async () => {
    const { ctx } = createAuthContext("user");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auditActions.approveJobSheet({ jobSheetId: 1, reason: "nope" })
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
    const db = await import("./db");

    // First apply an action so previousResolutionStatus is set via mock chain
    await caller.auditActions.override({
      findingId: 1,
      reason: "temp",
    });

    // Claim guard + undo both read the finding — keep overridden for the whole undo path.
    vi.mocked(db.getAuditFindingById).mockResolvedValue({
      id: 1,
      auditResultId: 1,
      resolutionStatus: "overridden",
      previousResolutionStatus: "open",
      fieldName: "signature",
    } as any);

    const result = await caller.auditActions.undo({ findingId: 1 });
    expect(result.success).toBe(true);
    expect(result.action).toBe("undo");

    // Restore default open finding for later tests in this file.
    vi.mocked(db.getAuditFindingById).mockResolvedValue({
      id: 1,
      auditResultId: 1,
      resolutionStatus: "open",
      fieldName: "signature",
    } as any);
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

describe("exports + batchOperations mounts (PR-IO-EXPORTS)", () => {
  it("mounts exports router on appRouter", () => {
    expect(appRouter._def.procedures).toBeDefined();
    expect(Object.keys(appRouter._def.record).includes("exports")).toBe(true);
    expect(Object.keys(appRouter._def.record).includes("batchOperations")).toBe(
      true
    );
  });

  it("exports CSV + JSON bundle from real audit result id", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const csv = await caller.exports.validatedFieldsCSV({
      auditId: 1,
      redacted: true,
      tab: "all",
    });
    expect(csv.success).toBe(true);
    expect(csv.content).toContain("Rule ID");
    expect(csv.filename).toContain("validated-fields");

    const findings = await caller.exports.findingsCSV({
      auditId: 1,
      redacted: true,
    });
    expect(findings.success).toBe(true);
    expect(findings.content).toContain("Severity");

    const bundle = await caller.exports.bundle({
      auditId: 1,
      redacted: true,
    });
    expect(bundle.success).toBe(true);
    expect(bundle.filename).toContain("bundle.json");
    expect(bundle.content).toHaveProperty("validatedFields");
    expect(bundle.content).toHaveProperty("findings");
  });

  it("batch exportAuditsBatch returns CSV for audit ids", async () => {
    const { ctx } = createAuthContext("qa_lead");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.batchOperations.exportAuditsBatch({
      auditResultIds: [1],
      format: "csv",
    });
    expect(result.format).toBe("csv");
    expect(result.count).toBe(1);
    expect(String(result.data)).toContain("Audit ID");
  });
});
