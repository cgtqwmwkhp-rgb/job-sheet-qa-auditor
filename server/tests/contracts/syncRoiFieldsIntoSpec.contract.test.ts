import { describe, it, expect } from "vitest";
import { syncRoiFieldsIntoSpec } from "../../services/templateRegistry/syncRoiFieldsIntoSpec";
import { checkActivationPreconditions } from "../../services/templateRegistry/activationGates";
import type { SpecJson, SelectionConfig, RoiConfig } from "../../services/templateRegistry/types";

describe("syncRoiFieldsIntoSpec", () => {
  const baseSpec: SpecJson = {
    name: "Test",
    version: "0.1.0",
    fields: [
      { field: "jobReference", label: "Job Reference", type: "string", required: true },
      { field: "assetId", label: "Asset ID", type: "string", required: true },
      { field: "date", label: "Date", type: "date", required: true },
      { field: "engineerSignOff", label: "Engineer Sign-Off", type: "string", required: true },
    ],
    rules: [
      {
        ruleId: "R1",
        field: "jobReference",
        description: "required",
        severity: "critical",
        type: "required",
        enabled: true,
      },
    ],
  };

  const selection: SelectionConfig = {
    requiredTokensAll: [],
    requiredTokensAny: ["job"],
    optionalTokens: [],
    tokenWeights: {},
  };

  it("adds missing Fields entries for correctly named standard ROIs", () => {
    const roi: RoiConfig = {
      regions: [
        {
          name: "customerName",
          page: 1,
          bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 },
        },
        {
          name: "siteAddress",
          page: 1,
          bounds: { x: 0.1, y: 0.15, width: 0.3, height: 0.04 },
        },
        {
          name: "assetSafeToUse",
          page: 1,
          bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.03 },
          fields: ["assetSafeToUse"],
        },
        {
          name: "tickboxBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.3 },
        },
      ],
    };

    const synced = syncRoiFieldsIntoSpec(baseSpec, roi);
    const ids = synced.fields.map(f => f.field);
    expect(ids).toContain("customerName");
    expect(ids).toContain("siteAddress");
    expect(ids).toContain("assetSafeToUse");
    expect(ids).toContain("complianceTickboxes");
    expect(ids).not.toContain("tickboxBlock");
    expect(ids).not.toContain("header");
  });

  it("clears ORPHAN_ROI warnings after sync for standard-named boxes", () => {
    const roi: RoiConfig = {
      regions: [
        {
          name: "jobReference",
          page: 1,
          bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 },
        },
        {
          name: "assetId",
          page: 1,
          bounds: { x: 0.1, y: 0.15, width: 0.2, height: 0.03 },
        },
        {
          name: "date",
          page: 1,
          bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
        },
        {
          name: "tickboxBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.3 },
        },
        {
          name: "signatureBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.85, width: 0.9, height: 0.1 },
        },
        {
          name: "customerName",
          page: 1,
          bounds: { x: 0.4, y: 0.1, width: 0.3, height: 0.03 },
        },
        {
          name: "makeModel",
          page: 1,
          bounds: { x: 0.4, y: 0.15, width: 0.3, height: 0.03 },
        },
      ],
    };

    const synced = syncRoiFieldsIntoSpec(baseSpec, roi);
    const result = checkActivationPreconditions(synced, selection, roi);
    const orphans = result.warnings.filter(w => w.code === "ORPHAN_ROI");
    expect(orphans).toEqual([]);
  });

  it("treats nextServiceDate ROI as covering recommended expiryDate", () => {
    const withExpiry: SpecJson = {
      ...baseSpec,
      fields: [
        ...baseSpec.fields,
        { field: "expiryDate", label: "Expiry Date", type: "date", required: false },
      ],
    };
    const roi: RoiConfig = {
      regions: [
        {
          name: "jobReference",
          page: 1,
          bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 },
        },
        {
          name: "assetId",
          page: 1,
          bounds: { x: 0.1, y: 0.15, width: 0.2, height: 0.03 },
        },
        {
          name: "date",
          page: 1,
          bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
        },
        {
          name: "nextServiceDate",
          page: 1,
          bounds: { x: 0.1, y: 0.25, width: 0.2, height: 0.03 },
        },
        {
          name: "tickboxBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.3 },
        },
        {
          name: "signatureBlock",
          page: 1,
          bounds: { x: 0.05, y: 0.85, width: 0.9, height: 0.1 },
        },
      ],
    };
    const synced = syncRoiFieldsIntoSpec(withExpiry, roi);
    const result = checkActivationPreconditions(synced, selection, roi);
    expect(
      result.warnings.some(
        w => w.code === "RECOMMENDED_FIELD_NO_ROI" && w.field === "expiryDate"
      )
    ).toBe(false);
  });
});
