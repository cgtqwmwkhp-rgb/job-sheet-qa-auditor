/**
 * DV23 completion-field extraction — golden fixtures for OCR regression prevention.
 *
 * Exercises extractFailurePathSignals / extractCompletionYesNo on text that
 * resembles real Mistral-flattened OCR (single-line) and pdftotext -layout
 * (two-column grid). Both variants represent a clean DV23 inverter inspection
 * with all checks passed.
 *
 * Expected signals: safeYes, returnNo, worksComplete, onFailurePath false,
 * failMarkCount 0.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  extractCompletionYesNo,
  extractFailurePathSignals,
} from "../../services/jobSummaryConsistency";

const FIXTURES_DIR = path.join(__dirname, "../fixtures/ocr-captures");

const layoutText = fs.readFileSync(
  path.join(FIXTURES_DIR, "dv23-completion-layout.txt"),
  "utf8"
);

const mistralFlatText = fs.readFileSync(
  path.join(FIXTURES_DIR, "dv23-completion-mistral-flat.txt"),
  "utf8"
);

/**
 * Shared assertions that must hold regardless of OCR pipeline (layout vs flat).
 */
function assertCleanCompletionSignals(
  label: string,
  text: string,
  failMarkCount = 0
) {
  describe(label, () => {
    const signals = extractFailurePathSignals(text, { failMarkCount });

    it("safeYes is true", () => {
      expect(signals.safeYes).toBe(true);
    });

    it("unsafe is false", () => {
      expect(signals.unsafe).toBe(false);
    });

    it("returnVisitNo is true", () => {
      expect(signals.returnVisitNo).toBe(true);
    });

    it("returnVisit is false", () => {
      expect(signals.returnVisit).toBe(false);
    });

    it("worksCompleteYes is true", () => {
      expect(signals.worksCompleteYes).toBe(true);
    });

    it("incomplete is false", () => {
      expect(signals.incomplete).toBe(false);
    });

    it("onFailurePath is false", () => {
      expect(signals.onFailurePath).toBe(false);
    });

    it("failMarkCount is 0", () => {
      expect(signals.failMarkCount).toBe(0);
    });

    it("vor is false", () => {
      expect(signals.vor).toBe(false);
    });

    it("repairsPath is false", () => {
      expect(signals.repairsPath).toBe(false);
    });

    it("partsStillRequired is false", () => {
      expect(signals.partsStillRequired).toBe(false);
    });
  });
}

describe("DV23 completion extraction — golden OCR fixtures", () => {
  assertCleanCompletionSignals("pdftotext -layout (two-column grid)", layoutText);
  assertCleanCompletionSignals("Mistral-flattened OCR (single line)", mistralFlatText);

  describe("extractCompletionYesNo — layout variant field-by-field", () => {
    it("Service Completed → yes", () => {
      expect(
        extractCompletionYesNo(layoutText, [/Service\s+Completed\??/i])
      ).toBe("yes");
    });

    it("Additional Tasks Complete → yes", () => {
      expect(
        extractCompletionYesNo(layoutText, [
          /Additional\s+Tasks\s+Complete\??/i,
        ])
      ).toBe("yes");
    });

    it("All Works Completed → yes", () => {
      expect(
        extractCompletionYesNo(layoutText, [/All\s+Works\s+Completed\??/i])
      ).toBe("yes");
    });

    it("Return Visit Needed → no", () => {
      expect(
        extractCompletionYesNo(layoutText, [/Return\s+Visit\s+Needed\??/i])
      ).toBe("no");
    });

    it("Asset Safe To Use → yes", () => {
      expect(
        extractCompletionYesNo(layoutText, [/Asset\s+Safe\s+To\s+Use\??/i])
      ).toBe("yes");
    });
  });

  describe("extractCompletionYesNo — Mistral-flat variant field-by-field", () => {
    it("Service Completed → yes", () => {
      expect(
        extractCompletionYesNo(mistralFlatText, [/Service\s+Completed\??/i])
      ).toBe("yes");
    });

    it("Additional Tasks Complete → yes", () => {
      expect(
        extractCompletionYesNo(mistralFlatText, [
          /Additional\s+Tasks\s+Complete\??/i,
        ])
      ).toBe("yes");
    });

    it("All Works Completed → yes", () => {
      expect(
        extractCompletionYesNo(mistralFlatText, [
          /All\s+Works\s+Completed\??/i,
        ])
      ).toBe("yes");
    });

    it("Return Visit Needed → no", () => {
      expect(
        extractCompletionYesNo(mistralFlatText, [
          /Return\s+Visit\s+Needed\??/i,
        ])
      ).toBe("no");
    });

    it("Asset Safe To Use → yes", () => {
      expect(
        extractCompletionYesNo(mistralFlatText, [
          /Asset\s+Safe\s+To\s+Use\??/i,
        ])
      ).toBe("yes");
    });
  });
});
