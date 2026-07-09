/**
 * Fix Packs Workflow Contract Tests (Phase 1.9)
 */

import { beforeEach, describe, expect, it } from "vitest";
import { router } from "../../_core/trpc";
import {
  fixPacksRouter,
  resetFixPackWorkflowStore,
} from "../../routers/fixPacksRouter";
import type { User } from "../../../drizzle/schema";

const testRouter = router({
  fixPacks: fixPacksRouter,
});

function createMockUser(role: "user" | "admin" | "qa_lead" = "user"): User {
  return {
    id: role === "user" ? 10 : 1,
    openId: `test-${role}`,
    name: `Test ${role}`,
    email: `${role}@example.com`,
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function createCaller(role: "user" | "admin" | "qa_lead" = "user") {
  return testRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: createMockUser(role),
  });
}

const engineer = {
  id: "eng-001",
  name: "Alex Risky",
  employeeId: "EMP-001",
  region: "North",
  team: "QA",
  startDate: "2024-01-01",
  isActive: true,
};

const issues = [
  {
    id: "issue-001",
    engineerId: "eng-001",
    documentId: "doc-001",
    issueType: "SIGNATURE_MISSING" as const,
    severity: "S0" as const,
    fieldName: "customerSignature",
    reasonCode: "SIGNATURE_MISSING",
    occurredAt: "2024-06-10T10:00:00.000Z",
    wasDisputed: false,
    wasWaived: false,
    resolutionStatus: "open" as const,
  },
  {
    id: "issue-002",
    engineerId: "eng-001",
    documentId: "doc-002",
    issueType: "MISSING_FIELD" as const,
    severity: "S1" as const,
    fieldName: "assetId",
    reasonCode: "MISSING_FIELD",
    occurredAt: "2024-06-11T10:00:00.000Z",
    wasDisputed: false,
    wasWaived: false,
    resolutionStatus: "open" as const,
  },
];

describe("Fix packs workflow router", () => {
  const previousFlag = process.env.FEATURE_FIX_PACK_WORKFLOW;

  beforeEach(() => {
    resetFixPackWorkflowStore();
    if (previousFlag === undefined) {
      delete process.env.FEATURE_FIX_PACK_WORKFLOW;
    } else {
      process.env.FEATURE_FIX_PACK_WORKFLOW = previousFlag;
    }
  });

  it("reports default-off status and blocks workflow mutations", async () => {
    const caller = createCaller("admin");

    await expect(
      caller.fixPacks.export({ engineer, issues })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(caller.fixPacks.status()).resolves.toMatchObject({
      enabled: false,
      mounted: true,
      persistedIn: "memory",
    });
  });

  it("exports, assigns, and acknowledges a fix pack when enabled", async () => {
    process.env.FEATURE_FIX_PACK_WORKFLOW = "true";
    const userCaller = createCaller("user");
    const leadCaller = createCaller("qa_lead");

    const exported = await userCaller.fixPacks.export({
      engineer,
      issues,
      validDays: 14,
    });

    expect(exported.workflow.status).toBe("exported");
    expect(exported.fixPack.engineerId).toBe(engineer.id);
    expect(exported.exportedJson).toContain('"type": "fix-pack"');
    expect(exported.fixPack.acknowledgment.required).toBe(true);

    const assigned = await leadCaller.fixPacks.assign({
      fixPackId: exported.fixPack.id,
      assignedTo: engineer.id,
      dueAt: "2024-06-30T23:59:59.999Z",
      note: "Review with supervisor",
    });

    expect(assigned.workflow.status).toBe("assigned");
    expect(assigned.workflow.assignedTo).toBe(engineer.id);
    expect(assigned.workflow.assignedBy).toBe(1);

    const acknowledged = await userCaller.fixPacks.acknowledge({
      fixPackId: exported.fixPack.id,
      note: "Reviewed",
    });

    expect(acknowledged.workflow.status).toBe("acknowledged");
    expect(acknowledged.workflow.acknowledgedBy).toBe(10);
    expect(acknowledged.fixPack.acknowledgment.acknowledgedBy).toBe("10");
    expect(acknowledged.exportedJson).toContain('"acknowledgedBy": "10"');
  });
});
