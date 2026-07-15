/**
 * FAULT-C010 — placeholder Fault Reason must Issues (S2), never AUTO_PASS theater.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  evaluateFaultReasonPlaceholder,
  isPlaceholderFaultReason,
  extractFaultReasonFromText,
  FEATURE_FAULT_REASON_PLACEHOLDER,
} from "../../services/commentQuality/faultReason";
import { GOLD_STANDARD_SPEC_V1 } from "../../services/goldStandardSpec";

describe("isPlaceholderFaultReason", () => {
  it("flags Reason / Please select / N/A", () => {
    expect(isPlaceholderFaultReason("Reason")).toBe(true);
    expect(isPlaceholderFaultReason("please select")).toBe(true);
    expect(isPlaceholderFaultReason("N/A")).toBe(true);
    expect(isPlaceholderFaultReason("Fault Reason")).toBe(true);
  });

  it("allows real categories", () => {
    expect(isPlaceholderFaultReason("Wear & Tear")).toBe(false);
    expect(isPlaceholderFaultReason("Damage")).toBe(false);
    expect(isPlaceholderFaultReason("Unknown")).toBe(false);
    expect(isPlaceholderFaultReason("Electrical")).toBe(false);
  });
});

describe("evaluateFaultReasonPlaceholder", () => {
  afterEach(() => {
    delete process.env[FEATURE_FAULT_REASON_PLACEHOLDER];
  });

  it("emits FAULT-C010 S2 for Reason", () => {
    const findings = evaluateFaultReasonPlaceholder("Reason");
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("FAULT-C010");
    expect(findings[0].severity).toBe("S2");
    expect(findings[0].reasonCode).not.toBe("LOW_CONFIDENCE");
  });

  it("emits nothing for Wear & Tear", () => {
    expect(evaluateFaultReasonPlaceholder("Wear & Tear")).toHaveLength(0);
  });

  it("respects flag off", () => {
    process.env[FEATURE_FAULT_REASON_PLACEHOLDER] = "false";
    expect(evaluateFaultReasonPlaceholder("Reason")).toHaveLength(0);
  });

  it("extracts Fault Reason from OCR text", () => {
    expect(
      extractFaultReasonFromText("Fault Reason: Reason\nEngineer Comments: x")
    ).toBe("Reason");
  });
});

describe("goldStandardSpec fault_reason", () => {
  it("does not allow Reason as a valid enum value", () => {
    const field = GOLD_STANDARD_SPEC_V1.fields.find(
      f => f.id === "fault_reason"
    );
    expect(field).toBeDefined();
    const enumRule = field!.validationRules.find(r => r.type === "enum");
    expect(enumRule).toBeDefined();
    expect(enumRule!.validator("Reason")).toBe(false);
    expect(enumRule!.validator("Wear & Tear")).toBe(true);
  });
});
