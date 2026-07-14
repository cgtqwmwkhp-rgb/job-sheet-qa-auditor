import { createHmac, createHash } from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildCanonicalString,
  buildExternalJobId,
  createIngestAuthHeaders,
  guessFileType,
  postSignedIngestUpload,
  sha256Hex,
  INGEST_JOB_SHEETS_PATH,
} from "../ingestClient";

describe("dropIngest ingestClient (PR-IO-INGEST contract)", () => {
  it("sha256Hex matches crypto digest", () => {
    const buf = Buffer.from("hello-drop");
    expect(sha256Hex(buf)).toBe(createHash("sha256").update(buf).digest("hex"));
  });

  it("builds canonical string for HMAC", () => {
    expect(
      buildCanonicalString({
        timestamp: "1710000000",
        method: "post",
        path: INGEST_JOB_SHEETS_PATH,
        bodySha256: "abc",
      })
    ).toBe(`1710000000.POST.${INGEST_JOB_SHEETS_PATH}.abc`);
  });

  it("createIngestAuthHeaders signs timestamp.METHOD.path.bodySha256", () => {
    const rawBody = JSON.stringify({ externalJobId: "x", fileBase64: "YQ==" });
    const headers = createIngestAuthHeaders({
      apiKey: "key-1",
      hmacSecret: "secret-1",
      method: "POST",
      path: INGEST_JOB_SHEETS_PATH,
      rawBody,
      timestampSec: 1710000000,
    });

    const bodySha = createHash("sha256").update(rawBody).digest("hex");
    const canonical = `1710000000.POST.${INGEST_JOB_SHEETS_PATH}.${bodySha}`;
    const expected = createHmac("sha256", "secret-1")
      .update(canonical)
      .digest("hex");

    expect(headers["X-Api-Key"]).toBe("key-1");
    expect(headers["X-Ingest-Timestamp"]).toBe("1710000000");
    expect(headers["X-Ingest-Signature"]).toBe(`sha256=${expected}`);
  });

  it("guessFileType covers common job-sheet extensions", () => {
    expect(guessFileType("a.PDF")).toBe("application/pdf");
    expect(guessFileType("b.png")).toBe("image/png");
    expect(guessFileType("c.jpeg")).toBe("image/jpeg");
    expect(guessFileType("d.bin")).toBe("application/octet-stream");
  });

  it("buildExternalJobId is stable and bounded", () => {
    const id = buildExternalJobId({
      source: "folder",
      relativeKey: "Library/Incoming/sheet.pdf",
      contentHash: "a".repeat(64),
    });
    expect(id.startsWith("drop-folder-")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(
      buildExternalJobId({
        source: "folder",
        relativeKey: "Library/Incoming/sheet.pdf",
        contentHash: "a".repeat(64),
      })
    ).toBe(id);
  });

  it("postSignedIngestUpload POSTs signed JSON and maps 201/200", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-Api-Key"]).toBe("k");
      expect(headers["X-Ingest-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers["Content-Type"]).toBe("application/json");
      const body = JSON.parse(String(init?.body));
      expect(body.externalJobId).toBe("drop-1");
      expect(body.fileBase64).toBe(Buffer.from("%PDF").toString("base64"));
      expect(body.contentHash).toHaveLength(64);
      return new Response(JSON.stringify({ status: "accepted" }), {
        status: 201,
      });
    });

    const accepted = await postSignedIngestUpload(
      {
        baseUrl: "http://ingest.test",
        apiKey: "k",
        hmacSecret: "s",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      {
        externalJobId: "drop-1",
        deviceId: "sharepoint-drop",
        fileName: "sheet.pdf",
        fileType: "application/pdf",
        fileBuffer: Buffer.from("%PDF"),
      }
    );
    expect(accepted.status).toBe("accepted");
    expect(accepted.httpStatus).toBe(201);

    fetchImpl.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "duplicate" }), { status: 200 })
    );
    const dup = await postSignedIngestUpload(
      {
        baseUrl: "http://ingest.test",
        apiKey: "k",
        hmacSecret: "s",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      {
        externalJobId: "drop-1",
        deviceId: "sharepoint-drop",
        fileName: "sheet.pdf",
        fileType: "application/pdf",
        fileBuffer: Buffer.from("%PDF"),
      }
    );
    expect(dup.status).toBe("duplicate");
    expect(dup.idempotent).toBe(true);
  });
});
