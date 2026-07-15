import { describe, expect, it } from "vitest";
import { auditResultListSelection } from "../../db";

describe("Audit list payload contract", () => {
  it("omits reportJson from queue and archive list selects", () => {
    expect(auditResultListSelection).not.toHaveProperty("reportJson");
    expect(auditResultListSelection).toMatchObject({
      id: expect.anything(),
      jobSheetId: expect.anything(),
      result: expect.anything(),
      createdAt: expect.anything(),
    });
  });
});
