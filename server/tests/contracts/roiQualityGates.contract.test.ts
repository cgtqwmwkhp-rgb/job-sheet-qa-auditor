import { describe, it, expect } from "vitest";
import {
  checkActivationPreconditions,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
} from "../../services/templateRegistry";
import { assessRoiConfigQuality } from "../../services/templateStudio/roiQualityGates";

const baseSpec: SpecJson = {
  name: "Gate Spec",
  version: "1.0.0",
  fields: [
    { field: "jobReference", label: "Job", type: "string", required: true },
    { field: "assetId", label: "Asset", type: "string", required: true },
    { field: "date", label: "Date", type: "date", required: true },
    {
      field: "engineerSignOff",
      label: "Sign",
      type: "boolean",
      required: true,
    },
  ],
  rules: [
    {
      ruleId: "R1",
      field: "jobReference",
      description: "req",
      severity: "critical",
      type: "required",
      enabled: true,
    },
  ],
};

const selection: SelectionConfig = {
  requiredTokensAll: ["job"],
  requiredTokensAny: ["sheet"],
};

describe("ROI quality gates (PX-105 Promote-to-live)", () => {
  it("blocks activate/promote on a single oversized blob", () => {
    const roi: RoiConfig = {
      regions: [
        {
          name: "jobReference",
          page: 1,
          bounds: { x: 0.05, y: 0.05, width: 0.9, height: 0.55 },
        },
      ],
    };
    const quality = assessRoiConfigQuality(roi);
    expect(quality.some(q => q.code === "OVERSIZED_FIELD_ROI")).toBe(true);

    const gates = checkActivationPreconditions(baseSpec, selection, roi);
    expect(gates.allowed).toBe(false);
    expect(
      gates.blockingIssues.some(
        i => i.code === "OVERSIZED_FIELD_ROI" || i.code === "SINGLE_PAGE_BLOB"
      )
    ).toBe(true);
  });

  it("allows tight field + structural ROI packs", () => {
    const roi: RoiConfig = {
      regions: [
        {
          name: "jobReference",
          page: 1,
          bounds: { x: 0.05, y: 0.08, width: 0.35, height: 0.04 },
        },
        {
          name: "assetId",
          page: 1,
          bounds: { x: 0.05, y: 0.14, width: 0.35, height: 0.04 },
        },
        {
          name: "date",
          page: 1,
          bounds: { x: 0.65, y: 0.04, width: 0.28, height: 0.04 },
        },
        {
          name: "tickboxBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.28 },
        },
        {
          name: "signatureBlock",
          page: 1,
          bounds: { x: 0, y: 0.85, width: 1, height: 0.14 },
        },
      ],
    };
    const gates = checkActivationPreconditions(baseSpec, selection, roi);
    expect(gates.allowed).toBe(true);
    expect(gates.blockingIssues.some(i => i.code.includes("OVERSIZED"))).toBe(
      false
    );
  });
});
