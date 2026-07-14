/**
 * HMAC + config unit tests for signed machine ingest.
 */

import { describe, it, expect } from "vitest";
import {
  buildCanonicalString,
  createIngestAuthHeaders,
  formatSignatureHeader,
  sha256Hex,
  signCanonical,
  verifyIngestAuth,
} from "../hmac";
import { loadIngestConfig } from "../config";
import { IngestError } from "../types";

describe("ingest config", () => {
  it("is disabled when secrets missing", () => {
    const cfg = loadIngestConfig({});
    expect(cfg.enabled).toBe(false);
  });

  it("enables when API key and HMAC secret are set", () => {
    const cfg = loadIngestConfig({
      INGEST_API_KEY: "test-api-key-32chars-minimum!!",
      INGEST_HMAC_SECRET: "test-hmac-secret-32chars-min!!!!",
      INGEST_SYSTEM_USER_ID: "42",
      INGEST_MAX_SKEW_SECONDS: "120",
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.systemUserId).toBe(42);
    expect(cfg.maxSkewSeconds).toBe(120);
  });
});

describe("ingest HMAC", () => {
  const apiKey = "machine-key-aaaaaaaaaaaaaaaaaaaa";
  const hmacSecret = "hmac-secret-bbbbbbbbbbbbbbbbbbbb";
  const path = "/api/ingest/v1/job-sheets";
  const body = JSON.stringify({
    externalJobId: "job-1",
    deviceId: "device-1",
    fileName: "sheet.pdf",
    fileType: "application/pdf",
    fileBase64: "JVBERi0x",
  });

  it("builds a stable canonical string", () => {
    const canonical = buildCanonicalString({
      timestamp: "1700000000",
      method: "post",
      path,
      bodySha256: sha256Hex(body),
    });
    expect(canonical).toBe(
      `1700000000.POST.${path}.${sha256Hex(body)}`
    );
  });

  it("round-trips createIngestAuthHeaders + verifyIngestAuth", () => {
    const headers = createIngestAuthHeaders({
      apiKey,
      hmacSecret,
      method: "POST",
      path,
      rawBody: body,
      timestampSec: 1_700_000_000,
    });

    expect(headers["X-Ingest-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

    expect(() =>
      verifyIngestAuth({
        config: loadIngestConfig({
          INGEST_API_KEY: apiKey,
          INGEST_HMAC_SECRET: hmacSecret,
        }),
        apiKey: headers["X-Api-Key"],
        signatureHeader: headers["X-Ingest-Signature"],
        timestampHeader: headers["X-Ingest-Timestamp"],
        method: "POST",
        path,
        rawBody: body,
        nowMs: 1_700_000_000 * 1000,
      })
    ).not.toThrow();
  });

  it("rejects wrong signature without requiring Entra", () => {
    const headers = createIngestAuthHeaders({
      apiKey,
      hmacSecret,
      method: "POST",
      path,
      rawBody: body,
      timestampSec: 1_700_000_000,
    });

    expect(() =>
      verifyIngestAuth({
        config: loadIngestConfig({
          INGEST_API_KEY: apiKey,
          INGEST_HMAC_SECRET: hmacSecret,
        }),
        apiKey: headers["X-Api-Key"],
        signatureHeader: formatSignatureHeader("0".repeat(64)),
        timestampHeader: headers["X-Ingest-Timestamp"],
        method: "POST",
        path,
        rawBody: body,
        nowMs: 1_700_000_000 * 1000,
      })
    ).toThrow(IngestError);
  });

  it("rejects skewed timestamps", () => {
    const headers = createIngestAuthHeaders({
      apiKey,
      hmacSecret,
      method: "POST",
      path,
      rawBody: body,
      timestampSec: 1_700_000_000,
    });

    expect(() =>
      verifyIngestAuth({
        config: loadIngestConfig({
          INGEST_API_KEY: apiKey,
          INGEST_HMAC_SECRET: hmacSecret,
          INGEST_MAX_SKEW_SECONDS: "60",
        }),
        apiKey: headers["X-Api-Key"],
        signatureHeader: headers["X-Ingest-Signature"],
        timestampHeader: headers["X-Ingest-Timestamp"],
        method: "POST",
        path,
        rawBody: body,
        nowMs: (1_700_000_000 + 600) * 1000,
      })
    ).toThrow(/skew/i);
  });

  it("rejects missing API key", () => {
    expect(() =>
      verifyIngestAuth({
        config: loadIngestConfig({
          INGEST_API_KEY: apiKey,
          INGEST_HMAC_SECRET: hmacSecret,
        }),
        apiKey: undefined,
        signatureHeader: formatSignatureHeader(
          signCanonical(
            buildCanonicalString({
              timestamp: "1700000000",
              method: "POST",
              path,
              bodySha256: sha256Hex(body),
            }),
            hmacSecret
          )
        ),
        timestampHeader: "1700000000",
        method: "POST",
        path,
        rawBody: body,
        nowMs: 1_700_000_000 * 1000,
      })
    ).toThrow(/API key/i);
  });

  it("accepts bare hex signature header", () => {
    const digest = signCanonical(
      buildCanonicalString({
        timestamp: "1700000000",
        method: "POST",
        path,
        bodySha256: sha256Hex(body),
      }),
      hmacSecret
    );

    expect(() =>
      verifyIngestAuth({
        config: loadIngestConfig({
          INGEST_API_KEY: apiKey,
          INGEST_HMAC_SECRET: hmacSecret,
        }),
        apiKey,
        signatureHeader: digest,
        timestampHeader: "1700000000",
        method: "POST",
        path,
        rawBody: body,
        nowMs: 1_700_000_000 * 1000,
      })
    ).not.toThrow();
  });
});
