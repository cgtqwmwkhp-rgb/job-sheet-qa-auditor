import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("AuditResults pagination contract", () => {
  const auditResultsPath = path.resolve(
    __dirname,
    "../../../client/src/pages/AuditResults.tsx"
  );
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(auditResultsPath, "utf-8");
  });

  it("requests job-sheet and audit-result pages with offsets", () => {
    expect(content).toContain("offset: jobSheetOffset");
    expect(content).toContain("offset: auditOffset");
    expect(content).toContain("JOB_SHEET_PAGE_SIZE");
    expect(content).toContain("AUDIT_PAGE_SIZE");
  });

  it("offers a load-more action instead of presenting a partial list as total", () => {
    expect(content).toContain("Load ${JOB_SHEET_PAGE_SIZE} more audits");
    expect(content).toContain("Showing {allJobSheets.length} loaded audits");
    expect(content).not.toContain("allJobSheets.length} total");
  });
});
