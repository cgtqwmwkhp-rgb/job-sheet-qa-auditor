import { describe, expect, it } from "vitest";
import type { User } from "../../../drizzle/schema";
import { appRouter } from "../../routers";

function technicianCaller() {
  const user: User = {
    id: 10,
    openId: "technician-test",
    name: "Test Technician",
    email: "technician@example.com",
    loginMethod: "test",
    role: "technician",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user,
  });
}

async function expectTechnicianRejected(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "FORBIDDEN" });
}

describe("staff API gates", () => {
  it("rejects technicians from analytics and attribution APIs", async () => {
    const caller = technicianCaller();

    await expectTechnicianRejected(caller.analytics.getExecutiveSummary());
    await expectTechnicianRejected(caller.analytics.getEngineerSummary());
    await expectTechnicianRejected(caller.jobSheets.listTechnicians());
    await expectTechnicianRejected(caller.jobSheets.getAttributionGap());
    await expectTechnicianRejected(
      caller.jobSheets.assignTechnician({ id: 1, technicianId: 2 })
    );
  });

  it("rejects technicians from dispute lists and fix pack exports", async () => {
    const caller = technicianCaller();

    await expectTechnicianRejected(caller.disputes.list());
    await expectTechnicianRejected(
      caller.fixPacks.export({
        engineer: {
          id: "eng-001",
          name: "Test Engineer",
          employeeId: "EMP-001",
          startDate: "2024-01-01",
          isActive: true,
        },
        issues: [
          {
            id: "issue-001",
            engineerId: "eng-001",
            documentId: "doc-001",
            issueType: "MISSING_FIELD",
            severity: "S1",
            fieldName: "assetId",
            reasonCode: "MISSING_FIELD",
            occurredAt: "2024-06-10T10:00:00.000Z",
            wasDisputed: false,
            wasWaived: false,
            resolutionStatus: "open",
          },
        ],
      })
    );
  });
});
