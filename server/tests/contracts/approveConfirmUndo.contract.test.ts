/**
 * PX-086/087: Approve open / Bulk Approve require confirm + undo.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("approve confirm + undo (PX-086/087)", () => {
  it("workstation Approve open uses confirm dialog and undoTokens", () => {
    const src = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../client/src/components/review/ReviewWorkstationPane.tsx"
      ),
      "utf8"
    );
    expect(src).toContain("Approve open findings?");
    expect(src).toContain("bulkApproveConfirmOpen");
    expect(src).toContain("undoTokens");
    expect(src).toContain("Undid");
  });

  it("HoldQueue Bulk Approve confirms and offers Undo all", () => {
    const src = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../client/src/pages/HoldQueue.tsx"
      ),
      "utf8"
    );
    expect(src).toContain("Bulk approve job sheets?");
    expect(src).toContain("Undo all");
    expect(src).toContain("runBulkApprove");
  });
});
