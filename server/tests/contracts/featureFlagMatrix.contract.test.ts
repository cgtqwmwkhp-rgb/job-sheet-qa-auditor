/**
 * Feature Flag Matrix Contract (PR-OPS-FLAGS)
 *
 * Verifies catalog + deploy contract for critical flags, effective process.env
 * snapshot, and systemRouter exposure (qa_lead gated). Read-only — no mutations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Feature Flag Matrix Contract (PR-OPS-FLAGS)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "test";
    delete process.env.FEATURE_OVERTURN_METRICS;
    delete process.env.FEATURE_PHOTO_PAIR_COMPARE;
    delete process.env.FEATURE_VLM_VERIFICATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("source structure", () => {
    it("featureFlagMatrix module exports getFeatureFlagMatrix", () => {
      const indexPath = path.resolve(
        __dirname,
        "../../services/featureFlagMatrix/index.ts"
      );
      const catalogPath = path.resolve(
        __dirname,
        "../../services/featureFlagMatrix/catalog.ts"
      );
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(fs.existsSync(catalogPath)).toBe(true);

      const content = fs.readFileSync(indexPath, "utf-8");
      expect(content).toContain("export function getFeatureFlagMatrix");
      expect(content).not.toMatch(/az\s+containerapp/);
      expect(content).not.toContain("writeFile");
    });

    it("systemRouter exposes featureFlagMatrix via qaLeadProcedure", () => {
      const routerPath = path.resolve(__dirname, "../../_core/systemRouter.ts");
      const content = fs.readFileSync(routerPath, "utf-8");
      expect(content).toContain("featureFlagMatrix");
      expect(content).toContain("getFeatureFlagMatrix");
      expect(content).toMatch(/featureFlagMatrix:\s*qaLeadProcedure\.query/);
    });

    it("client page and route exist for admin/qa_lead", () => {
      const pagePath = path.resolve(
        __dirname,
        "../../../client/src/pages/FeatureFlagMatrix.tsx"
      );
      const appPath = path.resolve(__dirname, "../../../client/src/App.tsx");
      expect(fs.existsSync(pagePath)).toBe(true);
      const app = fs.readFileSync(appPath, "utf-8");
      expect(app).toContain("/ops/feature-flags");
      expect(app).toContain('allowedRoles={["admin", "qa_lead"]}');
    });
  });

  describe("critical deploy parity", () => {
    it("must-match critical flags have identical staging/prod expectations", async () => {
      const { FEATURE_FLAG_CATALOG } = await import(
        "../../services/featureFlagMatrix"
      );
      const mustMatch = FEATURE_FLAG_CATALOG.filter(
        e => e.critical && e.parity === "must_match"
      );
      expect(mustMatch.length).toBeGreaterThanOrEqual(8);
      for (const entry of mustMatch) {
        expect(entry.deploy.staging).toBe(entry.deploy.production);
      }
      const keys = mustMatch.map(e => e.key);
      expect(keys).toContain("FEATURE_OVERTURN_METRICS");
      expect(keys).toContain("FEATURE_PHOTO_PAIR_COMPARE");
      expect(keys).toContain("FEATURE_SELECTION_MARKS");
      expect(keys).toContain("FEATURE_VLM_VERIFICATION");
      expect(keys).toContain("FEATURE_IMAGE_QA_INTAKE");
      expect(keys).toContain("FEATURE_GEMINI_MULTIMODAL");
      expect(keys).toContain("FEATURE_OCR_CROSS_CHECK");
      expect(keys).toContain("FEATURE_OCR_FAILOVER");
    });

    it("documents Wave-5/6 parts + depth flags as default-off with deploy true/true", async () => {
      const { FEATURE_FLAG_CATALOG } = await import(
        "../../services/featureFlagMatrix"
      );
      const byKey = Object.fromEntries(
        FEATURE_FLAG_CATALOG.map(e => [e.key, e])
      );
      for (const key of [
        "FEATURE_PARTS_WEB_VERIFY",
        "FEATURE_PARTS_ASSET_FITMENT",
        "FEATURE_FIELD_VOTE",
        "FEATURE_ROI_CROP_REOCR",
        "FEATURE_ENSEMBLE_EXTRACTION",
        "FEATURE_COMMENT_LLM_ADVISORY",
        "FEATURE_PHOTO_PAIR_GEMINI",
      ] as const) {
        expect(byKey[key]?.defaultWhenUnset).toBe("off");
        expect(byKey[key]?.deploy.staging).toBe("true");
        expect(byKey[key]?.deploy.production).toBe("true");
      }
    });

    it("documents azure-deploy true/true for AI + OCR flags", async () => {
      const { FEATURE_FLAG_CATALOG } = await import(
        "../../services/featureFlagMatrix"
      );
      const byKey = Object.fromEntries(
        FEATURE_FLAG_CATALOG.map(e => [e.key, e])
      );
      for (const key of [
        "FEATURE_VLM_VERIFICATION",
        "FEATURE_IMAGE_QA_INTAKE",
        "FEATURE_GEMINI_MULTIMODAL",
        "FEATURE_OCR_CROSS_CHECK",
        "FEATURE_OCR_FAILOVER",
      ] as const) {
        expect(byKey[key]?.deploy.staging).toBe("true");
        expect(byKey[key]?.deploy.production).toBe("true");
        expect(byKey[key]?.parity).toBe("must_match");
      }
    });
  });

  describe("getFeatureFlagMatrix", () => {
    it("returns effective flags from process.env (read-only snapshot)", async () => {
      process.env.FEATURE_OVERTURN_METRICS = "true";
      process.env.FEATURE_PHOTO_PAIR_COMPARE = "true";
      process.env.APP_ENV = "staging";

      const { getFeatureFlagMatrix } = await import(
        "../../services/featureFlagMatrix"
      );
      const snap = getFeatureFlagMatrix(new Date("2026-07-14T12:00:00.000Z"));

      expect(snap.readOnly).toBe(true);
      expect(snap.environment).toBe("staging");
      expect(snap.source.effective).toBe("process.env");
      expect(snap.criticalParity.allCriticalMatchedOrDocumented).toBe(true);

      const overturn = snap.flags.find(
        f => f.key === "FEATURE_OVERTURN_METRICS"
      );
      expect(overturn?.raw).toBe("true");
      expect(overturn?.truthy).toBe(true);
      expect(overturn?.matchesDeployContract).toBe(true);

      const vlm = snap.flags.find(f => f.key === "FEATURE_VLM_VERIFICATION");
      expect(vlm?.raw).toBeNull();
      // staging contract: true in azure-deploy
      expect(vlm?.matchesDeployContract).toBe(false);

      expect(
        snap.deployMatrix.some(r => r.key === "FEATURE_OVERTURN_METRICS")
      ).toBe(true);
    });

    it("flags drift when staging process lacks a must-match true flag", async () => {
      process.env.APP_ENV = "staging";
      delete process.env.FEATURE_OVERTURN_METRICS;

      const { getFeatureFlagMatrix } = await import(
        "../../services/featureFlagMatrix"
      );
      const snap = getFeatureFlagMatrix();
      const overturn = snap.flags.find(
        f => f.key === "FEATURE_OVERTURN_METRICS"
      );
      expect(overturn?.matchesDeployContract).toBe(false);
    });

    it("never returns secret key values in keyEnv", async () => {
      process.env.MISTRAL_API_KEY = "sk-secret-should-not-leak";
      process.env.GEMINI_API_KEY = "gemini-secret";

      const { getFeatureFlagMatrix } = await import(
        "../../services/featureFlagMatrix"
      );
      const snap = getFeatureFlagMatrix();
      const mistral = snap.keyEnv.find(e => e.key === "MISTRAL_API_KEY");
      expect(mistral?.configured).toBe(true);
      expect(mistral?.raw).toBeNull();
      expect(JSON.stringify(snap)).not.toContain("sk-secret-should-not-leak");
      expect(JSON.stringify(snap)).not.toContain("gemini-secret");
    });

    it("lists uncatalogued FEATURE_* from process.env", async () => {
      process.env.FEATURE_UNKNOWN_TEST_FLAG = "true";

      const { getFeatureFlagMatrix } = await import(
        "../../services/featureFlagMatrix"
      );
      const snap = getFeatureFlagMatrix();
      expect(
        snap.uncatalogued.some(u => u.key === "FEATURE_UNKNOWN_TEST_FLAG")
      ).toBe(true);
    });
  });
});
