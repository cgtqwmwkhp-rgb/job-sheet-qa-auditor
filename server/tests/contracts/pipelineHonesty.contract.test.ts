/**
 * Pipeline honesty contract tests (R1)
 *
 * - Empty ECE must not masquerade as perfect calibration (ece !== 0).
 * - Image QA fusion flag must either run with real maps or skip with reason.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  computeEce,
} from "../../services/calibration";
import {
  buildFusionInputMapsFromStages,
  processWithIntegration,
  DEFAULT_FEATURE_FLAGS,
} from "../../services/pipelineIntegration";
import type { ImageQaResult as RoiImageQaResult } from "../../services/roiProcessor";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf-8");
}

describe("Pipeline honesty contract (R1)", () => {
  describe("ECE measurement honesty", () => {
    it("never emits ece: 0 when labelledSamples is empty", () => {
      const result = computeEce([]);
      expect(result.ece).toBeNull();
      expect(result.measurementReady).toBe(false);
      expect(result.ece).not.toBe(0);
    });

    it("documentProcessor calibration artifact uses measurementReady", () => {
      const documentProcessor = readRepoFile(
        "server/services/documentProcessor.ts"
      );
      expect(documentProcessor).toContain("measurementReady: eceResult.measurementReady");
      expect(documentProcessor).toContain("ece: eceResult.ece");
    });
  });

  describe("Image QA fusion wiring honesty", () => {
    it("documentProcessor builds fusion maps from stage outputs", () => {
      const documentProcessor = readRepoFile(
        "server/services/documentProcessor.ts"
      );
      expect(documentProcessor).toContain("buildFusionInputMapsFromStages");
      expect(documentProcessor).toContain("vlmSignatureImageQa:");
      expect(documentProcessor).toContain("fusionMaps.ocrResults");
      expect(documentProcessor).toContain("fusionMaps.imageQaResults");
      expect(documentProcessor).toContain("fusionMaps.roiBboxes");
    });

    it("buildFusionInputMapsFromStages marks incomplete maps as not ready", () => {
      const maps = buildFusionInputMapsFromStages({
        roiSpatialFields: {},
        roiConfig: null,
        selectionMarksResult: null,
        vlmSignatureImageQa: null,
      });

      expect(maps.ready).toBe(false);
      expect(maps.readyFieldIds).toEqual([]);
      expect(maps.skipReason).toMatch(
        /image_qa_fusion_flag_on_but_no_complete_field_maps/
      );
    });

    it("buildFusionInputMapsFromStages becomes ready when all three maps align", () => {
      const maps = buildFusionInputMapsFromStages({
        roiSpatialFields: {
          complianceTickboxes: {
            value: "Ok, Adv",
            confidence: 88,
            pageNumber: 1,
          },
        },
        roiConfig: {
          regions: [
            {
              name: "tickboxBlock",
              page: 1,
              bounds: { x: 0.1, y: 0.5, width: 0.3, height: 0.2 },
              fields: ["complianceTickboxes"],
            },
          ],
        },
        selectionMarksResult: {
          artifact: { rows: [], model: "test", processingTimeMs: 0 },
          hintsBlock: "",
          preExtractedFields: {
            complianceTickboxes: {
              value: "Ok, Adv",
              confidence: 88,
              pageNumber: 1,
            },
          },
        },
        vlmSignatureImageQa: null,
      });

      expect(maps.ready).toBe(true);
      expect(maps.readyFieldIds).toContain("complianceTickboxes");
      expect(maps.ocrResults.has("complianceTickboxes")).toBe(true);
      expect(maps.imageQaResults.has("complianceTickboxes")).toBe(true);
      expect(maps.roiBboxes.has("complianceTickboxes")).toBe(true);
    });

    it("includes VLM signature image QA only when a real detector ran", () => {
      const unavailableVlm: RoiImageQaResult = {
        fieldId: "signatureBlock",
        passed: true,
        checkType: "signature_present",
        confidence: 0.9,
        details: "stub",
        available: false,
        vlmUsed: false,
      };
      const mapsWithoutVlm = buildFusionInputMapsFromStages({
        roiSpatialFields: {},
        roiConfig: null,
        selectionMarksResult: null,
        vlmSignatureImageQa: unavailableVlm,
      });
      expect(mapsWithoutVlm.imageQaResults.has("signatureBlock")).toBe(false);

      const realVlm: RoiImageQaResult = {
        fieldId: "signatureBlock",
        passed: true,
        checkType: "signature_present",
        confidence: 0.91,
        details: "ink detected",
        available: true,
        vlmUsed: true,
      };
      const mapsWithVlm = buildFusionInputMapsFromStages({
        roiSpatialFields: {},
        roiConfig: {
          regions: [
            {
              name: "signatureBlock",
              page: 1,
              bounds: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 },
              fields: ["signatureBlock"],
            },
          ],
        },
        selectionMarksResult: null,
        vlmSignatureImageQa: realVlm,
      });
      expect(mapsWithVlm.imageQaResults.get("signatureBlock")).toEqual(
        expect.objectContaining({
          present: true,
          confidence: 0.91,
        })
      );
    });

    it("processWithIntegration records explicit skip when fusion flag is on without maps", async () => {
      const result = await processWithIntegration(
        {
          documentId: "doc-honesty",
          fileContent: Buffer.from("sample ocr text"),
          fileHash: "hash",
        },
        { ...DEFAULT_FEATURE_FLAGS, useImageQaFusion: true },
        "sample ocr text"
      );

      expect(result.imageQaFusionStatus?.attempted).toBe(true);
      expect(result.imageQaFusionStatus?.ran).toBe(false);
      expect(result.imageQaFusionStatus?.skipReason).toBeTruthy();
    });
  });
});
