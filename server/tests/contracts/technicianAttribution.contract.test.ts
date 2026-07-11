import { describe, expect, it } from "vitest";
import {
  extractTechnicianNameFromFields,
  normalizePersonName,
  resolveTechnicianIdFromName,
} from "../../services/technicianAttribution";

describe("technicianAttribution", () => {
  it("normalizes names for comparison", () => {
    expect(normalizePersonName("  Alex Rivera ")).toBe("alex rivera");
    expect(normalizePersonName("Alex-Rivera")).toBe("alex rivera");
  });

  it("extracts technicianName from string or value object", () => {
    expect(
      extractTechnicianNameFromFields({ technicianName: "Alex Rivera" })
    ).toBe("Alex Rivera");
    expect(
      extractTechnicianNameFromFields({
        technicianName: { value: "Blake Chen", confidence: 0.9 },
      })
    ).toBe("Blake Chen");
    expect(
      extractTechnicianNameFromFields({ engineer_name: "Casey Ng" })
    ).toBe("Casey Ng");
  });

  it("resolves exact name matches and prefers technician role", () => {
    const id = resolveTechnicianIdFromName("Alex Rivera", [
      { id: 1, name: "Alex Rivera", email: "a@x.com", role: "qa_lead" },
      { id: 2, name: "Alex Rivera", email: "b@x.com", role: "technician" },
    ]);
    expect(id).toBe(2);
  });

  it("returns null when ambiguous without a single technician", () => {
    expect(
      resolveTechnicianIdFromName("Alex Rivera", [
        { id: 1, name: "Alex Rivera", email: "a@x.com", role: "admin" },
        { id: 2, name: "Alex Rivera", email: "b@x.com", role: "viewer" },
      ])
    ).toBeNull();
  });

  it("returns null when no match", () => {
    expect(
      resolveTechnicianIdFromName("Unknown Tech", [
        { id: 1, name: "Alex Rivera", email: "a@x.com", role: "technician" },
      ])
    ).toBeNull();
  });
});
