/**
 * Express router integration: signed POST without Entra session.
 * Uses native fetch against an ephemeral listen port (no supertest dep).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { createIngestAuthHeaders } from "../hmac";
import { createIngestRouter } from "../router";
import { MemoryIngestReceiptStore } from "../receiptStore";

const API_KEY = "router-test-api-key-32chars!!!!";
const HMAC_SECRET = "router-test-hmac-secret-32ch!!!!";
const PATH = "/api/ingest/v1/job-sheets";

const FILE_B64 = Buffer.from("%PDF-1.4 router fixture").toString("base64");

describe("ingest router (http)", () => {
  let store: MemoryIngestReceiptStore;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    store = new MemoryIngestReceiptStore();
    process.env.INGEST_API_KEY = API_KEY;
    process.env.INGEST_HMAC_SECRET = HMAC_SECRET;
    process.env.INGEST_SYSTEM_USER_ID = "1";

    const app = express();
    app.use(
      express.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
          (req as express.Request & { rawBody?: string }).rawBody =
            buf.toString("utf8");
        },
      })
    );
    app.use(
      "/api/ingest",
      createIngestRouter({
        store,
        signaturePath: PATH,
        persist: async () => ({
          fileKey: "ingest/test/router.pdf",
          fileUrl: "file://ingest/test/router.pdf",
          jobSheetId: 7,
        }),
      })
    );

    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  it("GET /health reports machine auth without Entra", async () => {
    const res = await fetch(`${baseUrl}/api/ingest/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entraRequired: boolean;
      enabled: boolean;
      auth: string;
    };
    expect(body.entraRequired).toBe(false);
    expect(body.enabled).toBe(true);
    expect(body.auth).toBe("api_key_hmac");
  });

  it("rejects unsigned requests with 401", async () => {
    const res = await fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        externalJobId: "j1",
        deviceId: "d1",
        fileName: "a.pdf",
        fileType: "application/pdf",
        fileBase64: FILE_B64,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts signed upload and idempotently replays", async () => {
    const payload = {
      externalJobId: "ext-router-1",
      deviceId: "device-9",
      fileName: "sheet.pdf",
      fileType: "application/pdf",
      fileBase64: FILE_B64,
    };
    const rawBody = JSON.stringify(payload);
    const headers = createIngestAuthHeaders({
      apiKey: API_KEY,
      hmacSecret: HMAC_SECRET,
      method: "POST",
      path: PATH,
      rawBody,
    });

    const first = await fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: rawBody,
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      status: string;
      receipt: { ingestId: string; jobSheetId: number };
    };
    expect(firstBody.status).toBe("accepted");
    expect(firstBody.receipt.jobSheetId).toBe(7);

    const headers2 = createIngestAuthHeaders({
      apiKey: API_KEY,
      hmacSecret: HMAC_SECRET,
      method: "POST",
      path: PATH,
      rawBody,
    });

    const second = await fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { ...headers2, "Content-Type": "application/json" },
      body: rawBody,
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      status: string;
      idempotent: boolean;
      receipt: { ingestId: string };
    };
    expect(secondBody.status).toBe("duplicate");
    expect(secondBody.idempotent).toBe(true);
    expect(secondBody.receipt.ingestId).toBe(firstBody.receipt.ingestId);
  });
});
