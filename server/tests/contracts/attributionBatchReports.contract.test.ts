import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const routersSource = fs.readFileSync(
  path.join(process.cwd(), "server/routers.ts"),
  "utf-8"
);

describe("attribution report loading", () => {
  it("loads latest reports in batches instead of per-sheet queries", () => {
    expect(routersSource).not.toContain("getLatestAuditReportJson(sheet.id)");

    const batchCalls = routersSource.match(
      /getLatestAuditReportJsonsForJobSheets\(\s*sheets\.map\(sheet => sheet\.id\)/g
    );
    expect(batchCalls).toHaveLength(4);
  });
});
