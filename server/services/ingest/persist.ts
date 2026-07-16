/**
 * Default persister: blob storage + optional job_sheets row.
 */

import { nanoid } from "nanoid";
import { getStorageAdapter } from "../../storage";
import * as db from "../../db";
import { sanitizeFilename } from "../../utils/fileValidation";
import type { IngestConfig } from "./config";
import type { IngestPersister } from "./types";

export function createDefaultPersister(config: IngestConfig): IngestPersister {
  return async input => {
    const sanitized = sanitizeFilename(input.fileName);
    const fileKey = `ingest/${input.deviceId}/${nanoid()}-${sanitized}`;
    const storage = getStorageAdapter();
    const { url } = await storage.put(
      fileKey,
      input.fileBuffer,
      input.fileType
    );

    let jobSheetId: number | null = null;
    if (config.systemUserId != null) {
      const created = await db.createJobSheet({
        referenceNumber: input.referenceNumber ?? input.externalJobId,
        externalJobId: input.externalJobId,
        sourceSystem: "signed_ingest",
        deviceId: input.deviceId,
        fileUrl: url,
        fileKey,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSizeBytes: input.fileBuffer.length,
        fileHash: input.contentHash,
        status: "pending",
        siteInfo:
          input.siteInfo ??
          `ingest:device=${input.deviceId};externalJobId=${input.externalJobId}`,
        uploadedBy: config.systemUserId,
      });
      jobSheetId = created.id;
    }

    return { fileKey, fileUrl: url, jobSheetId };
  };
}
