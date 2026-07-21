/**
 * PX-064: accepted dispute must overturn the finding.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("dispute accept overturn (PX-064)", () => {
  it("disputes.updateStatus calls overrideFinding on accepted", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../routers.ts"),
      "utf8"
    );
    expect(src).toContain("overrideFinding");
    expect(src).toContain('input.status === "accepted"');
    expect(src).toContain("findingOverturned");
    expect(src).toContain("disputeResolved");
  });

  it("exports overrideFinding helper from auditActionsRouter", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../routers/auditActionsRouter.ts"),
      "utf8"
    );
    expect(src).toContain("export async function overrideFinding");
  });
});
