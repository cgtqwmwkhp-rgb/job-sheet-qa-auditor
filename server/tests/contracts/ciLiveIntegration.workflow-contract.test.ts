import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { describe, expect, it } from "vitest";

const workflowPath = path.join(
  process.cwd(),
  ".github/workflows/ci-live-integration.yml"
);

describe("CI live AI integration workflow contract", () => {
  const workflowContent = fs.readFileSync(workflowPath, "utf-8");
  const workflow = yaml.parse(workflowContent);

  it("defines manual and weekly triggers", () => {
    expect(workflow.on.workflow_dispatch).toBeDefined();
    expect(workflow.on.schedule).toEqual([{ cron: "0 8 * * 1" }]);
  });

  it("always runs the liveMetrics CLI contract without secrets", () => {
    const contractJob = workflow.jobs["live-metrics-contract"];

    expect(contractJob).toBeDefined();
    expect(contractJob["continue-on-error"]).toBeUndefined();

    const contractStep = contractJob.steps.find(
      (step: { name?: string }) => step.name === "Run liveMetrics CLI contract"
    );

    expect(contractStep).toMatchObject({
      run: "pnpm test -- server/tests/contracts/liveMetricsCli.contract.test.ts",
      env: {
        DATABASE_URL: "",
      },
    });
  });

  it("keeps the default path free of required secrets", () => {
    expect(workflowContent).not.toContain("required: true");
    expect(workflowContent).not.toMatch(
      /secrets\.DATABASE_URL[\s\S]*live-metrics-contract/
    );

    const liveJob = workflow.jobs["live-eval-drift"];
    expect(liveJob).toBeDefined();
    expect(liveJob["continue-on-error"]).toBe(true);

    const databaseUrlGate = liveJob.steps.find(
      (step: { id?: string }) => step.id === "database-url-gate"
    );
    expect(databaseUrlGate.run).toContain("DATABASE_URL is not configured");
    expect(databaseUrlGate.run).toContain("available=false");
  });

  it("gates live eval and drift commands on DATABASE_URL", () => {
    const liveJob = workflow.jobs["live-eval-drift"];
    const liveSteps = liveJob.steps.filter((step: { run?: string }) =>
      step.run?.includes("--live")
    );

    expect(liveSteps.map((step: { run: string }) => step.run)).toEqual([
      "pnpm eval:run --mode fixtures --live",
      "pnpm drift:check --live",
    ]);

    for (const step of liveSteps) {
      expect(step.if).toBe(
        "steps.database-url-gate.outputs.available == 'true'"
      );
    }
  });
});
