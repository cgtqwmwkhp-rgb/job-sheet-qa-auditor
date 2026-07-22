import { describe, expect, it } from "vitest";
import {
  attributionOpenIdForName,
  buildAttributionClusters,
  canonicalizePersonName,
  extractTechnicianNameFromFields,
  extractTechnicianNameFromReport,
  extractTechnicianNameFromText,
  isPhantomOnlyRoster,
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

  it("scrapes Technican OCR typo and broken signature-adjacent layout", () => {
    expect(extractTechnicianNameFromText("Technican Name: brandon.Towse")).toBe(
      "brandon.Towse"
    );
    expect(
      extractTechnicianNameFromText(
        "Technican\nName: \n brandon.Towse Signature: "
      )
    ).toBe("brandon.Towse");
    expect(
      extractTechnicianNameFromText("Technican brandon.Towse Signature: Name:")
    ).toBe("brandon.Towse");
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

  it("smart-matches QGP Last, Initial roster to PlantExpand first.last OCR", () => {
    const roster = [
      {
        id: 235,
        name: "Towse, B",
        email: "b.towse@plantexpand.roster",
        role: "technician",
        loginMethod: "seed",
      },
      {
        id: 238,
        name: "Newton, R",
        email: "r.newton@plantexpand.roster",
        role: "technician",
        loginMethod: "seed",
      },
      {
        id: 241,
        name: "Newton, A",
        email: "a.newton@plantexpand.roster",
        role: "technician",
        loginMethod: "seed",
      },
    ];
    expect(resolveTechnicianMatch("brandon.Towse", roster).technicianId).toBe(
      235
    );
    expect(resolveTechnicianMatch("Brandon Towse", roster).technicianId).toBe(
      235
    );
    expect(resolveTechnicianMatch("B. Towse", roster).technicianId).toBe(235);
    expect(resolveTechnicianMatch("Towse, B", roster).technicianId).toBe(235);
    expect(resolveTechnicianMatch("Richard.Newton", roster).technicianId).toBe(
      238
    );
    expect(resolveTechnicianMatch("richard.newton", roster).technicianId).toBe(
      238
    );
    // Ambiguous surname alone still refuses when initials differ.
    expect(resolveTechnicianMatch("Newton", roster).technicianId).toBeNull();
  });

  it("prefers real seed roster over attribution phantom on smart match", () => {
    const match = resolveTechnicianMatch("brandon.Towse", [
      {
        id: 99,
        name: "Brandon Towse",
        email: null,
        role: "technician",
        loginMethod: "attribution",
      },
      {
        id: 235,
        name: "Towse, B",
        email: "b.towse@plantexpand.roster",
        role: "technician",
        loginMethod: "seed",
      },
    ]);
    expect(match.technicianId).toBe(235);
  });

  it("keeps Last, Initial intact when scraping technician text", () => {
    expect(
      extractTechnicianNameFromText("Technician Name: Towse, B\nJob ID: 1")
    ).toBe("Towse, B");
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

  it("PX-067: isPhantomOnlyRoster is true for an empty roster", () => {
    expect(isPhantomOnlyRoster([])).toBe(true);
  });

  it("PX-067: isPhantomOnlyRoster is true when every candidate is a synthetic attribution phantom", () => {
    expect(
      isPhantomOnlyRoster([
        { id: 1, name: "OCR Ghost", email: null, loginMethod: "attribution" },
        {
          id: 2,
          name: "Another Ghost",
          email: null,
          loginMethod: "attribution",
        },
      ])
    ).toBe(true);
  });

  it("PX-067: isPhantomOnlyRoster is false when at least one real candidate exists", () => {
    expect(
      isPhantomOnlyRoster([
        { id: 1, name: "OCR Ghost", email: null, loginMethod: "attribution" },
        { id: 2, name: "Richard Newton", email: "r@x.com", loginMethod: "aad" },
      ])
    ).toBe(false);
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
