/**
 * Contract tests for Azure DI custom neural JSR adapter + selectionMarks voter.
 * Fixture-driven — no live Azure HTTP.
 */

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  parseAzureDiCustomForm,
  customFieldsToPreExtracted,
  customChecklistFieldsToChoices,
  normalizeChecklistChoice,
  PLANTEXPAND_JSR_FIELD_MAP,
  extractCustomFieldValue,
} from "../../services/ocrAdapter/parseAzureDiCustomForm";
import {
  createAzureCustomFormAdapter,
  extractCustomJsrFormFromAnalyzeResult,
  isAzureCustomJsrEnabled,
  getAzureCustomJsrModelId,
  FEATURE_AZURE_DI_CUSTOM_JSR,
  ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID,
  PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER,
} from "../../services/ocrAdapter/azureCustomFormAdapter";
import {
  customChoicesToSelectionRows,
  voteChecklistRows,
  buildSelectionMarksArtifact,
  mapSelectionMarksToRows,
  ENGINE_VERSION,
  ENGINE_VERSION_WITH_CUSTOM_VOTER,
  type SelectionMarkRow,
} from "../../services/selectionMarks";
import { parseAzureDiResponse } from "../../services/ocrAdapter/parseAzureDiResponse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const customFixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/azure-di-custom-jsr-neural.json"),
    "utf8"
  )
);
const layoutFixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/azure-di-layout-selection-marks.json"),
    "utf8"
  )
);

describe("parseAzureDiCustomForm", () => {
  it("extracts PlantExpand JSR documents.fields + page selectionMarks", () => {
    const parsed = parseAzureDiCustomForm(customFixture);
    expect(parsed.model).toBe("plantexpand-jsr-custom-v1");
    expect(parsed.docType).toBe("plantexpand.jobSheet");
    expect(parsed.fields.length).toBeGreaterThanOrEqual(6);
    expect(parsed.selectionMarks.length).toBe(4);
    expect(parsed.pages[0].markdown).toContain("PlantExpand");
  });

  it("maps scaffold fields to GoldSpec preExtracted keys", () => {
    const parsed = parseAzureDiCustomForm(customFixture);
    const pre = customFieldsToPreExtracted(parsed.fields);
    expect(pre.jobNumber?.value).toBe("249200123");
    expect(pre.serialNumber?.value).toBe("DV23TRL");
    expect(pre.dateOfService?.value).toBe("2026-07-14");
    expect(pre.technicianName?.value).toBe("Richard.Newton");
    expect(pre.safeToUse?.value).toBe("Yes");
    expect(pre.returnVisit?.value).toBe("No");
    expect(pre.complianceTickboxes).toBeUndefined();
  });

  it("extracts checklist_* choices for the voter", () => {
    const parsed = parseAzureDiCustomForm(customFixture);
    const choices = customChecklistFieldsToChoices(parsed.fields);
    expect(choices.length).toBe(2);
    expect(choices[0].choice).toBe("Ok");
    expect(choices[0].label.toLowerCase()).toContain("chassis");
    expect(choices[1].choice).toBe("Ok");
  });

  it("normalizeChecklistChoice accepts Ok/Adv/Fail/N/A", () => {
    expect(normalizeChecklistChoice("Ok")).toBe("Ok");
    expect(normalizeChecklistChoice("Adv.")).toBe("Adv");
    expect(normalizeChecklistChoice("Fail")).toBe("Fail");
    expect(normalizeChecklistChoice("N/A")).toBe("N/A");
    expect(normalizeChecklistChoice("maybe")).toBeNull();
  });

  it("extractCustomFieldValue handles selectionMark states", () => {
    expect(
      extractCustomFieldValue({
        type: "selectionMark",
        valueSelectionMark: "selected",
      })
    ).toBe("selected");
    expect(
      extractCustomFieldValue({
        type: "selectionMark",
        content: ":unselected:",
      })
    ).toBe("unselected");
  });

  it("includes PlantExpand scaffold field map keys", () => {
    expect(PLANTEXPAND_JSR_FIELD_MAP.jobNumber).toBe("jobNumber");
    expect(PLANTEXPAND_JSR_FIELD_MAP.asset_no).toBe("serialNumber");
    expect(PLANTEXPAND_JSR_FIELD_MAP.safeToUse).toBe("safeToUse");
  });
});

describe("AzureCustomFormAdapter gating", () => {
  const prevFeature = process.env[FEATURE_AZURE_DI_CUSTOM_JSR];
  const prevModel = process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID];
  const prevEndpoint = process.env.AZURE_DI_ENDPOINT;
  const prevKey = process.env.AZURE_DI_KEY;

  afterEach(() => {
    if (prevFeature === undefined)
      delete process.env[FEATURE_AZURE_DI_CUSTOM_JSR];
    else process.env[FEATURE_AZURE_DI_CUSTOM_JSR] = prevFeature;
    if (prevModel === undefined)
      delete process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID];
    else process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID] = prevModel;
    if (prevEndpoint === undefined) delete process.env.AZURE_DI_ENDPOINT;
    else process.env.AZURE_DI_ENDPOINT = prevEndpoint;
    if (prevKey === undefined) delete process.env.AZURE_DI_KEY;
    else process.env.AZURE_DI_KEY = prevKey;
  });

  it("defaults gated off without feature flag + model id", () => {
    delete process.env[FEATURE_AZURE_DI_CUSTOM_JSR];
    delete process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID];
    expect(isAzureCustomJsrEnabled()).toBe(false);
    expect(getAzureCustomJsrModelId()).toBeUndefined();
  });

  it("requires both feature flag and model id", () => {
    process.env[FEATURE_AZURE_DI_CUSTOM_JSR] = "true";
    delete process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID];
    expect(isAzureCustomJsrEnabled()).toBe(false);

    process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID] =
      PLANTEXPAND_JSR_MODEL_ID_PLACEHOLDER;
    expect(isAzureCustomJsrEnabled()).toBe(true);
  });

  it("returns AZURE_DI_CUSTOM_GATED without live HTTP when off", async () => {
    delete process.env[FEATURE_AZURE_DI_CUSTOM_JSR];
    delete process.env[ENV_AZURE_DI_CUSTOM_JSR_MODEL_ID];
    const adapter = createAzureCustomFormAdapter();
    const result = await adapter.extractFromUrl("https://example.com/doc.pdf");
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("AZURE_DI_CUSTOM_GATED");
    expect(result.provider).toBe("azure-custom-jsr");
  });

  it("extractCustomJsrFormFromAnalyzeResult builds voter payload", () => {
    const result = extractCustomJsrFormFromAnalyzeResult(customFixture);
    expect(result.success).toBe(true);
    expect(result.preExtractedFields.jobNumber?.value).toBe("249200123");
    expect(result.checklistChoices.length).toBe(2);
    expect(result.selectionMarks.length).toBe(4);
  });
});

describe("selectionMarks custom voter", () => {
  it("customChoicesToSelectionRows maps Ok rows", () => {
    const parsed = parseAzureDiCustomForm(customFixture);
    const rows = customChoicesToSelectionRows(
      customChecklistFieldsToChoices(parsed.fields)
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].choice).toBe("Ok");
    expect(rows[0].markCount).toBe(1);
  });

  it("voteChecklistRows prefers custom when readable and confident", () => {
    const layoutRows: SelectionMarkRow[] = [
      {
        rowIndex: 0,
        pageNumber: 1,
        label: "layout row",
        choice: "UNREADABLE",
        confidence: 50,
        selectedCount: 0,
        markCount: 4,
      },
    ];
    const customRows: SelectionMarkRow[] = [
      {
        rowIndex: 0,
        pageNumber: 1,
        label: "chassis mounting",
        choice: "Ok",
        confidence: 93,
        selectedCount: 1,
        markCount: 1,
      },
    ];
    const vote = voteChecklistRows(layoutRows, customRows);
    expect(vote.preferredSource).toBe("custom");
    expect(vote.rows[0].choice).toBe("Ok");
  });

  it("voteChecklistRows keeps layout when custom empty", () => {
    const layoutParsed = parseAzureDiResponse(layoutFixture);
    const layoutRows = mapSelectionMarksToRows(layoutParsed.selectionMarks, {
      headerText: "Ok Adv Fail N/A",
      lines: layoutParsed.lines,
    });
    const vote = voteChecklistRows(layoutRows, []);
    expect(vote.preferredSource).toBe("layout");
    expect(vote.rows.length).toBeGreaterThan(0);
  });

  it("buildSelectionMarksArtifact stamps custom voter metadata", () => {
    const parsed = parseAzureDiCustomForm(customFixture);
    const customRows = customChoicesToSelectionRows(
      customChecklistFieldsToChoices(parsed.fields)
    );
    const artifact = buildSelectionMarksArtifact(parsed.selectionMarks, {
      model: parsed.model,
      processingTimeMs: 12,
      preferredRows: customRows,
      engineVersion: ENGINE_VERSION_WITH_CUSTOM_VOTER,
      customVoter: {
        enabled: true,
        model: parsed.model,
        docType: parsed.docType,
        fieldsExtracted: parsed.fields.length,
        checklistRowsFromCustom: customRows.length,
        preferredSource: "custom",
      },
    });
    expect(artifact.engineVersion).toBe(ENGINE_VERSION_WITH_CUSTOM_VOTER);
    expect(artifact.engineVersion).not.toBe(ENGINE_VERSION);
    expect(artifact.customVoter?.preferredSource).toBe("custom");
    expect(artifact.rows[0].choice).toBe("Ok");
    expect(artifact.summary.readableRows).toBe(2);
  });
});
