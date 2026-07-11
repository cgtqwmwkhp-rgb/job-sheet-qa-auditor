import { describe, it, expect } from "vitest";
import {
  applyAuditPolicy,
  classifyFinding,
  computeRuleSnapshotHash,
  decideOverallResult,
  DEFAULT_AUDIT_POLICY,
  mergeAuditPolicy,
  resolveAuditFormFamily,
} from "../../services/auditPolicy";
import { computeDocumentationQualityScore } from "../../services/documentationQuality";
import type { Finding } from "../../services/analyzer";

function finding(
  partial: Partial<Finding> & Pick<Finding, "fieldName" | "severity" | "ruleId">
): Finding {
  return {
    ruleId: partial.ruleId,
    fieldName: partial.fieldName,
    severity: partial.severity,
    reasonCode: partial.reasonCode ?? "INCOMPLETE_EVIDENCE",
    rawSnippet: partial.rawSnippet ?? "",
    normalisedSnippet: partial.normalisedSnippet ?? "",
    confidence: partial.confidence ?? 90,
    pageNumber: partial.pageNumber ?? 1,
    whyItMatters: partial.whyItMatters ?? "test",
    suggestedFix: partial.suggestedFix ?? "test",
  };
}

describe("auditPolicy", () => {
  it("resolves wasted-journey and job-summary form families", () => {
    expect(resolveAuditFormFamily("wasted-journey-v1", true)).toBe(
      "wasted-journey-v1"
    );
    expect(resolveAuditFormFamily("job-summary-v1", false)).toBe(
      "job-summary-v1"
    );
    expect(resolveAuditFormFamily(null, false)).toBe("job-summary-v1");
  });

  it("classifies WJ contact Issues as major by default", () => {
    const f = finding({
      ruleId: "WJ-C020",
      fieldName: "Scheduling Team Contacted",
      severity: "S1",
    });
    expect(classifyFinding(f, "wasted-journey-v1", DEFAULT_AUDIT_POLICY)).toBe(
      "major"
    );
  });

  it("forces FAIL when any major is present regardless of current PASS", () => {
    const applied = applyAuditPolicy({
      findings: [
        finding({
          ruleId: "WJ-C020",
          fieldName: "Scheduling Team Contacted",
          severity: "S1",
        }),
        finding({
          ruleId: "WJ-C001",
          fieldName: "Wasted Journey Judgment",
          severity: "S3",
        }),
      ],
      formFamily: "wasted-journey-v1",
      policy: DEFAULT_AUDIT_POLICY,
      currentResult: "PASS",
    });
    expect(applied.hasMajorFails).toBe(true);
    expect(applied.overallResult).toBe("FAIL");
    expect(applied.findings.find(f => f.ruleId === "WJ-C020")?.failClass).toBe(
      "major"
    );
    expect(applied.findings.find(f => f.ruleId === "WJ-C020")?.severity).toBe(
      "S1"
    );
  });

  it("does not FAIL when only minors remain (demotes Gemini FAIL)", () => {
    const policy = mergeAuditPolicy({
      forms: {
        "wasted-journey-v1": {
          label: "Wasted Journey",
          rules: [
            {
              ruleId: "WJ-C020",
              label: "Scheduling Team Contacted",
              description: "test",
              failClass: "minor",
              enabled: true,
            },
          ],
        },
      },
    });

    const applied = applyAuditPolicy({
      findings: [
        finding({
          ruleId: "WJ-C020",
          fieldName: "Scheduling Team Contacted",
          severity: "S1",
        }),
      ],
      formFamily: "wasted-journey-v1",
      policy,
      currentResult: "FAIL",
    });

    expect(applied.hasMajorFails).toBe(false);
    expect(applied.minorCount).toBe(1);
    expect(applied.overallResult).toBe("REVIEW_QUEUE");
    expect(applied.findings[0]?.severity).toBe("S2");
  });

  it("disabled rule becomes informational (no hard-fail, no score hit)", () => {
    const policy = mergeAuditPolicy({
      forms: {
        "wasted-journey-v1": {
          label: "Wasted Journey",
          rules: [
            {
              ruleId: "WJ-C020",
              label: "Scheduling",
              description: "off",
              failClass: "major",
              enabled: false,
            },
          ],
        },
      },
    });
    const f = finding({
      ruleId: "WJ-C020",
      fieldName: "Scheduling Team Contacted",
      severity: "S1",
    });
    expect(classifyFinding(f, "wasted-journey-v1", policy)).toBe(
      "informational"
    );
    expect(
      decideOverallResult({
        current: "PASS",
        findings: [{ ...f, failClass: "informational" }],
      })
    ).toBe("PASS");
  });

  it("unmapped Issue defaults to minor (never silent hard-fail)", () => {
    const f = finding({
      ruleId: "LLM-XYZ",
      fieldName: "Some Random Field",
      severity: "S1",
    });
    expect(classifyFinding(f, "wasted-journey-v1", DEFAULT_AUDIT_POLICY)).toBe(
      "minor"
    );
  });

  it("doc quality uses policy weights for major/minor", () => {
    const applied = applyAuditPolicy({
      findings: [
        finding({
          ruleId: "WJ-C020",
          fieldName: "Scheduling Team Contacted",
          severity: "S1",
        }),
        finding({
          ruleId: "WJ-C030",
          fieldName: "Booking Site Contact Confirmed",
          severity: "S1",
        }),
      ],
      formFamily: "wasted-journey-v1",
      policy: DEFAULT_AUDIT_POLICY,
      currentResult: "PASS",
    });
    const quality = computeDocumentationQualityScore(applied.findings, {
      weights: DEFAULT_AUDIT_POLICY.weights,
    });
    // 2 majors × 25 = 50
    expect(quality.score).toBe(50);
  });

  it("JSR engineer comments are major by default", () => {
    const f = finding({
      ruleId: "JSR-C080",
      fieldName: "Engineer Comments (Failure Path)",
      severity: "S1",
    });
    expect(classifyFinding(f, "job-summary-v1", DEFAULT_AUDIT_POLICY)).toBe(
      "major"
    );
  });

  it("JSR Parts Still Required ↔ Return Visit is major by default", () => {
    const f = finding({
      ruleId: "JSR-C090",
      fieldName: "Parts Still Required ↔ Return Visit",
      severity: "S1",
    });
    expect(classifyFinding(f, "job-summary-v1", DEFAULT_AUDIT_POLICY)).toBe(
      "major"
    );
  });

  it("resolves unknown template slug to 'default' form family", () => {
    expect(resolveAuditFormFamily("custom-checklist-v3", false)).toBe(
      "default"
    );
    expect(resolveAuditFormFamily("hvac-inspection-v1", false)).toBe("default");
  });

  it("classifies default-family safety rules as major for unknown templates", () => {
    const vorConflict = finding({
      ruleId: "DEF-C010",
      fieldName: "VOR ↔ Safe to Use",
      severity: "S1",
    });
    expect(classifyFinding(vorConflict, "default", DEFAULT_AUDIT_POLICY)).toBe(
      "major"
    );

    const signature = finding({
      ruleId: "DEF-C040",
      fieldName: "Engineer Signature / Sign-off",
      severity: "S1",
    });
    expect(classifyFinding(signature, "default", DEFAULT_AUDIT_POLICY)).toBe(
      "major"
    );
  });

  it("classifies default-family minor rules correctly", () => {
    const dateFormat = finding({
      ruleId: "DEF-R010",
      fieldName: "Asset Number",
      severity: "S2",
    });
    expect(classifyFinding(dateFormat, "default", DEFAULT_AUDIT_POLICY)).toBe(
      "minor"
    );
  });

  it("unmapped rule in default family still falls back to minor", () => {
    const unknown = finding({
      ruleId: "LLM-NOVEL",
      fieldName: "Never Seen Before",
      severity: "S1",
    });
    expect(classifyFinding(unknown, "default", DEFAULT_AUDIT_POLICY)).toBe(
      "minor"
    );
  });

  it("applyAuditPolicy with default family triggers FAIL on major", () => {
    const applied = applyAuditPolicy({
      findings: [
        finding({
          ruleId: "DEF-C030",
          fieldName: "Return Visit Required",
          severity: "S1",
        }),
      ],
      formFamily: "default",
      policy: DEFAULT_AUDIT_POLICY,
      currentResult: "PASS",
    });
    expect(applied.hasMajorFails).toBe(true);
    expect(applied.overallResult).toBe("FAIL");
  });

  describe("policy version stamp", () => {
    it("DEFAULT_AUDIT_POLICY.version is a semver string", () => {
      expect(typeof DEFAULT_AUDIT_POLICY.version).toBe("string");
      expect(DEFAULT_AUDIT_POLICY.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("applyAuditPolicy returns policyVersion matching the input policy", () => {
      const applied = applyAuditPolicy({
        findings: [],
        formFamily: "job-summary-v1",
        policy: DEFAULT_AUDIT_POLICY,
        currentResult: "PASS",
      });
      expect(applied.policyVersion).toBe(DEFAULT_AUDIT_POLICY.version);
    });

    it("applyAuditPolicy returns a stable ruleSnapshotHash", () => {
      const a = applyAuditPolicy({
        findings: [],
        formFamily: "job-summary-v1",
        policy: DEFAULT_AUDIT_POLICY,
        currentResult: "PASS",
      });
      const b = applyAuditPolicy({
        findings: [
          finding({
            ruleId: "JSR-C080",
            fieldName: "Engineer Comments",
            severity: "S1",
          }),
        ],
        formFamily: "job-summary-v1",
        policy: DEFAULT_AUDIT_POLICY,
        currentResult: "PASS",
      });
      expect(a.ruleSnapshotHash).toBe(b.ruleSnapshotHash);
      expect(a.ruleSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("ruleSnapshotHash changes when policy rules change", () => {
      const original = computeRuleSnapshotHash(DEFAULT_AUDIT_POLICY);
      const tweaked = mergeAuditPolicy({
        version: DEFAULT_AUDIT_POLICY.version,
        forms: {
          "job-summary-v1": {
            label: "Job Summary (VOR)",
            rules: [
              {
                ruleId: "JSR-C080",
                label: "Engineer Comments (Failure Path)",
                description: "changed",
                failClass: "minor",
                enabled: false,
              },
            ],
          },
        },
      });
      const changed = computeRuleSnapshotHash(tweaked);
      expect(changed).not.toBe(original);
    });

    it("mergeAuditPolicy preserves version from stored policy", () => {
      const merged = mergeAuditPolicy({ version: "2.1.0" });
      expect(merged.version).toBe("2.1.0");
    });

    it("mergeAuditPolicy falls back to default version when stored omits it", () => {
      const merged = mergeAuditPolicy({});
      expect(merged.version).toBe(DEFAULT_AUDIT_POLICY.version);
    });
  });
});
