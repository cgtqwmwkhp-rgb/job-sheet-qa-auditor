import { describe, expect, it } from "vitest";
import { mapSelectionTraceFromReport } from "../review/mapSelectionTrace";

describe("mapSelectionTraceFromReport", () => {
  it("returns null when report has no selection data", () => {
    expect(mapSelectionTraceFromReport(null)).toBeNull();
    expect(mapSelectionTraceFromReport({})).toBeNull();
  });

  it("maps selectionResult + selectionCohort into panel shape", () => {
    const trace = mapSelectionTraceFromReport({
      selectionResult: {
        selected: true,
        templateId: 7,
        versionId: 3,
        confidenceBand: "HIGH",
        scoreGap: 12.5,
        matchedTokens: ["service", "date"],
        candidates: [
          {
            templateId: 7,
            templateSlug: "maint-v1",
            versionId: 3,
            score: 88,
            matchedTokens: ["service", "date"],
            missingRequired: [],
          },
          {
            templateId: 9,
            templateSlug: "install-v1",
            versionId: 1,
            score: 75.5,
            matchedTokens: ["service"],
            missingRequired: ["date"],
          },
        ],
      },
      selectionCohort: {
        templateSlug: "maint-v1",
        workType: "maintenance",
        client: "acme",
      },
    });

    expect(trace).not.toBeNull();
    expect(trace!.confidenceBand).toBe("HIGH");
    expect(trace!.runnerUpDelta).toBe(12.5);
    expect(trace!.selected?.templateId).toBe("maint-v1");
    expect(trace!.candidates).toHaveLength(2);
    expect(trace!.inputSignals.tokens).toEqual(["service", "date"]);
    expect(trace!.inputSignals.documentType).toBe("maintenance");
  });
});
