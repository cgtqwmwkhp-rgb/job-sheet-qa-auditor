/**
 * Signed machine ingest types (PR-IO-INGEST).
 *
 * Machine clients authenticate with API key + HMAC — no Entra browser session.
 */

export type IngestDedupeReason =
  | "external_job_id"
  | "content_hash"
  | "external_job_id_and_hash";

export interface IngestReceipt {
  ingestId: string;
  externalJobId: string;
  deviceId: string;
  contentHash: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  fileKey: string;
  fileUrl: string;
  jobSheetId: number | null;
  createdAt: string;
}

export interface IngestUploadRequest {
  externalJobId: string;
  deviceId: string;
  fileName: string;
  fileType: string;
  /** Raw file bytes (already decoded from base64 by the router). */
  fileBuffer: Buffer;
  /** Optional client-supplied SHA-256 hex; must match server hash when present. */
  contentHash?: string;
  referenceNumber?: string;
  siteInfo?: string;
}

export interface IngestAcceptedResult {
  status: "accepted";
  idempotent: false;
  receipt: IngestReceipt;
}

export interface IngestDuplicateResult {
  status: "duplicate";
  idempotent: true;
  dedupeReason: IngestDedupeReason;
  receipt: IngestReceipt;
}

export type IngestResult = IngestAcceptedResult | IngestDuplicateResult;

export class IngestError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "BAD_REQUEST"
      | "CONFLICT"
      | "NOT_CONFIGURED"
      | "INTERNAL",
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export interface IngestAuthHeaders {
  apiKey: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
}

export interface IngestPersistInput {
  externalJobId: string;
  deviceId: string;
  fileName: string;
  fileType: string;
  fileBuffer: Buffer;
  contentHash: string;
  referenceNumber?: string;
  siteInfo?: string;
}

export interface IngestPersistResult {
  fileKey: string;
  fileUrl: string;
  jobSheetId: number | null;
}

export type IngestPersister = (
  input: IngestPersistInput
) => Promise<IngestPersistResult>;
