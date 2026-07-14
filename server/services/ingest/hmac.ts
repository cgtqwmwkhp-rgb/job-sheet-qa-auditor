/**
 * HMAC-SHA256 request signing for machine ingest (no Entra browser).
 *
 * Canonical string:
 *   `${timestamp}.${METHOD}.${path}.${sha256Hex(rawBody)}`
 *
 * Headers:
 *   X-Api-Key: <INGEST_API_KEY>
 *   X-Ingest-Timestamp: <unix seconds>
 *   X-Ingest-Signature: sha256=<hex hmac>
 */

import { createHmac, createHash, timingSafeEqual } from "crypto";
import type { IngestConfig } from "./config";
import { IngestError } from "./types";

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

export function signCanonical(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function formatSignatureHeader(hexDigest: string): string {
  return `sha256=${hexDigest}`;
}

export function parseSignatureHeader(
  header: string | undefined
): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const prefix = "sha256=";
  if (trimmed.toLowerCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim().toLowerCase();
  }
  // Allow bare hex for simpler clients
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function safeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify API key + HMAC signature + timestamp skew.
 * Throws IngestError on failure.
 */
export function verifyIngestAuth(params: {
  config: IngestConfig;
  apiKey: string | undefined;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  method: string;
  path: string;
  rawBody: string | Buffer;
  nowMs?: number;
}): void {
  const { config } = params;

  if (!config.enabled) {
    throw new IngestError(
      "NOT_CONFIGURED",
      "Machine ingest is not configured. Set INGEST_API_KEY and INGEST_HMAC_SECRET."
    );
  }

  if (!params.apiKey || !safeEqualUtf8(params.apiKey, config.apiKey)) {
    throw new IngestError("UNAUTHORIZED", "Invalid or missing API key");
  }

  const providedSig = parseSignatureHeader(params.signatureHeader);
  if (!providedSig) {
    throw new IngestError(
      "UNAUTHORIZED",
      "Missing or invalid X-Ingest-Signature"
    );
  }

  const timestamp = (params.timestampHeader ?? "").trim();
  if (!/^\d+$/.test(timestamp)) {
    throw new IngestError(
      "UNAUTHORIZED",
      "Missing or invalid X-Ingest-Timestamp"
    );
  }

  const tsSec = parseInt(timestamp, 10);
  const nowSec = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - tsSec) > config.maxSkewSeconds) {
    throw new IngestError(
      "UNAUTHORIZED",
      "Timestamp outside allowed skew window",
      {
        maxSkewSeconds: config.maxSkewSeconds,
      }
    );
  }

  const bodySha256 = sha256Hex(params.rawBody);
  const canonical = buildCanonicalString({
    timestamp,
    method: params.method,
    path: params.path,
    bodySha256,
  });
  const expected = signCanonical(canonical, config.hmacSecret);

  if (!safeEqualHex(providedSig, expected)) {
    throw new IngestError("UNAUTHORIZED", "Invalid request signature");
  }
}

/**
 * Helper for clients / tests: produce auth headers for a request.
 */
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
  const sig = signCanonical(canonical, params.hmacSecret);
  return {
    "X-Api-Key": params.apiKey,
    "X-Ingest-Timestamp": timestamp,
    "X-Ingest-Signature": formatSignatureHeader(sig),
  };
}
