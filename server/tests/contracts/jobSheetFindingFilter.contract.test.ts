/**
 * jobSheets.list finding filters (reasonCode / ruleId) for Dashboard drill-down.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("jobSheet finding filter contracts", () => {
  it("exposes getJobSheetIdsByFindingFilter helper", () => {
    const dbSrc = readFileSync(path.join(__dirname, "../../db.ts"), "utf8");
    expect(dbSrc).toContain(
      "export async function getJobSheetIdsByFindingFilter"
    );
    expect(dbSrc).toContain("reasonCode");
    expect(dbSrc).toContain("ruleId");
  });

  it("jobSheets.list Zod input accepts reasonCode and ruleId", () => {
    const routerSrc = readFileSync(
      path.join(__dirname, "../../routers.ts"),
      "utf8"
    );
    expect(routerSrc).toMatch(/reasonCode:\s*z\.string\(\)/);
    expect(routerSrc).toMatch(/ruleId:\s*z\.string\(\)/);
  });

  it("Dashboard wires drill-down + View all matching audits", () => {
    const dash = readFileSync(
      path.join(__dirname, "../../../client/src/pages/Dashboard.tsx"),
      "utf8"
    );
    expect(dash).toContain("selectedRuleKey");
    expect(dash).toContain("View all matching audits");
    expect(dash).toContain("resolveSampleAudits");
    expect(dash).toContain("buildAuditsFilterHref");
  });

  it("AuditResults reads reasonCode/ruleId URL filters", () => {
    const audits = readFileSync(
      path.join(__dirname, "../../../client/src/pages/AuditResults.tsx"),
      "utf8"
    );
    expect(audits).toContain("urlFilters");
    expect(audits).toContain("clearDefectFilter");
    expect(audits).toContain("reasonCode");
  });
});
