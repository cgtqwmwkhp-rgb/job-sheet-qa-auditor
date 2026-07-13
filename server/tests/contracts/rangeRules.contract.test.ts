import { describe, it, expect } from "vitest";
import {
  enrichFieldMapFromRangeRules,
  evaluateRangeRules,
  extractLabeledNumericFromText,
  formatRangeRule,
  parseNumericFieldValue,
} from "../../services/rangeRules";
import type { RuleSpec } from "../../services/templateRegistry/types";

describe("rangeRules — ROI / measurement thresholds", () => {
  const torqueBetween: RuleSpec = {
    ruleId: "R-RANGE-001",
    field: "Wheel_Nut_Torque",
    description: "Wheel nut torque must be 100–130 NM",
    severity: "major",
    type: "range",
    enabled: true,
    boundsMode: "between",
    range: { min: 100, max: 130 },
    unit: "NM",
  };

  const underRule: RuleSpec = {
    ruleId: "R-RANGE-002",
    field: "hubPlay",
    description: "Hub play must be ≤ 0.5 mm",
    severity: "critical",
    type: "range",
    enabled: true,
    boundsMode: "under",
    range: { max: 0.5 },
    unit: "mm",
  };

  it("parses numeric values with unit suffixes", () => {
    expect(parseNumericFieldValue("115 NM", "NM")).toBe(115);
    expect(parseNumericFieldValue("115nm")).toBe(115);
    expect(parseNumericFieldValue(280)).toBe(280);
  });

  it("extracts labeled values from OCR text", () => {
    const text = `Wheel Nut Torque (NM): 115\nHub Nut Torque (NM): 280`;
    expect(
      extractLabeledNumericFromText(text, "Wheel_Nut_Torque", {
        unit: "NM",
        labels: ["Wheel Nut Torque"],
      })
    ).toBe(115);
  });

  it("passes when value is within between bounds", () => {
    const findings = evaluateRangeRules([torqueBetween], {
      Wheel_Nut_Torque: "115 NM",
    });
    expect(findings).toHaveLength(0);
  });

  it("fails when value is outside between bounds", () => {
    const findings = evaluateRangeRules([torqueBetween], {
      Wheel_Nut_Torque: "80",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("S1");
    expect(findings[0].fieldName).toBe("Wheel_Nut_Torque");
    expect(findings[0].reasonCode).toBe("OUT_OF_POLICY");
  });

  it("enforces under (at or below max)", () => {
    expect(
      evaluateRangeRules([underRule], { hubPlay: "0.4 mm" })
    ).toHaveLength(0);
    expect(
      evaluateRangeRules([underRule], { hubPlay: "0.9" })
    ).toHaveLength(1);
  });

  it("skips missing or non-numeric values", () => {
    expect(evaluateRangeRules([torqueBetween], {})).toHaveLength(0);
    expect(
      evaluateRangeRules([torqueBetween], { Wheel_Nut_Torque: "N/A" })
    ).toHaveLength(0);
  });

  it("enriches field map from document text for range rules", () => {
    const text = "Wheel Nut Torque (NM): 140";
    const map = enrichFieldMapFromRangeRules(
      {},
      [torqueBetween],
      text,
      [
        {
          field: "Wheel_Nut_Torque",
          label: "Wheel Nut Torque",
          type: "number",
          required: false,
          aliases: ["Wheel Nut Torque"],
        },
      ]
    );
    expect(String(map.Wheel_Nut_Torque)).toContain("140");
    const findings = evaluateRangeRules([torqueBetween], map);
    expect(findings).toHaveLength(1);
  });

  it("formats human-readable rule text", () => {
    expect(formatRangeRule(torqueBetween)).toContain("Wheel_Nut_Torque");
    expect(formatRangeRule(torqueBetween)).toContain("NM");
  });
});
