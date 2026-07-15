import { describe, expect, it } from "vitest";
import {
  attributionOpenIdForName,
  buildAttributionClusters,
  canonicalizePersonName,
  extractTechnicianNameFromFields,
  extractTechnicianNameFromReport,
  extractTechnicianNameFromText,
  normalizePersonName,
  prettifyExtractedName,
  resolveTechnicianIdFromName,
  resolveTechnicianMatch,
} from "../../services/technicianAttribution";

describe("technicianAttribution", () => {
  it("normalizes and canonicalizes username-shaped OCR names", () => {
    expect(normalizePersonName("  Alex Rivera ")).toBe("alex rivera");
    expect(canonicalizePersonName("Richard.Newton")).toBe("richard newton");
    expect(canonicalizePersonName("richard_newton")).toBe("richard newton");
    expect(prettifyExtractedName("Richard.Newton")).toBe("Richard Newton");
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
    expect(extractTechnicianNameFromFields({ engineer_name: "Casey Ng" })).toBe(
      "Casey Ng"
    );
  });

  it("scrapes Technician Name from OCR text when fields are empty", () => {
    expect(
      extractTechnicianNameFromText(
        "Site: Depot\nTechnician Name: Richard.Newton\nJob ID: 87"
      )
    ).toBe("Richard.Newton");
    expect(
      extractTechnicianNameFromReport({
        extractedFields: {},
        extractedText: "Engineer: Richard.Newton\nComments: n/a",
      })
    ).toBe("Richard.Newton");
  });

  it("matches Richard.Newton to Richard Newton user", () => {
    const match = resolveTechnicianMatch("Richard.Newton", [
      {
        id: 9,
        name: "Richard Newton",
        email: "richard.newton@example.com",
        role: "technician",
      },
    ]);
    expect(match.technicianId).toBe(9);
    expect(match.confidence).toBe("exact");
  });

  it("matches via email local-part", () => {
    expect(
      resolveTechnicianIdFromName("Richard.Newton", [
        {
          id: 3,
          name: null,
          email: "richard.newton@plantexpand.com",
          role: "technician",
        },
      ])
    ).toBe(3);
  });

  it("matches unique surname when full name is present", () => {
    const match = resolveTechnicianMatch("Richard Newton", [
      { id: 1, name: "Sam Newton", email: null, role: "technician" },
    ]);
    expect(match.technicianId).toBe(1);
    expect(match.confidence).toBe("probable");
  });

  it("does not guess when surname is ambiguous", () => {
    expect(
      resolveTechnicianIdFromName("Richard Newton", [
        { id: 1, name: "Sam Newton", email: null, role: "technician" },
        { id: 2, name: "Pat Newton", email: null, role: "technician" },
      ])
    ).toBeNull();
  });

  it("prefers technician role on exact duplicate names", () => {
    const id = resolveTechnicianIdFromName("Alex Rivera", [
      { id: 1, name: "Alex Rivera", email: "a@x.com", role: "qa_lead" },
      { id: 2, name: "Alex Rivera", email: "b@x.com", role: "technician" },
    ]);
    expect(id).toBe(2);
  });

  it("builds clusters for attribution preview", () => {
    const clusters = buildAttributionClusters({
      sheets: [
        { id: 1, extractedName: "Richard.Newton" },
        { id: 2, extractedName: "Richard.Newton" },
        { id: 3, extractedName: "Unknown Tech" },
        { id: 4, extractedName: null },
      ],
      candidates: [
        {
          id: 9,
          name: "Richard Newton",
          email: "r.newton@x.com",
          role: "technician",
        },
      ],
    });
    expect(clusters[0]?.displayName).toMatch(/Richard/i);
    expect(clusters[0]?.sheetCount).toBe(2);
    expect(clusters[0]?.match.technicianId).toBe(9);
    expect(clusters.some(c => c.match.technicianId == null)).toBe(true);
  });

  it("builds stable attribution openIds", () => {
    expect(attributionOpenIdForName("Richard.Newton")).toBe(
      "attribution:richard-newton"
    );
  });

  it("rejects Present signature values as technician names", () => {
    expect(
      extractTechnicianNameFromFields({
        engineerSignOff: { value: "Present", confidence: 90 },
        customerSignature: { value: "Present", confidence: 90 },
      })
    ).toBeNull();
    expect(
      extractTechnicianNameFromFields({
        technicianName: { value: "harry.barrett", confidence: 90 },
        engineerSignOff: { value: "Present", confidence: 90 },
      })
    ).toBe("harry.barrett");
  });
});
