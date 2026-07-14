/**
 * HTTP client for the signed machine ingest contract (PR-IO-INGEST).
 *
 * This lane owns the poller only — HMAC router / IngestGateway stay in PR-IO-INGEST.
 * Client signing mirrors the published canonical string so Library drop → ingest works
 * without a browser /upload session.
 *
 * Canonical: `${timestamp}.POST./api/ingest/v1/job-sheets.${sha256Hex(rawBody)}`
 */

import { createHash, createHmac } from "crypto";

export const INGEST_JOB_SHEETS_PATH = "/api/ingest/v1/job-sheets";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function buildCanonicalString(params: {
  timestamp: string;
  method: string;
  path: string;
  bodySha256: string;
}): string {
  return `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${params.bodySha256}`;
}

export function createIngestAuthHeaders(params: {
  apiKey: string;
  hmacSecret: string;
  method: string;
  path: string;
  rawBody: string | Buffer;
  timestampSec?: number;
}): {
  "X-Api-Key": string;
  "X-Ingest-Timestamp": string;
  "X-Ingest-Signature": string;
} {
  const timestamp = String(
    params.timestampSec ?? Math.floor(Date.now() / 1000)
  );
  const bodySha256 = sha256Hex(params.rawBody);
  const canonical = buildCanonicalString({
    timestamp,
    method: params.method,
    path: params.path,
    bodySha256,
  });
  const sig = createHmac("sha256", params.hmacSecret)
    .update(canonical)
    .digest("hex");
  return {
    "X-Api-Key": params.apiKey,
    "X-Ingest-Timestamp": timestamp,
    "X-Ingest-Signature": `sha256=${sig}`,
  };
}

export interface DropIngestUploadInput {
  externalJobId: string;
  deviceId: string;
  fileName: string;
  fileType: string;
  fileBuffer: Buffer;
  contentHash?: string;
  referenceNumber?: string;
  siteInfo?: string;
}

export interface DropIngestUploadResponse {
  httpStatus: number;
  status: "accepted" | "duplicate" | "error";
  body: unknown;
  idempotent?: boolean;
}

export interface SignedIngestHttpClientOptions {
  baseUrl: string;
  apiKey: string;
  hmacSecret: string;
  ingestPath?: string;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * POST a job sheet into /api/ingest/v1/job-sheets with API key + HMAC.
 */
export async function postSignedIngestUpload(
  options: SignedIngestHttpClientOptions,
  input: DropIngestUploadInput
): Promise<DropIngestUploadResponse> {
  const path = options.ingestPath ?? INGEST_JOB_SHEETS_PATH;
  const contentHash = input.contentHash ?? sha256Hex(input.fileBuffer);

  const payload = {
    externalJobId: input.externalJobId,
    deviceId: input.deviceId,
    fileName: input.fileName,
    fileType: input.fileType,
    fileBase64: input.fileBuffer.toString("base64"),
    contentHash,
    ...(input.referenceNumber
      ? { referenceNumber: input.referenceNumber }
      : {}),
    ...(input.siteInfo ? { siteInfo: input.siteInfo } : {}),
  };

  // Compact JSON — must match bytes used for HMAC verification on the gateway.
  const rawBody = JSON.stringify(payload);
  const headers = createIngestAuthHeaders({
    apiKey: options.apiKey,
    hmacSecret: options.hmacSecret,
    method: "POST",
    path,
    rawBody,
  });

  const url = `${options.baseUrl.replace(/\/+$/, "")}${path}`;
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });

  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (res.status === 201) {
    return { httpStatus: 201, status: "accepted", body, idempotent: false };
  }
  if (res.status === 200) {
    return { httpStatus: 200, status: "duplicate", body, idempotent: true };
  }

  return { httpStatus: res.status, status: "error", body };
}

export function guessFileType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Stable externalJobId from drop source + relative path + content hash prefix.
 * Idempotent across poller restarts for the same blob/file bytes.
 */
export function buildExternalJobId(params: {
  source: "folder" | "blob";
  relativeKey: string;
  contentHash: string;
}): string {
  const safeKey = params.relativeKey
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._/-]+/g, "_")
    .slice(0, 80);
  return `drop-${params.source}-${safeKey}-${params.contentHash.slice(0, 16)}`.slice(
    0,
    128
  );
}
