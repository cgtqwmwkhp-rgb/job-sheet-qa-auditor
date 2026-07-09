/**
 * Risk-based Routing Contract Tests (Phase 3.1)
 *
 * Fixtures/mocks only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default, routing thresholds, and critical override.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isRiskRoutingEnabled,
  routeByRisk,
  isCriticalFinding,
  DEFAULT_RISK_ROUTING_THRESHOLDS,
  type RiskRoutingFinding,
} from "../../services/riskRouting";

describe("Risk Routing Contract (Phase 3.1)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_RISK_ROUTING unset", () => {
      expect(isRiskRoutingEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_RISK_ROUTING=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isRiskRoutingEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isRiskRoutingEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isRiskRoutingEnabled()).toBe(false);
    });
  });

  describe("critical finding detection", () => {
    it("treats S0 and S1 as critical", () => {
      expect(isCriticalFinding({ severity: "S0" })).toBe(true);
      expect(isCriticalFinding({ severity: "S1" })).toBe(true);
      expect(isCriticalFinding({ severity: "critical" })).toBe(true);
    });

    it("does not treat S2/S3 as critical", () => {
      expect(isCriticalFinding({ severity: "S2" })).toBe(false);
      expect(isCriticalFinding({ severity: "S3" })).toBe(false);
    });
  });

  describe("routeByRisk decisions", () => {
    const jobSheetId = 42;

    it("auto_pass when high confidence and no critical findings", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: 0.95,
        findings: [],
      });

      expect(result.decision).toBe("auto_pass");
      expect(result.confidence).toBe(0.95);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.evidencePack).toBeUndefined();
    });

    it("auto_pass at exactly the high threshold", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: DEFAULT_RISK_ROUTING_THRESHOLDS.highThreshold,
        findings: [{ severity: "S2", reasonCode: "LOW_CONFIDENCE" }],
      });

      expect(result.decision).toBe("auto_pass");
    });

    it("evidence_pack when mid confidence (below high, at or above mid)", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: 0.8,
        findings: [{ severity: "S2", reasonCode: "AMBIGUOUS_FIELD" }],
        findingsSummary: "One minor ambiguity on serial number",
      });

      expect(result.decision).toBe("evidence_pack");
      expect(result.evidencePack).toBeDefined();
      expect(result.evidencePack!.jobSheetId).toBe(jobSheetId);
      expect(result.evidencePack!.confidence).toBe(0.8);
      expect(result.evidencePack!.findingsSummary).toBe(
        "One minor ambiguity on serial number"
      );
      expect(result.evidencePack!.reasons.length).toBeGreaterThan(0);
    });

    it("evidence_pack at exactly the mid threshold", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: DEFAULT_RISK_ROUTING_THRESHOLDS.midThreshold,
        findings: [],
      });

      expect(result.decision).toBe("evidence_pack");
      expect(result.evidencePack).toBeDefined();
    });

    it("human_review when confidence below mid threshold", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: 0.5,
        findings: [],
      });

      expect(result.decision).toBe("human_review");
      expect(result.evidencePack).toBeUndefined();
      expect(result.reasons.some(r => r.includes("below mid threshold"))).toBe(
        true
      );
    });

    it("forces human_review when critical finding present even at high confidence", () => {
      const critical: RiskRoutingFinding = {
        severity: "S1",
        reasonCode: "MISSING_FIELD",
        fieldName: "signature",
      };

      const result = routeByRisk({
        jobSheetId,
        confidence: 0.99,
        findings: [critical],
      });

      expect(result.decision).toBe("human_review");
      expect(result.reasons).toContain(
        "Critical finding requires human review"
      );
      expect(result.evidencePack).toBeUndefined();
    });

    it("forces human_review for S0 at high confidence", () => {
      const result = routeByRisk({
        jobSheetId,
        confidence: 0.96,
        findings: [{ severity: "S0", reasonCode: "SAFETY_VIOLATION" }],
      });

      expect(result.decision).toBe("human_review");
    });
  });
});
