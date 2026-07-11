/**
 * Wasted Journey gold template mobilisation contract tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  resetRegistry,
  resetFixtureStore,
  validateBulkImportPack,
  importBulkPack,
  getTemplateBySlug,
  getTemplateVersion,
  runFixtureMatrix,
  activateVersion,
  generateActivationReport,
  initializeDefaultTemplate,
  initializeJobSummaryTemplate,
  initializeWastedJourneyTemplate,
  hasWastedJourneyTemplate,
  getSuggestedTemplates,
  type BulkImportPack,
} from "../../services/templateRegistry";
import { selectTemplateMultiSignal } from "../../services/templateSelector";

const packPath = join(
  __dirname,
  "../../../data/templates-mobilisation/wasted-journey-import-pack.json"
);
const pack: BulkImportPack = JSON.parse(readFileSync(packPath, "utf-8"));

const WASTED_JOURNEY_SAMPLE = `
Wasted Journey Sheet
PlantExpand
Asset Details
Asset No: YH23WKA_1C
Make/Model: Grouped Ancillaries
Customer: Openreach
Site Address / Contact: NG34 7QZ
Completion Details
Date: 10/07/2026
Repair Issue: Wasted Journey
Wasted Journey Reason: Customer / Driver No-Show
Have you successfully contacted the Scheduling Team to advise them? No
Have you successfully contacted the original Booking Site Contact to confirm? No
Technican Name: aidan.binley
Signature: Signed
`;

describe("Wasted Journey mobilisation pack", () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  it("validates pack structure", () => {
    const result = validateBulkImportPack(pack);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("contains wasted-journey-v1 with canonical critical fields", () => {
    expect(pack.templates).toHaveLength(1);
    const t = pack.templates[0]!;
    expect(t.metadata.templateId).toBe("wasted-journey-v1");
    const fields = t.specJson.fields.map(f => f.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "jobReference",
        "assetId",
        "date",
        "engineerSignOff",
        "wastedJourneyReason",
        "schedulingContacted",
        "siteContactConfirmed",
      ])
    );
    expect(t.selectionConfigJson.requiredTokensAll).toEqual([
      "wasted",
      "journey",
    ]);
    // jobReference is soft (often absent on-sheet)
    const jobRef = t.specJson.fields.find(f => f.field === "jobReference");
    expect(jobRef?.required).toBe(false);
  });

  it("imports, passes fixtures, and activates", () => {
    const imported = importBulkPack(pack, 1);
    expect(imported.success).toBe(true);
    expect(imported.successCount).toBe(1);

    const versionId = imported.results[0]!.created.versionDbId!;
    const version = getTemplateVersion(versionId)!;
    const fixtureReport = runFixtureMatrix(
      versionId,
      version.specJson,
      version.selectionConfigJson
    );
    expect(fixtureReport.overallResult).toBe("PASS");

    const report = generateActivationReport(
      versionId,
      version.specJson,
      version.selectionConfigJson,
      version.roiJson ?? undefined
    );
    expect(report.allowed).toBe(true);

    const activated = activateVersion(versionId);
    expect(activated.isActive).toBe(true);
    expect(hasWastedJourneyTemplate()).toBe(true);
    expect(getTemplateBySlug("wasted-journey-v1")).not.toBeNull();
  });

  it("boot seed activates wasted-journey-v1 alongside default and job-summary", () => {
    initializeDefaultTemplate();
    initializeJobSummaryTemplate();
    const versionId = initializeWastedJourneyTemplate();
    expect(versionId).not.toBeNull();
    expect(hasWastedJourneyTemplate()).toBe(true);

    // Idempotent when pack version already active (1.3.0)
    expect(initializeWastedJourneyTemplate()).toBeNull();
    expect(hasWastedJourneyTemplate()).toBe(true);
  });

  it("selects wasted-journey-v1 over job-summary for Wasted Journey OCR text", () => {
    initializeDefaultTemplate();
    initializeJobSummaryTemplate();
    initializeWastedJourneyTemplate();

    const result = selectTemplateMultiSignal({
      documentText: WASTED_JOURNEY_SAMPLE,
      pageCount: 1,
    });

    expect(result.candidates[0]?.templateSlug).toBe("wasted-journey-v1");
    expect(result.confidenceBand === "HIGH" || result.scoreGap >= 10).toBe(
      true
    );
    expect(result.autoProcessingAllowed).toBe(true);
  });

  it("suggests Wasted Journey Sheet and not VOR/Repair for wasted journey text", () => {
    const hints = getSuggestedTemplates(WASTED_JOURNEY_SAMPLE);
    expect(hints.some(h => h.hint === "Wasted Journey Sheet")).toBe(true);
    expect(hints.some(h => h.hint === "VOR/Repair Report")).toBe(false);
  });
});
