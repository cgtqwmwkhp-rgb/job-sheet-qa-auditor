/**
 * Template Studio sample PDF store (version-scoped).
 * Samples are stored via the shared storage adapter and keyed by versionId.
 */

import { getStorageAdapter } from "../../storage";
import { calculateHash } from "../../utils/fileValidation";

export interface StudioSampleMeta {
  versionId: number;
  fileKey: string;
  fileName: string;
  fileType: string;
  fileHash: string;
  uploadedBy: number;
  uploadedAt: string;
}

const sampleByVersion = new Map<number, StudioSampleMeta>();

export function getStudioSample(versionId: number): StudioSampleMeta | undefined {
  return sampleByVersion.get(versionId);
}

export function listStudioSamples(): StudioSampleMeta[] {
  return Array.from(sampleByVersion.values());
}

export async function attachStudioSample(input: {
  versionId: number;
  fileName: string;
  fileType: string;
  fileBase64: string;
  uploadedBy: number;
}): Promise<{ meta: StudioSampleMeta; url: string }> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length < 5) {
    throw new Error("Sample file is empty");
  }
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(input.fileType)) {
    throw new Error("Sample must be PDF, JPEG, or PNG");
  }
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("Sample exceeds 12MB limit");
  }

  const fileHash = calculateHash(buffer);
  const fileKey = `template-samples/${input.versionId}/${Date.now()}-${fileHash.slice(0, 12)}`;
  const storage = getStorageAdapter();
  const { url } = await storage.put(fileKey, buffer, input.fileType);

  const meta: StudioSampleMeta = {
    versionId: input.versionId,
    fileKey,
    fileName: input.fileName,
    fileType: input.fileType,
    fileHash,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
  sampleByVersion.set(input.versionId, meta);
  return { meta, url };
}

export async function getStudioSampleUrl(
  versionId: number
): Promise<{ url: string; meta: StudioSampleMeta } | null> {
  const meta = sampleByVersion.get(versionId);
  if (!meta) return null;
  const storage = getStorageAdapter();
  const { url } = await storage.get(meta.fileKey);
  return { url, meta };
}

/** Test helper */
export function resetStudioSampleStore(): void {
  sampleByVersion.clear();
}
