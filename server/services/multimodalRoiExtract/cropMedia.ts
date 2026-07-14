/**
 * ROI crop descriptors + page-image cropping for multimodal / VLM paths.
 * Fail-soft: never throws; returns null when a pixel crop cannot be made.
 */

import { createHash } from "crypto";
import { inflateSync, deflateSync } from "zlib";
import type { RoiRegion } from "../templateRegistry/types";
import type { VlmCropImage } from "../vlmAdapter";
import type {
  NormalizedRoiBounds,
  PageImageInput,
  RoiCropReference,
} from "./types";

export function normalizeBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): NormalizedRoiBounds | null {
  const x = clamp01(bounds.x);
  const y = clamp01(bounds.y);
  const width = clamp01(bounds.width);
  const height = clamp01(bounds.height);
  if (width <= 0.001 || height <= 0.001) return null;
  if (x >= 1 || y >= 1) return null;
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function buildCropHash(
  roiId: string,
  page: number,
  bbox: NormalizedRoiBounds,
  mediaHint?: string
): string {
  const payload = `${roiId}|${page}|${bbox.x.toFixed(4)},${bbox.y.toFixed(4)},${bbox.width.toFixed(4)},${bbox.height.toFixed(4)}|${mediaHint ?? ""}`;
  return `crop_${createHash("sha256").update(payload).digest("hex").slice(0, 16)}`;
}

export function buildCropReference(
  roi: RoiRegion,
  options: { pixelCropped?: boolean; mediaHint?: string } = {}
): RoiCropReference | null {
  const bbox = normalizeBounds(roi.bounds);
  if (!bbox) return null;
  return {
    roiId: roi.name,
    page: roi.page || 1,
    bbox,
    cropHash: buildCropHash(roi.name, roi.page || 1, bbox, options.mediaHint),
    extractedAt: new Date().toISOString(),
    pixelCropped: options.pixelCropped === true,
  };
}

/** Match signature-related ROI names used across templates. */
export function isSignatureRoiName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("signature") ||
    n.includes("signoff") ||
    n.includes("sign_off") ||
    n === "engineersignoff" ||
    n === "customersignature"
  );
}

export function findSignatureRois(regions: RoiRegion[]): RoiRegion[] {
  return regions.filter(r => isSignatureRoiName(r.name));
}

export function findRoiForField(
  regions: RoiRegion[],
  fieldId: string
): RoiRegion | null {
  const exact = regions.find(
    r =>
      r.name === fieldId ||
      (r.fields ?? []).some(f => f.toLowerCase() === fieldId.toLowerCase())
  );
  if (exact) return exact;
  const lower = fieldId.toLowerCase();
  return (
    regions.find(r => r.name.toLowerCase() === lower) ??
    regions.find(r => r.name.toLowerCase().includes(lower)) ??
    null
  );
}

/**
 * Crop a page PNG (8-bit RGBA/RGB, non-interlaced) to the ROI box.
 * Returns null for JPEG/WebP or unsupported PNG variants — callers fall back
 * to page/PDF + bounds hint.
 */
export function cropPageImageToRoi(
  pageImage: PageImageInput,
  roi: RoiRegion
): { cropImage: VlmCropImage; reference: RoiCropReference } | null {
  const bbox = normalizeBounds(roi.bounds);
  if (!bbox) return null;
  if (pageImage.mediaType !== "image/png") return null;

  const decoded = decodePngRgba(Buffer.from(pageImage.data, "base64"));
  if (!decoded) return null;

  const { width, height, rgba } = decoded;
  const x0 = Math.max(0, Math.floor(bbox.x * width));
  const y0 = Math.max(0, Math.floor(bbox.y * height));
  const x1 = Math.min(width, Math.ceil((bbox.x + bbox.width) * width));
  const y1 = Math.min(height, Math.ceil((bbox.y + bbox.height) * height));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);

  const out = Buffer.alloc(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const srcOff = ((y0 + row) * width + x0) * 4;
    const dstOff = row * cw * 4;
    rgba.copy(out, dstOff, srcOff, srcOff + cw * 4);
  }

  const png = encodePngRgba(cw, ch, out);
  const cropImage: VlmCropImage = {
    data: png.toString("base64"),
    mediaType: "image/png",
    encoding: "base64",
  };
  const reference = buildCropReference(roi, {
    pixelCropped: true,
    mediaHint: cropImage.data.slice(0, 32),
  });
  if (!reference) return null;
  return { cropImage, reference };
}

export function resolveCropForRoi(
  roi: RoiRegion,
  options: {
    cropImages?: Record<string, VlmCropImage>;
    pageImages?: PageImageInput[];
  }
): {
  cropImage?: VlmCropImage;
  reference: RoiCropReference | null;
  media: "crop" | "page" | "none";
} {
  const provided = options.cropImages?.[roi.name];
  if (provided?.data) {
    return {
      cropImage: provided,
      reference: buildCropReference(roi, {
        pixelCropped: true,
        mediaHint: provided.data.slice(0, 32),
      }),
      media: "crop",
    };
  }

  const page = roi.page || 1;
  const pageImage = options.pageImages?.find(p => p.page === page);
  if (pageImage) {
    const cropped = cropPageImageToRoi(pageImage, roi);
    if (cropped) {
      return {
        cropImage: cropped.cropImage,
        reference: cropped.reference,
        media: "crop",
      };
    }
    // Unsupported encode — pass full page image; VLM prompt still has ROI bounds.
    return {
      cropImage: {
        data: pageImage.data,
        mediaType: pageImage.mediaType,
        encoding: "base64",
      },
      reference: buildCropReference(roi, {
        pixelCropped: false,
        mediaHint: "page",
      }),
      media: "page",
    };
  }

  return {
    reference: buildCropReference(roi, { pixelCropped: false }),
    media: "none",
  };
}

/* —— Minimal PNG codec (8-bit RGB/RGBA, non-interlaced) —— */

function decodePngRgba(
  buf: Buffer
): { width: number; height: number; rgba: Buffer } | null {
  if (buf.length < 24) return null;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  let offset = 8;

  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) return null;
    const data = buf.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      if (data.length < 13) return null;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8) return null;
  if (colorType !== 2 && colorType !== 6) return null;

  const bpp = colorType === 6 ? 4 : 3;
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const stride = width * bpp;
  const expected = height * (1 + stride);
  if (inflated.length < expected) return null;

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (1 + stride)];
    if (filter !== 0) return null; // only none-filter for simplicity
    const row = inflated.subarray(
      y * (1 + stride) + 1,
      y * (1 + stride) + 1 + stride
    );
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = row[si];
      rgba[di + 1] = row[si + 1];
      rgba[di + 2] = row[si + 2];
      rgba[di + 3] = bpp === 4 ? row[si + 3] : 255;
    }
  }
  return { width, height, rgba };
}

function encodePngRgba(width: number, height: number, rgba: Buffer): Buffer {
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
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
