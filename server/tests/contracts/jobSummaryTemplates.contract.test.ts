/**
 * Job Summary gold template mobilisation contract tests.
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
  hasJobSummaryTemplate,
  type BulkImportPack,
} from "../../services/templateRegistry";
import { selectTemplateMultiSignal } from "../../services/templateSelector";

const packPath = join(
  __dirname,
  "../../../data/templates-mobilisation/job-summary-import-pack.json"
);
const pack: BulkImportPack = JSON.parse(readFileSync(packPath, "utf-8"));

const JOB_SUMMARY_SAMPLE = `
Job Summary Report
PlantExpand
This Vehicle is marked as VOR
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Asset Mileage/Hours: 74685
Technician Signature
Job Reference: 793
Date: 02/09/2024
`;

describe("Job Summary mobilisation pack", () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  it("validates pack structure", () => {
    const result = validateBulkImportPack(pack);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("contains job-summary-v1 with canonical critical fields", () => {
    expect(pack.templates).toHaveLength(1);
    const t = pack.templates[0];
    expect(t.metadata.templateId).toBe("job-summary-v1");
    const fields = t.specJson.fields.map(f => f.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "jobReference",
        "assetId",
        "date",
        "engineerSignOff",
      ])
    );
    expect(t.selectionConfigJson.requiredTokensAll).toEqual(["job", "summary"]);
  });

  it("imports, passes fixtures, and activates", () => {
    const imported = importBulkPack(pack, 1);
    expect(imported.success).toBe(true);
    expect(imported.successCount).toBe(1);

    const versionId = imported.results[0].created.versionDbId!;
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
    expect(hasJobSummaryTemplate()).toBe(true);
    expect(getTemplateBySlug("job-summary-v1")).not.toBeNull();
  });

  it("boot seed activates job-summary-v1 alongside default catch-all", () => {
    initializeDefaultTemplate();
    const versionId = initializeJobSummaryTemplate();
    expect(versionId).not.toBeNull();
    expect(hasJobSummaryTemplate()).toBe(true);

    // Idempotent
    expect(initializeJobSummaryTemplate()).toBeNull();
    expect(hasJobSummaryTemplate()).toBe(true);
  });

  it("selects job-summary-v1 over standard-maintenance for Job Summary OCR text", () => {
    initializeDefaultTemplate();
    initializeJobSummaryTemplate();

    const result = selectTemplateMultiSignal({
      documentText: JOB_SUMMARY_SAMPLE,
      pageCount: 1,
    });

    expect(result.candidates[0]?.templateSlug).toBe("job-summary-v1");
    expect(result.confidenceBand === "HIGH" || result.scoreGap >= 10).toBe(
      true
    );
    expect(result.autoProcessingAllowed).toBe(true);
  });
});
