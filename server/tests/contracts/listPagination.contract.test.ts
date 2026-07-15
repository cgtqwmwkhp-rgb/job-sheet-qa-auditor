import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const routerPath = path.resolve(__dirname, "../../routers.ts");
const auditResultsPath = path.resolve(
  __dirname,
  "../../../client/src/pages/AuditResults.tsx"
);

describe("List pagination contract", () => {
  const routerSource = fs.readFileSync(routerPath, "utf-8");

  it.each(["jobSheets", "audits"])(
    "%s.list returns items with an honest hasMore flag",
    routerName => {
      const routerMatch = routerSource.match(
        new RegExp(
          `${routerName}: router\\(\\{([\\s\\S]*?)(?=\\n  \\},\\n\\n  // ============|$)`
        )
      );

      expect(routerMatch?.[1]).toContain("limit: limit + 1");
      expect(routerMatch?.[1]).toContain("items:");
      expect(routerMatch?.[1]).toContain("hasMore:");
      expect(routerMatch?.[1]).toContain("length > limit");
    }
  );

  it("uses hasMore rather than page-size inference in Audit Results", () => {
    const auditResultsSource = fs.readFileSync(auditResultsPath, "utf-8");

    expect(auditResultsSource).toContain(
      "const hasMoreJobSheets = jobSheetPage?.hasMore ?? false"
    );
    expect(auditResultsSource).not.toContain(
      "jobSheetPage?.length === JOB_SHEET_PAGE_SIZE"
    );
  });
});
