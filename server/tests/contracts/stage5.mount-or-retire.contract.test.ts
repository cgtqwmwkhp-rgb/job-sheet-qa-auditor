/**
 * PR-PLAT-STAGE5 — mount-or-retire contract
 *
 * Decision: RETIRE / quarantine phantom Stage-5 APIs and simulated orchestrator.
 * Challenge bar: no simulated pipeline presented as production capability.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf-8");
}

describe("PR-PLAT-STAGE5: mount-or-retire (retire)", () => {
  const routersTs = readRepoFile("server/routers.ts");

  it("does not mount quarantined Stage-5 phantom routers on appRouter", () => {
    expect(routersTs).not.toMatch(
      /from\s+["'].*\/(auditRouter|pipelineRouter|reviewQueueRouter)["']/
    );
    expect(routersTs).not.toMatch(
      /from\s+["'].*\/_quarantine\/(auditRouter|pipelineRouter|reviewQueueRouter)["']/
    );
    // Must not register phantom routers as top-level appRouter namespaces
    expect(routersTs).not.toMatch(/\bpipeline\s*:\s*pipelineRouter\b/);
    expect(routersTs).not.toMatch(/\breviewQueue\s*:\s*reviewQueueRouter\b/);
    expect(routersTs).not.toMatch(/\baudit\s*:\s*auditRouter\b/);
    expect(routersTs).toContain("PR-PLAT-STAGE5 (retire)");
    expect(routersTs).toContain("orchestrateJobSheetProcessing");
  });

  it("does not wire the simulated Stage-7 orchestrator into appRouter", () => {
    expect(routersTs).not.toMatch(/services\/orchestration/);
    expect(routersTs).not.toMatch(
      /from\s+["'].*orchestration.*["']/
    );
    expect(routersTs).not.toMatch(/\bcreateOrchestrator\b/);
  });

  it("keeps phantom routers under quarantine with honest banners", () => {
    for (const file of [
      "server/routers/_quarantine/auditRouter.ts",
      "server/routers/_quarantine/pipelineRouter.ts",
      "server/routers/_quarantine/reviewQueueRouter.ts",
    ]) {
      const src = readRepoFile(file);
      expect(src).toContain("QUARANTINED");
      expect(src).toContain("NOT mounted on appRouter");
    }

    const pipeline = readRepoFile(
      "server/routers/_quarantine/pipelineRouter.ts"
    );
    expect(pipeline).toContain("pipelineStore");
    expect(pipeline).toMatch(/useMockOcr|Simulate async processing/i);
  });

  it("quarantines simulateDelay orchestrator away from production claims", () => {
    const orch = readRepoFile(
      "server/services/orchestration/_quarantine/orchestrator.ts"
    );
    expect(orch).toContain("QUARANTINED");
    expect(orch).toContain("simulateDelay");
    expect(orch).not.toContain("Default instance for production");
    expect(orch).toContain("documentProcessor");

    const index = readRepoFile("server/services/orchestration/index.ts");
    expect(index).toContain("_quarantine/orchestrator");
    expect(index).toContain("QUARANTINED");
  });

  it("keeps documentProcessor as the sole live job-sheet orchestrator entry", () => {
    expect(routersTs).toContain(
      'from "./services/documentProcessor"'
    );
    expect(routersTs).toContain("orchestrateJobSheetProcessing");
  });
});
