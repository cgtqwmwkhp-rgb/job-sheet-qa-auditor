import { describe, it, expect } from "vitest";
import {
  evaluateImpliesRules,
  formatImpliesRule,
} from "../../services/impliesRules";
import type { RuleSpec } from "../../services/templateRegistry/types";

describe("impliesRules — VOR-style if/then", () => {
  const vorRule: RuleSpec = {
    ruleId: "R-IMPLIES-001",
    field: "safeToUse",
    description: "VOR requires unsafe",
    severity: "critical",
    type: "implies",
    enabled: true,
    whenField: "vorStatus",
    whenValue: "Present",
    thenField: "safeToUse",
    thenValue: "No",
  };

  it("passes when then-condition holds", () => {
    const findings = evaluateImpliesRules([vorRule], {
      vorStatus: "Present",
      safeToUse: "No",
    });
    expect(findings).toHaveLength(0);
  });

  it("fails when VOR Present but safeToUse Yes", () => {
    const findings = evaluateImpliesRules([vorRule], {
      vorStatus: "Present",
      safeToUse: "Yes",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("S0");
    expect(findings[0].fieldName).toBe("safeToUse");
  });

  it("skips when when-condition is not met", () => {
    const findings = evaluateImpliesRules([vorRule], {
      vorStatus: "Absent",
      safeToUse: "Yes",
    });
    expect(findings).toHaveLength(0);
  });

  it("formats human-readable rule text", () => {
    expect(formatImpliesRule(vorRule)).toContain("vorStatus");
    expect(formatImpliesRule(vorRule)).toContain("safeToUse");
  });
});
