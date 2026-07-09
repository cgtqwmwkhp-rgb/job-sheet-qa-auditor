import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("Analytics site filter contracts", () => {
  const filtersHook = readRepoFile("client/src/hooks/useAnalyticsFilters.ts");
  const layout = readRepoFile("client/src/pages/analytics/AnalyticsLayout.tsx");
  const router = readRepoFile("server/routers/analyticsRouter.ts");
  const db = readRepoFile("server/db.ts");

  it("keeps site in the shared analytics filter state", () => {
    expect(filtersHook).toContain("site: string");
    expect(filtersHook).toContain("setSite");
    expect(filtersHook).toContain("rangeForPreset(preset, filtersState.site)");
  });

  it("renders a layout-level site filter control", () => {
    expect(layout).toContain('placeholder="Filter by site"');
    expect(layout).toContain("setSite(event.target.value)");
  });

  it("accepts site on analytics period inputs", () => {
    expect(router).toContain("site: z.string().optional()");
    expect(router).toContain("normalizeSite(input?.site)");
    expect(router).toContain("site: normalizeSite(input?.site)");
  });

  it("threads siteInfo into DB-backed analytics queries", () => {
    expect(db).toContain("site?: string");
    expect(db).toContain("eq(jobSheets.siteInfo, options.site)");
    expect(db).toContain("eq(jobSheets.siteInfo, site)");
  });
});
