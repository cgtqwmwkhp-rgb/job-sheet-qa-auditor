/**
 * Evidence Pack Contract Tests
 *
 * These tests ensure the release closeout evidence pack template and
 * validation script maintain their contract.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPTS_DIR = path.join(REPO_ROOT, "scripts/release");
const TEMPLATES_DIR = path.join(REPO_ROOT, "docs/templates");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence");

describe("Evidence Pack Contract Tests", () => {
  // ===========================================================================
  // Template Existence Tests
  // ===========================================================================
  describe("Template Files", () => {
    it("RELEASE_CLOSEOUT_EVIDENCE_PACK.md template exists", () => {
      const templatePath = path.join(
        TEMPLATES_DIR,
        "RELEASE_CLOSEOUT_EVIDENCE_PACK.md"
      );
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it("validate-evidence-pack.sh exists and is executable", () => {
      const scriptPath = path.join(SCRIPTS_DIR, "validate-evidence-pack.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const stats = fs.statSync(scriptPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });
  });

  // ===========================================================================
  // Template Structure Tests
  // ===========================================================================
  describe("Template Structure", () => {
    let templateContent: string;

    beforeAll(() => {
      templateContent = fs.readFileSync(
        path.join(TEMPLATES_DIR, "RELEASE_CLOSEOUT_EVIDENCE_PACK.md"),
        "utf-8"
      );
    });

    it("has Document Metadata section", () => {
      expect(templateContent).toContain("## Document Metadata");
    });

    it("has Pre-Release Verification section", () => {
      expect(templateContent).toContain("## 1. Pre-Release Verification");
    });

    it("has Deployment Verification section", () => {
      expect(templateContent).toContain("## 2. Deployment Verification");
    });

    it("has Parity Triage section", () => {
      expect(templateContent).toContain("## 3. Parity Triage");
    });

    it("has Production Readiness Checklist section", () => {
      expect(templateContent).toContain("## 4. Production Readiness Checklist");
    });

    it("has Sign-Off section", () => {
      expect(templateContent).toContain("## 5. Sign-Off");
    });

    it("has Artifacts section", () => {
      expect(templateContent).toContain("## 6. Artifacts");
    });

    it("has required metadata fields", () => {
      expect(templateContent).toContain("**Release Version**");
      expect(templateContent).toContain("**Release Date**");
      expect(templateContent).toContain("**Git SHA**");
      expect(templateContent).toContain("**Environment**");
      expect(templateContent).toContain("**Prepared By**");
      expect(templateContent).toContain("**Reviewed By**");
    });

    it("references ADR-003", () => {
      expect(templateContent).toContain("ADR-003");
    });

    it("includes parity suite sections", () => {
      expect(templateContent).toContain("Positive Suite");
      expect(templateContent).toContain("Negative Suite");
    });

    it("includes SHA verification", () => {
      expect(templateContent).toContain("SHA Verification");
    });

    it("references validation script", () => {
      expect(templateContent).toContain("validate-evidence-pack.sh");
    });
  });

  // ===========================================================================
  // Validation Script Contract Tests
  // ===========================================================================
  describe("Validation Script Contract", () => {
    let scriptContent: string;

    beforeAll(() => {
      scriptContent = fs.readFileSync(
        path.join(SCRIPTS_DIR, "validate-evidence-pack.sh"),
        "utf-8"
      );
    });

    it("accepts evidence-pack-file as argument", () => {
      expect(scriptContent).toContain('EVIDENCE_FILE="${1:-}"');
    });

    it("checks for required sections", () => {
      expect(scriptContent).toContain("## Document Metadata");
      expect(scriptContent).toContain("## 1. Pre-Release Verification");
      expect(scriptContent).toContain("## 2. Deployment Verification");
      expect(scriptContent).toContain("## 5. Sign-Off");
    });

    it("checks for required metadata fields", () => {
      expect(scriptContent).toContain("Release Version");
      expect(scriptContent).toContain("Release Date");
      expect(scriptContent).toContain("Git SHA");
      expect(scriptContent).toContain("Environment");
      expect(scriptContent).toContain("Prepared By");
    });

    it("detects template placeholders", () => {
      expect(scriptContent).toContain("PLACEHOLDER_PATTERNS");
      expect(scriptContent).toContain("<!-- REQUIRED:");
    });

    it("checks for approvals", () => {
      expect(scriptContent).toContain("✅ Approved");
    });

    it("validates ADR-003 compliance", () => {
      expect(scriptContent).toContain("ADR-003");
      expect(scriptContent).toContain("HEALTH_ONLY");
    });

    it("exits with code 0 on success", () => {
      expect(scriptContent).toContain("exit 0");
    });

    it("exits with code 1 on failure", () => {
      expect(scriptContent).toContain("exit 1");
    });
  });

  // ===========================================================================
  // Validation Execution Tests
  // ===========================================================================
  describe("Validation Execution", () => {
    it("template fails validation (expected - unpopulated)", () => {
      const templatePath = path.join(
        TEMPLATES_DIR,
        "RELEASE_CLOSEOUT_EVIDENCE_PACK.md"
      );
      const scriptPath = path.join(SCRIPTS_DIR, "validate-evidence-pack.sh");

      try {
        execSync(`${scriptPath} ${templatePath}`, { encoding: "utf-8" });
        // Should not reach here - template should fail validation
        expect(true).toBe(false);
      } catch (error: any) {
        // Expected to fail with exit code 1
        expect(error.status).toBe(1);
        expect(error.stdout).toContain("VALIDATION FAILED");
      }
    });

    it("sample evidence pack passes validation", () => {
      const samplePath = path.join(EVIDENCE_DIR, "SANDBOX_RELEASE_v1.0.0.md");
      const scriptPath = path.join(SCRIPTS_DIR, "validate-evidence-pack.sh");

      // Skip if sample doesn't exist
      if (!fs.existsSync(samplePath)) {
        return;
      }

      try {
        const result = execSync(`${scriptPath} ${samplePath}`, {
          encoding: "utf-8",
          cwd: REPO_ROOT,
        });
        expect(result).toContain("VALIDATION PASSED");
      } catch (error: any) {
        // If it fails, check if it's a real failure or just stderr output
        if (error.stdout && error.stdout.includes("VALIDATION PASSED")) {
          expect(error.stdout).toContain("VALIDATION PASSED");
        } else {
          throw error;
        }
      }
    });
  });

  // ===========================================================================
  // ADR-003 Integration Tests
  // ===========================================================================
  describe("ADR-003 Integration", () => {
    let scriptContent: string;

    beforeAll(() => {
      scriptContent = fs.readFileSync(
        path.join(SCRIPTS_DIR, "validate-evidence-pack.sh"),
        "utf-8"
      );
    });

    it("validates HEALTH_ONLY for production environments", () => {
      expect(scriptContent).toContain("production");
      expect(scriptContent).toContain("staging");
      expect(scriptContent).toContain("ADR-003 VIOLATION");
    });

    it("allows HEALTH_ONLY for non-production environments", () => {
      // Script checks for production/staging and blocks HEALTH_ONLY=true for those
      // All other environments (sandbox, dev, etc.) are implicitly allowed
      expect(scriptContent).toContain('"production"');
      expect(scriptContent).toContain('"staging"');
    });
  });
});
