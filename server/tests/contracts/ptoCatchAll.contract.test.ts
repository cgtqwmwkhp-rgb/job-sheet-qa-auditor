/**
 * PX-114: PTO Catch-All Hard-Gate Contract Tests
 *
 * R015 Wave A / PR-C: Verifies the PTO compliance-checklist template
 * (compliance-checklist-pto-service-v1) never wins selection for
 * adjacent-but-distinct job families that lack PTO-distinctive tokens —
 * Vacuum Tanker and 110V electrical inspection — and that job-summary-v1
 * is preferred as the generic fallback for those families.
 *
 * Also verifies a Winch LOLER thorough-examination prefers
 * loler-examination-v1 over the standard-maintenance-v1 catch-all when
 * LOLER tokens are present.
 *
 * NON-NEGOTIABLES:
 * - Missing requiredTokensAll ("pto"+"service") already hard-disqualifies
 *   in multi-signal (PX-107); negativeTokens add defense-in-depth for
 *   vacuum/tanker/110v/acumec families that must never cross-select
 *   into the PTO template.
 * - No silent guess: LOLER family tokens must clearly outrank the
 *   ultra-permissive default catch-all template.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { selectTemplateMultiSignal } from "../../services/templateSelector/selectorService";
import {
  resetRegistry,
  resetFixtureStore,
  initializeDefaultTemplate,
  initializeJobSummaryTemplate,
  initializePtoServiceTemplate,
  initializeFormFamilySelectionCatalogs,
} from "../../services/templateRegistry";

const PTO_SLUG = "compliance-checklist-pto-service-v1";
const JOB_SUMMARY_SLUG = "job-summary-v1";
const LOLER_SLUG = "loler-examination-v1";
const STANDARD_MAINTENANCE_SLUG = "standard-maintenance-v1";

function seedFullRegistry(): void {
  resetRegistry();
  resetFixtureStore();
  initializeDefaultTemplate();
  initializeJobSummaryTemplate();
  initializePtoServiceTemplate();
  initializeFormFamilySelectionCatalogs();
}

function selectedSlugOf(
  result: ReturnType<typeof selectTemplateMultiSignal>
): string | undefined {
  return result.candidates.find(c => c.templateId === result.templateId)
    ?.templateSlug;
}

describe("PX-114: PTO catch-all hard-gate", () => {
  beforeEach(() => {
    seedFullRegistry();
  });

  describe("Vacuum Tanker never selects PTO", () => {
    const documentText = [
      "Job Summary Report",
      "PlantExpand",
      "Vacuum Tanker Service",
      "Asset No: VT-2201",
      "Make/Model: Vacuum Tanker Unit",
      "Date: 14/07/2026",
      "Job Reference: 305",
      "Technician Signature: Signed",
      "Engineer Sign Off: Complete",
      "Tanker tank integrity checked",
      "Vacuum system tested",
    ].join("\n");

    it("hard-disqualifies compliance-checklist-pto-service-v1 (score 0, LOW)", () => {
      const result = selectTemplateMultiSignal({ documentText });

      const ptoCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === PTO_SLUG
      );
      expect(ptoCandidate).toBeTruthy();
      expect(ptoCandidate!.score).toBe(0);
      expect(ptoCandidate!.confidence).toBe("LOW");
    });

    it("prefers job-summary-v1 as the generic fallback", () => {
      const result = selectTemplateMultiSignal({ documentText });

      expect(selectedSlugOf(result)).toBe(JOB_SUMMARY_SLUG);
    });
  });

  describe("110V Inspection never selects PTO", () => {
    const documentText = [
      "Job Summary Report",
      "PlantExpand",
      "110V Inspection",
      "Portable Appliance Test",
      "Asset No: GEN-110",
      "Date: 14/07/2026",
      "Job Reference: 410",
      "Technician Signature: Signed",
      "Engineer Sign Off: Complete",
      "Inspection completed successfully",
    ].join("\n");

    it("hard-disqualifies compliance-checklist-pto-service-v1 (score 0, LOW)", () => {
      const result = selectTemplateMultiSignal({ documentText });

      const ptoCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === PTO_SLUG
      );
      expect(ptoCandidate).toBeTruthy();
      expect(ptoCandidate!.score).toBe(0);
      expect(ptoCandidate!.confidence).toBe("LOW");
    });

    it("prefers job-summary-v1 as the generic fallback", () => {
      const result = selectTemplateMultiSignal({ documentText });

      expect(selectedSlugOf(result)).toBe(JOB_SUMMARY_SLUG);
    });
  });

  describe("negativeTokens defense-in-depth", () => {
    it("PTO negativeTokens include vacuum/tanker/110v beyond pump", () => {
      const result = selectTemplateMultiSignal({
        documentText:
          "PTO Service Compliance Checklist Vacuum Tanker 110V Inspection",
      });

      const ptoCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === PTO_SLUG
      );
      expect(ptoCandidate).toBeTruthy();
      // Even though "pto"+"service"+"compliance"/"checklist" are present,
      // vacuum/tanker/110v negatives must still hard-disqualify PTO.
      expect(ptoCandidate!.score).toBe(0);
      expect(ptoCandidate!.confidence).toBe("LOW");
    });
  });

  describe("Genuine PTO selects pto-service", () => {
    it("selects PTO for dotted P.T.O. Service compliance checklist", () => {
      const documentText = [
        "Job Summary Report",
        "PlantExpand",
        "P.T.O. Service",
        "Compliance Checklist",
        "OVP Winton Gardener",
        "Asset No: WX65VMH",
        "Date: 14/07/2026",
        "Job Reference: 750",
        "Technician Signature: Signed",
      ].join("\n");
      const result = selectTemplateMultiSignal({ documentText });
      expect(selectedSlugOf(result)).toBe(PTO_SLUG);
    });
  });

  describe("Winch LOLER thorough-examination prefers loler-examination-v1", () => {
    const documentText = [
      "LOLER Thorough Examination Report",
      "Winch Lifting Equipment",
      "Asset ID: WNC-01",
      "Examination Date: 14/07/2026",
      "Next Examination Due: 14/01/2027",
      "Competent Person Sign Off: Signed",
      "Safe Working Load recorded",
    ].join("\n");

    it("scores loler-examination-v1 above the standard-maintenance-v1 catch-all", () => {
      const result = selectTemplateMultiSignal({ documentText });

      const lolerCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === LOLER_SLUG
      );
      const standardCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === STANDARD_MAINTENANCE_SLUG
      );
      expect(lolerCandidate).toBeTruthy();
      expect(standardCandidate).toBeTruthy();
      expect(lolerCandidate!.score).toBeGreaterThan(standardCandidate!.score);
    });

    it("selects loler-examination-v1 as the winning template", () => {
      const result = selectTemplateMultiSignal({ documentText });

      expect(selectedSlugOf(result)).toBe(LOLER_SLUG);
      expect(result.autoProcessingAllowed).toBe(true);
    });

    it("Wave B: Winch thorough-exam without literal LOLER still selects loler-examination-v1", () => {
      const winchText = [
        "Thorough Examination Report",
        "Winch Lifting Equipment",
        "Asset ID: WNC-01",
        "Examination Date: 14/07/2026",
        "Competent Person Sign Off: Signed",
        "Safe Working Load recorded",
      ].join("\n");
      const result = selectTemplateMultiSignal({ documentText: winchText });
      expect(selectedSlugOf(result)).toBe(LOLER_SLUG);
    });

    it("R4: Winch TE buried in Job Summary chrome still selects loler over catch-all/JSR", () => {
      const winchText = [
        "Job Summary Report",
        "PlantExpand",
        "Thorough Examination - Winch",
        "Asset No: WNC-45",
        "Make/Model: Hydraulic Winch",
        "Date: 14/07/2026",
        "Job Reference: 451",
        "Technician Signature: Signed",
        "Examination completed by competent person",
        "Safe Working Load recorded",
      ].join("\n");
      const result = selectTemplateMultiSignal({ documentText: winchText });
      expect(selectedSlugOf(result)).toBe(LOLER_SLUG);
    });

    it("R4: OCR body without winch/thorough still wins via fileName + lifting tokens", () => {
      // Mirrors staging form 45: OCR emits TE/lifting language but omits
      // the filename words "Thorough Examination - Winch.pdf".
      const ocrBody = [
        "Examination of lifting equipment",
        "Asset No: WNC-45",
        "Date: 14/07/2026",
        "Competent Person: Signed",
        "Safe Working Load recorded",
        "PlantExpand Job Summary Report",
      ].join("\n");
      const selectionText = `${ocrBody}\nThorough Examination - Winch.pdf`;
      const result = selectTemplateMultiSignal({
        documentText: selectionText,
      });
      expect(selectedSlugOf(result)).toBe(LOLER_SLUG);
      const lolerCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === LOLER_SLUG
      );
      const standardCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === STANDARD_MAINTENANCE_SLUG
      );
      expect(lolerCandidate!.score).toBeGreaterThan(standardCandidate!.score);
    });
  });

  describe("Wave B: AA / Acumec defence against PTO", () => {
    it("hard-disqualifies PTO when Acumec/access platform tokens are present", () => {
      const result = selectTemplateMultiSignal({
        documentText:
          "PTO Service Compliance Checklist Acumec Access Platform MEWP",
      });
      const ptoCandidate = result.multiSignalCandidates?.find(
        c => c.templateSlug === PTO_SLUG
      );
      expect(ptoCandidate).toBeTruthy();
      expect(ptoCandidate!.score).toBe(0);
    });
  });
});
