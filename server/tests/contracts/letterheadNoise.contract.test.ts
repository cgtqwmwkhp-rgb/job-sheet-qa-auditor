/**
 * Letterhead/footer chrome must never enter audit findings or coaching evidence.
 */

import { describe, expect, it } from "vitest";
import {
  isLetterheadNoise,
  scrubLetterheadConflictParts,
  scrubLetterheadFromSnippets,
  stripLetterheadNoise,
} from "../../services/letterheadNoise";
import { applyFindingHygiene } from "../../services/findingHygiene";
import { buildEnsembleReviewFindings } from "../../services/ensembleExtraction";
import { buildEvidenceDossier } from "../../services/engineerAnalytics/evidenceDossier";

describe("letterheadNoise", () => {
  it("flags PlantExpand phone, website, Email, brand", () => {
    expect(isLetterheadNoise("01268 562102")).toBe(true);
    expect(isLetterheadNoise("www.plantexpand.com")).toBe(true);
    expect(isLetterheadNoise("info@plantexpand.com")).toBe(true);
    expect(isLetterheadNoise("PlantExpand Ltd")).toBe(true);
    expect(isLetterheadNoise("Email")).toBe(true);
    expect(isLetterheadNoise("0800 123 45678")).toBe(true);
  });

  it("does not flag real job/asset/technician values", () => {
    expect(isLetterheadNoise("87")).toBe(false);
    expect(isLetterheadNoise("Richard.Newton")).toBe(false);
    expect(isLetterheadNoise("249200123")).toBe(false);
    expect(isLetterheadNoise("Trailer coupling cracked")).toBe(false);
  });

  it("strips letterhead from compound conflict snippets", () => {
    expect(
      stripLetterheadNoise("87 | 01268 562102 www.plantexpand.com Email")
    ).toBe("87");
    expect(
      scrubLetterheadConflictParts(
        "Richard.newton | 01268 562102 www.plantexpand.com Email"
      )
    ).toMatch(/Richard/i);
    expect(
      scrubLetterheadConflictParts("01268 562102 www.plantexpand.com Email")
    ).toBe("");
  });
});

describe("findingHygiene letterhead discard", () => {
  it("demotes Job Number ENSEMBLE conflict polluted by letterhead", () => {
    const cleaned = applyFindingHygiene([
      {
        ruleId: "ENSEMBLE",
        fieldName: "Job Number",
        severity: "S2",
        reasonCode: "CONFLICT",
        rawSnippet: "87 | 01268 562102 www.plantexpand.com Email",
        normalisedSnippet: "87 | 01268 562102 www.plantexpand.com Email",
        confidence: 40,
        pageNumber: 1,
        whyItMatters: "Ensemble conflict",
        suggestedFix:
          "Review conflicting values and confirm the correct field value.",
      },
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].normalisedSnippet).toBe("87");
    expect(cleaned[0].rawSnippet).not.toMatch(/plantexpand|01268|Email/i);
    expect(cleaned[0].reasonCode).toBe("LOW_CONFIDENCE");
  });

  it("scrubs letterhead from all finding snippets", () => {
    const cleaned = applyFindingHygiene([
      {
        ruleId: "COMMENT-C010",
        fieldName: "Engineer Comments",
        severity: "S1",
        reasonCode: "INCOMPLETE_EVIDENCE",
        rawSnippet: "Richard.newton 01268 562102 www.plantexpand.com Email",
        normalisedSnippet:
          "Richard.newton 01268 562102 www.plantexpand.com Email",
        confidence: 50,
        pageNumber: 1,
        whyItMatters: "Thin comment",
        suggestedFix: "Write a clinical comment",
      },
    ]);
    expect(cleaned[0].normalisedSnippet).not.toMatch(
      /plantexpand|01268|www\./i
    );
  });
});

describe("ensemble review findings letterhead discard", () => {
  it("does not emit letterhead in Job Number conflict snippet", () => {
    const findings = buildEnsembleReviewFindings(
      {
        conflictFields: ["jobNumber"],
        lowConfidenceFields: [],
        missingRequired: [],
      },
      {
        jobNumber: {
          displayName: "Job Number",
          value: "87",
          confidence: 0.5,
          evidence: "87 | 01268 562102 www.plantexpand.com Email",
          conflictValues: ["87", "01268 562102 www.plantexpand.com Email"],
        },
      },
      70
    );
    expect(findings.length).toBeGreaterThan(0);
    const joined = findings
      .map(f => `${f.normalisedSnippet} ${f.rawSnippet}`)
      .join(" ");
    expect(joined).not.toMatch(/plantexpand|01268|www\./i);
    expect(joined).toMatch(/87/);
  });
});

describe("coaching dossier letterhead discard", () => {
  it("never surfaces PlantExpand contact chrome in evidence quotes", () => {
    const dossier = buildEvidenceDossier({
      engineerName: "Richard Newton",
      period: {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-07-12T00:00:00.000Z",
      },
      documents: [
        {
          technicianId: 7,
          jobSheetId: 33,
          referenceNumber: "JOB-33",
          result: "review_queue",
          processedAt: "2026-07-11T09:00:00.000Z",
        },
      ],
      findings: [
        {
          findingId: 1,
          technicianId: 7,
          jobSheetId: 33,
          severity: "S2",
          reasonCode: "CONFLICT",
          fieldName: "Job Number",
          ruleId: "ENSEMBLE",
          resolutionStatus: "open",
          occurredAt: "2026-07-11T09:00:00.000Z",
          normalisedSnippet: "87 | 01268 562102 www.plantexpand.com Email",
          rawSnippet: "87 | 01268 562102 www.plantexpand.com Email",
          suggestedFix:
            "Review conflicting values and confirm the correct field value.",
        },
      ],
    });
    const blob = JSON.stringify(dossier);
    expect(blob).not.toMatch(/01268 562102/);
    expect(blob).not.toMatch(/www\.plantexpand\.com/i);
    expect(dossier.cites[0]?.snippet).toBe("87");
  });
});

describe("scrubLetterheadFromSnippets", () => {
  it("clears pure letterhead snippets", () => {
    const scrubbed = scrubLetterheadFromSnippets({
      rawSnippet: "www.plantexpand.com Email",
      normalisedSnippet: "01268 562102",
    });
    expect(scrubbed.rawSnippet).toBe("");
    expect(scrubbed.normalisedSnippet).toBe("");
  });
});

describe("attribution + hybrid letterhead reject", () => {
  it("rejects letterhead as technician name from fields", async () => {
    const { extractTechnicianNameFromFields } = await import(
      "../../services/technicianAttribution"
    );
    expect(
      extractTechnicianNameFromFields({
        technicianName: "01268 562102 www.plantexpand.com Email",
      })
    ).toBeNull();
    expect(
      extractTechnicianNameFromFields({
        technicianName: "Richard.Newton",
      })
    ).toBe("Richard.Newton");
  });

  it("rejects letterhead job reference in hybrid extraction", async () => {
    const { extractUniversalFields } = await import(
      "../../services/hybridAssessment"
    );
    const fields = extractUniversalFields(
      "Job Number: 01268 562102 www.plantexpand.com Email\nDate: 01/01/2026",
      ["Job Number: 01268 562102 www.plantexpand.com Email\nDate: 01/01/2026"]
    );
    expect(fields.find(f => f.field === "jobReference")).toBeUndefined();
    expect(JSON.stringify(fields)).not.toMatch(/01268|plantexpand|Email/i);
  });
});
