/**
 * Release Verification Contract Tests
 *
 * These tests validate the release verification scripts and workflow invariants.
 * No external secrets required - all tests are deterministic and local.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const SCRIPTS_DIR = path.join(PROJECT_ROOT, "scripts/release");
const LOGS_DIR = path.join(PROJECT_ROOT, "logs/release");
const WORKFLOW_FILE = path.join(
  PROJECT_ROOT,
  ".github/workflows/release-verification.yml"
);

// Mock server for testing
let mockServer: http.Server | null = null;
let mockServerPort = 0;
let mockVersionResponse: object = {};
let mockHealthResponse: object = {};

function startMockServer(
  versionResponse: object,
  healthResponse: object
): Promise<number> {
  return new Promise((resolve, reject) => {
    mockVersionResponse = versionResponse;
    mockHealthResponse = healthResponse;

    mockServer = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.url?.includes("/api/trpc/system.version")) {
        res.writeHead(200);
        res.end(JSON.stringify({ result: { data: mockVersionResponse } }));
      } else if (req.url?.includes("/api/trpc/system.health")) {
        res.writeHead(200);
        res.end(JSON.stringify({ result: { data: mockHealthResponse } }));
      } else if (req.url === "/") {
        res.writeHead(200);
        res.end("<html><body>OK</body></html>");
      } else if (req.url === "/metrics") {
        // No metrics endpoint - return 404
        res.writeHead(404);
        res.end("Not Found");
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    mockServer.listen(0, "127.0.0.1", () => {
      const address = mockServer!.address();
      if (address && typeof address === "object") {
        mockServerPort = address.port;
        resolve(mockServerPort);
      } else {
        reject(new Error("Failed to get server port"));
      }
    });
  });
}

function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function cleanLogs() {
  if (fs.existsSync(LOGS_DIR)) {
    fs.rmSync(LOGS_DIR, { recursive: true, force: true });
  }
}

describe("Release Verification Scripts", () => {
  describe("smoke-check.sh", () => {
    const SMOKE_SCRIPT = path.join(SCRIPTS_DIR, "smoke-check.sh");

    beforeAll(() => {
      // Ensure script exists and is executable
      expect(fs.existsSync(SMOKE_SCRIPT)).toBe(true);
      fs.chmodSync(SMOKE_SCRIPT, "755");
    });

    afterAll(async () => {
      await stopMockServer();
      cleanLogs();
    });

    it("should create required output files", async () => {
      cleanLogs();

      // Start mock server with valid version response
      const port = await startMockServer(
        { gitSha: "abc123def456", version: "1.0.0" },
        { status: "healthy", database: "connected" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      try {
        execSync(`${SMOKE_SCRIPT} "${targetUrl}"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e) {
        // Script may exit with non-zero in some cases, that's OK
      }

      // Verify required output files exist
      const smokeDir = path.join(LOGS_DIR, "smoke");
      expect(fs.existsSync(path.join(smokeDir, "summary.json"))).toBe(true);
      expect(fs.existsSync(path.join(smokeDir, "deployed_sha.txt"))).toBe(true);
      expect(fs.existsSync(path.join(smokeDir, "homepage.log"))).toBe(true);
      expect(fs.existsSync(path.join(smokeDir, "health.log"))).toBe(true);
      expect(fs.existsSync(path.join(smokeDir, "version.json"))).toBe(true);

      await stopMockServer();
    });

    it("should capture deployed SHA from version endpoint", async () => {
      cleanLogs();

      const expectedSha = "d589d5514b02345253e1c06da38ca4fdbac9a630";
      const port = await startMockServer(
        { gitSha: expectedSha, version: "1.0.0" },
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      try {
        execSync(`${SMOKE_SCRIPT} "${targetUrl}"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e) {
        // Ignore exit code
      }

      const deployedSha = fs
        .readFileSync(path.join(LOGS_DIR, "smoke/deployed_sha.txt"), "utf-8")
        .trim();
      expect(deployedSha).toBe(expectedSha);

      await stopMockServer();
    });

    it("should fail in strict mode when version endpoint missing gitSha", async () => {
      cleanLogs();

      // Start mock server WITHOUT gitSha in response
      const port = await startMockServer(
        { version: "1.0.0" }, // No gitSha!
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      let exitCode = 0;
      try {
        execSync(`${SMOKE_SCRIPT} "${targetUrl}" "" "strict"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e: any) {
        exitCode = e.status || 1;
      }

      // Should fail in strict mode
      expect(exitCode).not.toBe(0);

      // deployed_sha.txt should indicate missing evidence
      const deployedSha = fs
        .readFileSync(path.join(LOGS_DIR, "smoke/deployed_sha.txt"), "utf-8")
        .trim();
      expect(deployedSha).toContain("MISSING_EVIDENCE");

      await stopMockServer();
    });

    it("should detect SHA mismatch in strict mode", async () => {
      cleanLogs();

      const deployedSha = "abc123";
      const expectedSha = "xyz789";

      const port = await startMockServer(
        { gitSha: deployedSha, version: "1.0.0" },
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      let exitCode = 0;
      try {
        execSync(`${SMOKE_SCRIPT} "${targetUrl}" "${expectedSha}" "strict"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e: any) {
        exitCode = e.status || 1;
      }

      // Should fail due to SHA mismatch
      expect(exitCode).not.toBe(0);

      await stopMockServer();
    });
  });

  describe("monitor-snapshot.sh", () => {
    const MONITOR_SCRIPT = path.join(SCRIPTS_DIR, "monitor-snapshot.sh");

    beforeAll(() => {
      expect(fs.existsSync(MONITOR_SCRIPT)).toBe(true);
      fs.chmodSync(MONITOR_SCRIPT, "755");
    });

    afterAll(async () => {
      await stopMockServer();
      cleanLogs();
    });

    it("should create required output files", async () => {
      cleanLogs();

      const port = await startMockServer(
        { gitSha: "abc123" },
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      try {
        execSync(`${MONITOR_SCRIPT} "${targetUrl}"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e) {
        // Ignore exit code
      }

      const monitorDir = path.join(LOGS_DIR, "monitoring");
      expect(fs.existsSync(path.join(monitorDir, "summary.json"))).toBe(true);

      // Should have either metrics.txt OR missing_evidence.txt
      const hasMetrics = fs.existsSync(path.join(monitorDir, "metrics.txt"));
      const hasMissingEvidence = fs.existsSync(
        path.join(monitorDir, "missing_evidence.txt")
      );
      expect(hasMetrics || hasMissingEvidence).toBe(true);

      await stopMockServer();
    });

    it("should write missing_evidence.txt when metrics unavailable", async () => {
      cleanLogs();

      // Mock server returns 404 for /metrics
      const port = await startMockServer(
        { gitSha: "abc123" },
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      try {
        execSync(`${MONITOR_SCRIPT} "${targetUrl}"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e) {
        // Ignore exit code
      }

      const missingEvidenceFile = path.join(
        LOGS_DIR,
        "monitoring/missing_evidence.txt"
      );
      expect(fs.existsSync(missingEvidenceFile)).toBe(true);

      const content = fs.readFileSync(missingEvidenceFile, "utf-8");
      expect(content).toContain("MISSING_EVIDENCE");

      await stopMockServer();
    });

    it("should NOT fake success when metrics unavailable", async () => {
      cleanLogs();

      const port = await startMockServer(
        { gitSha: "abc123" },
        { status: "healthy" }
      );

      const targetUrl = `http://127.0.0.1:${port}`;

      try {
        execSync(`${MONITOR_SCRIPT} "${targetUrl}"`, {
          cwd: PROJECT_ROOT,
          stdio: "pipe",
        });
      } catch (e) {
        // Ignore exit code
      }

      const summaryFile = path.join(LOGS_DIR, "monitoring/summary.json");
      const summary = JSON.parse(fs.readFileSync(summaryFile, "utf-8"));

      // Should NOT claim metrics were captured
      expect(summary.checks.metrics).not.toBe("CAPTURED");
      expect(summary.evidence_type).not.toBe("METRICS");

      await stopMockServer();
    });
  });

  describe("release-verification.yml workflow", () => {
    it("should exist and be valid YAML", () => {
      expect(fs.existsSync(WORKFLOW_FILE)).toBe(true);

      const content = fs.readFileSync(WORKFLOW_FILE, "utf-8");

      // Basic YAML structure checks
      expect(content).toContain("name: Release Verification");
      expect(content).toContain("workflow_dispatch:");
      expect(content).toContain("environment_name:");
      expect(content).toContain("target_url:");
    });

    it("should use deployed SHA not github.sha in summary", () => {
      const content = fs.readFileSync(WORKFLOW_FILE, "utf-8");

      // Should reference deployed_sha from output
      expect(content).toContain("deployed_sha");
      expect(content).toContain("steps.read-sha.outputs.deployed_sha");

      // Summary should show deployed SHA prominently
      expect(content).toContain("**Deployed SHA**");
    });

    it("should enforce strict mode for production", () => {
      const content = fs.readFileSync(WORKFLOW_FILE, "utf-8");

      // Should force strict mode for production
      expect(content).toContain('production always uses strict');
      expect(content).toContain('ENV" == "production"');
      expect(content).toContain('MODE="strict"');
    });

    it("should support staging→production orchestration", () => {
      const content = fs.readFileSync(WORKFLOW_FILE, "utf-8");

      // Should have orchestration inputs
      expect(content).toContain("verify_staging:");
      expect(content).toContain("verify_production:");
      expect(content).toContain("staging_url:");
      expect(content).toContain("production_url:");

      // Production should depend on staging
      expect(content).toContain("needs: [verify-staging]");
    });
  });
});
