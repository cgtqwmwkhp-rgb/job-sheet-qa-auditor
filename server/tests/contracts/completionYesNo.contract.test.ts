/**
 * Shared completionYesNo extraction contracts.
 *
 * Verifies that the promoted module works identically to its former home
 * inside jobSummaryConsistency, and that advancedExtraction picks it up.
 */

import { describe, it, expect } from "vitest";
import {
  extractCompletionYesNo,
  COMPLETION_FIELD_BOUNDARIES,
} from "../../services/extraction/completionYesNo";
import { extractCompletionYesNo as reExported } from "../../services/jobSummaryConsistency";

const DV23_COMPLETION_GRID = `
                                                              Completion Details
             Date:                    02/07/2026               Compliance Type:                               Service - SB

     Next Service Date:               02/07/2027               Compliance Title:                           Inverter Inspection

    Service Completed?                                      Additional Tasks Complete?
                                           Yes                                                                    Yes

    All Works Completed?                   Yes                Return Visit Needed?                                 No

    Consumables Used?                       No                 Asset Safe To Use?                                 Yes


   Job Duration:             0.8        Overtime:            No            Travel :           1.0      Job ID :           485
`;

const INLINE_LAYOUT = `
Is the asset safe to use?: No
Is a return visit required?: Yes
Were all works fully completed?: No
`;

const FLAT_OCR = `Is the asset safe to use? Yes Return Visit Needed? No All Works Completed? Yes`;

describe("completionYesNo (shared module)", () => {
  describe("extractCompletionYesNo", () => {
    it("reads safe_to_use from a two-column completion grid", () => {
      expect(
        extractCompletionYesNo(DV23_COMPLETION_GRID, [
          /Asset\s+Safe\s+To\s+Use\??/i,
        ])
      ).toBe("yes");
    });

    it("reads return_visit from a two-column grid", () => {
      expect(
        extractCompletionYesNo(DV23_COMPLETION_GRID, [
          /Return\s+Visit\s+Needed\??/i,
        ])
      ).toBe("no");
    });

    it("reads all_works from a two-column grid", () => {
      expect(
        extractCompletionYesNo(DV23_COMPLETION_GRID, [
          /All\s+Works\s+Completed\??/i,
        ])
      ).toBe("yes");
    });

    it("reads service_completed from a two-column grid", () => {
      expect(
        extractCompletionYesNo(DV23_COMPLETION_GRID, [
          /Service\s+Completed\??/i,
        ])
      ).toBe("yes");
    });

    it("reads additional_tasks from a two-column grid", () => {
      expect(
        extractCompletionYesNo(DV23_COMPLETION_GRID, [
          /Additional\s+Tasks\s+Complete\??/i,
        ])
      ).toBe("yes");
    });

    it("reads inline colon-separated layout", () => {
      expect(
        extractCompletionYesNo(INLINE_LAYOUT, [
          /Is\s+the\s+asset\s+safe\s+to\s+use\??/i,
        ])
      ).toBe("no");
      expect(
        extractCompletionYesNo(INLINE_LAYOUT, [
          /Is\s+a\s+return\s+visit\s+required\??/i,
        ])
      ).toBe("yes");
      expect(
        extractCompletionYesNo(INLINE_LAYOUT, [
          /Were\s+all\s+works\s+fully\s+completed\??/i,
        ])
      ).toBe("no");
    });

    it("handles OCR-flattened single-line text", () => {
      expect(
        extractCompletionYesNo(FLAT_OCR, [
          /Is\s+the\s+asset\s+safe\s+to\s+use\??/i,
        ])
      ).toBe("yes");
      expect(
        extractCompletionYesNo(FLAT_OCR, [/Return\s+Visit\s+Needed\??/i])
      ).toBe("no");
      expect(
        extractCompletionYesNo(FLAT_OCR, [/All\s+Works\s+Completed\??/i])
      ).toBe("yes");
    });

    it("returns unknown when label is absent", () => {
      expect(
        extractCompletionYesNo("Some unrelated text here.", [
          /Asset\s+Safe\s+To\s+Use\??/i,
        ])
      ).toBe("unknown");
    });

    it("supports multiple label patterns (first match wins)", () => {
      expect(
        extractCompletionYesNo(INLINE_LAYOUT, [
          /Asset\s+Safe\s+To\s+Use\??/i,
          /Is\s+the\s+asset\s+safe\s+to\s+use\??/i,
        ])
      ).toBe("no");
    });
  });

  describe("re-export from jobSummaryConsistency", () => {
    it("is the same function reference", () => {
      expect(reExported).toBe(extractCompletionYesNo);
    });
  });

  describe("COMPLETION_FIELD_BOUNDARIES", () => {
    it("contains known boundary labels", () => {
      expect(COMPLETION_FIELD_BOUNDARIES).toContain("Asset Safe To Use");
      expect(COMPLETION_FIELD_BOUNDARIES).toContain("Return Visit Needed");
      expect(COMPLETION_FIELD_BOUNDARIES).toContain("All Works Completed");
      expect(COMPLETION_FIELD_BOUNDARIES).toContain("Job Duration");
    });
  });
});

describe("advancedExtraction grid hint", () => {
  it("processDocument source imports extractCompletionYesNo", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../../services/advancedExtraction.ts"),
      "utf8"
    );
    expect(src).toContain("extractCompletionYesNo");
    expect(src).toContain("completionGrid");
  });
});
