/**
 * Release Verification Contract Tests
 *
 * These tests ensure the release verification scripts and workflow
 * maintain their contract and prevent drift.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPTS_DIR = path.join(REPO_ROOT, "scripts/release");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github/workflows");

describe("Release Verification Contract Tests", () => {
  // ===========================================================================
  // Script Existence Tests
  // ===========================================================================
  describe("Script Files", () => {
    it("smoke-check.sh exists and is executable", () => {
      const scriptPath = path.join(SCRIPTS_DIR, "smoke-check.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const stats = fs.statSync(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it("monitor-snapshot.sh exists and is executable", () => {
      const scriptPath = path.join(SCRIPTS_DIR, "monitor-snapshot.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const stats = fs.statSync(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });
  });

  // ===========================================================================
  // smoke-check.sh Contract Tests
  // ===========================================================================
  describe("smoke-check.sh Contract", () => {
    let scriptContent: string;

    beforeAll(() => {
      scriptContent = fs.readFileSync(
        path.join(SCRIPTS_DIR
, "smoke-check.sh"),
        "utf-8"
      );
    });

    it("accepts base_url as first argument", () => {
      expect(scriptContent).toContain('BASE_URL="${1:-}"');
    });

    it("accepts expected_git_sha as second argument", () => {
      expect(scriptContent).toContain('EXPECTED_GIT_SHA="${2:-}"');
    });

    it("accepts mode as third argument with default soft", () => {
      expect(scriptContent).toContain('MODE="${3:-soft}"');
    });

    it("creates required output files", () => {
      expect(scriptContent).toContain("homepage.txt");
      expect(scriptContent).toContain("health.txt");
      expect(scriptContent).toContain("version.json");
      expect(scriptContent).toContain("deployed_sha.txt");
      expect(scriptContent).toContain("summary.json");
    });

    it("writes MISSING_EVIDENCE marker when gitSha cannot be parsed", () => {
      expect(scriptContent).toContain("MISSING_EVIDENCE:");
    });

    it("exits non-zero in strict mode when evidence missing", () => {
      expect(scriptContent).toContain('MODE" == "strict"');
      expect(scriptContent).toContain("exit 1");
    });
  });

  // ===========================================================================
  // monitor-snapshot.sh Contract Tests
  // ===========================================================================
  describe("monitor-snapshot.sh Contract", () => {
    let scriptContent: string;

    beforeAll(() => {
      scriptContent = fs.readFileSync(
        path.join(SCRIPTS_DIR, "monitor-snapshot.sh"),
        "utf-8"
      );
    });

    it("accepts base_url as first argument", () => {
      expect(scriptContent).toContain('BASE_URL="${1:-}"');
    });

    it("accepts mode as second argument with default soft", () => {
      expect(scriptContent).toContain('MODE="${2:-soft}"');
    });

    it("creates metrics.txt OR missing_evidence.txt", () => {
      expect(scriptContent).toContain("metrics.txt");
      expect(scriptContent).toContain("missing_evidence.txt");
    });

    it("creates health_sample.json and summary.json", () => {
      expect(scriptContent).toContain("health_sample.json");
      expect(scriptContent).toContain("summary.json");
    });

    it("writes MISSING_EVIDENCE marker when metrics unavailable", () => {
      expect(scriptContent).toContain("MISSING_EVIDENCE:");
    });

    it("sets evidenceType to METRICS or HEALTH_ONLY", () => {
      expect(scriptContent).toContain('EVIDENCE_TYPE="METRICS"');
      expect(scriptContent).toContain('EVIDENCE_TYPE="HEALTH_ONLY"');
    });
  });

  // ===========================================================================
  // Workflow Contract Tests
  // ===========================================================================
  describe("release-verification.yml Contract", () => {
    let workflowContent: string;
    let workflow: any;

    beforeAll(() => {
      const workflowPath = path.join(WORKFLOWS_DIR, "release-verification.yml");
      workflowContent = fs.readFileSync(workflowPath, "utf-8");
      workflow = yaml.parse(workflowContent);
    });

    it("only one release-verification workflow exists", () => {
      const workflowFiles = fs
        .readdirSync(WORKFLOWS_DIR)
        .filter((f) => f.includes("release-verification"));
      expect(workflowFiles).toHaveLength(1);
      expect(workflowFiles[0]).toBe("release-verification.yml");
    });

    it("has required inputs for single-target mode", () => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs).toHaveProperty("target_url");
      expect(inputs).toHaveProperty("expected_git_sha");
      expect(inputs).toHaveProperty("mode");
    });

    it("has required inputs for orchestration mode", () => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs).toHaveProperty("verify_staging");
      expect(inputs).toHaveProperty("verify_production");
      expect(inputs).toHaveProperty("staging_url");
      expect(inputs).toHaveProperty("production_url");
    });

    it("mode input has soft and strict options", () => {
      const modeInput = workflow.on.workflow_dispatch.inputs.mode;
      expect(modeInput.options).toContain("soft");
      expect(modeInput.options).toContain("strict");
      expect(modeInput.default).toBe("soft");
    });

    it("workflow invokes smoke-check.sh with correct arguments", () => {
      expect(workflowContent).toContain("./scripts/release/smoke-check.sh");
      expect(workflowContent).toContain("${{ inputs.target_url }}");
      expect(workflowContent).toContain("${{ inputs.expected_git_sha }}");
      expect(workflowContent).toContain("${{ inputs.mode }}");
    });

    it("workflow invokes monitor-snapshot.sh with correct arguments", () => {
      expect(workflowContent).toContain("./scripts/release/monitor-snapshot.sh");
    });

    it("workflow reads deployed_sha.txt and surfaces in outputs", () => {
      expect(workflowContent).toContain("deployed_sha.txt");
      expect(workflowContent).toContain("deployed_sha=");
    });

    it("production verification requires staging to pass first", () => {
      expect(workflowContent).toContain("needs: [verify-staging]");
      expect(workflowContent).toContain("needs.verify-staging.outputs.smoke_status");
    });

    it("production always uses strict mode", () => {
      expect(workflowContent).toContain('"strict"');
    });
  });

  // ===========================================================================
  // Workflow-Script Alignment Tests
  // ===========================================================================
  describe("Workflow-Script Alignment", () => {
    let workflowContent: string;
    let smokeScript: string;
    let monitorScript: string;

    beforeAll(() => {
      workflowContent = fs.readFileSync(
        path.join(WORKFLOWS_DIR, "release-verification.yml"),
        "utf-8"
      );
      smokeScript = fs.readFileSync(
        path.join(SCRIPTS_DIR, "smoke-check.sh"),
        "utf-8"
      );
      monitorScript = fs.readFileSync(
        path.join(SCRIPTS_DIR, "monitor-snapshot.sh"),
        "utf-8"
      );
    });

    it("workflow log directory matches script log directory", () => {
      // Both should use logs/release/
      expect(smokeScript).toContain("logs/release/smoke");
      expect(monitorScript).toContain("logs/release/monitoring");
      expect(workflowContent).toContain("logs/release/");
    });

    it("workflow artifact upload includes script output directory", () => {
      expect(workflowContent).toContain("path: logs/release/");
    });
  });
});
