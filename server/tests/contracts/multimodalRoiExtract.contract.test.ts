/**
 * Multimodal ROI field extract — structured JSON per crop (AI-08).
 */

import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deflateSync } from "zlib";
import {
  buildCropHash,
  buildCropReference,
  cropPageImageToRoi,
  extractMultimodalRoiFields,
  findSignatureRois,
  isMultimodalRoiExtractEnabled,
  mockCropExtract,
  normalizeBounds,
  parseCropFieldsJson,
  resolveCropForRoi,
} from "../../services/multimodalRoiExtract";
import type { RoiRegion } from "../../services/templateRegistry/types";

const jobRoi: RoiRegion = {
  name: "jobReference",
  page: 1,
  bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 },
  fields: ["jobReference"],
};

const sigRoi: RoiRegion = {
  name: "signatureBlock",
  page: 1,
  bounds: { x: 0.05, y: 0.7, width: 0.9, height: 0.25 },
  fields: ["customerSignature", "engineerSignOff"],
};

/** Solid red 4x4 RGBA PNG. */
function makeSolidPng(width: number, height: number): string {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 200;
    rgba[i * 4 + 1] = 40;
    rgba[i * 4 + 2] = 40;
    rgba[i * 4 + 3] = 255;
  }
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, y * stride + stride);
  }
  const compressed = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat([signature, ...chunks]).toString("base64");
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  let c = 0xffffffff;
  const crcInput = Buffer.concat([typeBuf, data]);
  for (let i = 0; i < crcInput.length; i++) {
    c ^= crcInput[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

describe("multimodalRoiExtract", () => {
  const envKeys = [
    "FEATURE_MULTIMODAL_ROI_EXTRACT",
    "FEATURE_GEMINI_MULTIMODAL",
    "GEMINI_API_KEY",
    "MULTIMODAL_ROI_PROVIDER",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.FEATURE_MULTIMODAL_ROI_EXTRACT = "true";
    process.env.MULTIMODAL_ROI_PROVIDER = "mock";
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("normalizes and hashes crop bounds stably", () => {
    const bbox = normalizeBounds({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(bbox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const a = buildCropHash("jobReference", 1, bbox!);
    const b = buildCropHash("jobReference", 1, bbox!);
    expect(a).toBe(b);
    expect(a).toMatch(/^crop_[0-9a-f]{16}$/);
  });

  it("finds signature ROIs by name", () => {
    expect(findSignatureRois([jobRoi, sigRoi]).map(r => r.name)).toEqual([
      "signatureBlock",
    ]);
  });

  it("pixel-crops PNG page images into ROI crops", () => {
    const pagePng = makeSolidPng(20, 20);
    const cropped = cropPageImageToRoi(
      {
        page: 1,
        data: pagePng,
        mediaType: "image/png",
      },
      {
        name: "jobReference",
        page: 1,
        bounds: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      }
    );
    expect(cropped).not.toBeNull();
    expect(cropped!.reference.pixelCropped).toBe(true);
    expect(cropped!.cropImage.mediaType).toBe("image/png");
    expect(cropped!.cropImage.data.length).toBeGreaterThan(32);
  });

  it("resolveCropForRoi prefers explicit cropImages", () => {
    const tiny =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const resolved = resolveCropForRoi(sigRoi, {
      cropImages: {
        signatureBlock: {
          data: tiny,
          mediaType: "image/png",
          encoding: "base64",
        },
      },
    });
    expect(resolved.media).toBe("crop");
    expect(resolved.cropImage?.data).toBe(tiny);
    expect(resolved.reference?.pixelCropped).toBe(true);
  });

  it("documentProcessor wires cropImages from stage 1.92 into multimodal", () => {
    const src = readFileSync(
      path.join(process.cwd(), "server/services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("cropImagesFromRoiTrace");
    expect(src).toContain("multimodalCropImages");
    expect(src).toMatch(/cropImages:\s*multimodalCropImages/);
  });

  it("parseCropFieldsJson returns structured fields per crop", () => {
    const fields = parseCropFieldsJson(
      JSON.stringify({
        fields: [
          {
            fieldId: "jobReference",
            value: "JS-99",
            confidence: 0.91,
            present: true,
            reasoning: "visible",
          },
        ],
      }),
      ["jobReference", "assetId"]
    );
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      fieldId: "jobReference",
      value: "JS-99",
      confidence: 0.91,
      present: true,
    });
    expect(fields[1].present).toBe(false);
  });

  it("extractMultimodalRoiFields returns structured JSON per crop (mock)", async () => {
    const result = await extractMultimodalRoiFields({
      roiConfig: { regions: [jobRoi, sigRoi] },
      mockExtract: (roi, fieldIds) => mockCropExtract(roi, fieldIds),
    });
    expect(result.enabled).toBe(true);
    expect(result.ran).toBe(true);
    expect(result.crops.length).toBeGreaterThanOrEqual(1);
    for (const crop of result.crops) {
      expect(crop.roiId).toBeTruthy();
      expect(crop.cropHash).toMatch(/^crop_/);
      expect(Array.isArray(crop.fields)).toBe(true);
      expect(crop.fields.length).toBeGreaterThan(0);
      for (const f of crop.fields) {
        expect(f).toHaveProperty("fieldId");
        expect(f).toHaveProperty("confidence");
        expect(f).toHaveProperty("present");
        expect(f).toHaveProperty("reasoning");
      }
    }
    expect(result.preExtractedFields.jobReference?.value).toBe("JS-MOCK-001");
  });

  it("skips when feature flag off and no mockExtract", async () => {
    process.env.FEATURE_MULTIMODAL_ROI_EXTRACT = "false";
    delete process.env.GEMINI_API_KEY;
    expect(isMultimodalRoiExtractEnabled()).toBe(false);
    const result = await extractMultimodalRoiFields({
      roiConfig: { regions: [jobRoi] },
    });
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toMatch(/off/i);
  });

  it("buildCropReference rejects empty bounds", () => {
    expect(
      buildCropReference({
        name: "x",
        page: 1,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      })
    ).toBeNull();
  });
});
