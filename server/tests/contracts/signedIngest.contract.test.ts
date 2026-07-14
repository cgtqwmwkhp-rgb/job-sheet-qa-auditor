/**
 * Contract: signed ingest router is mounted and uses machine auth (no Entra).
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Signed ingest API contract (PR-IO-INGEST)", () => {
  const ingestDir = path.resolve(__dirname, "../../services/ingest");
  const indexCorePath = path.resolve(__dirname, "../../_core/index.ts");

  let coreIndex: string;
  let routerSrc: string;
  let serviceSrc: string;
  let hmacSrc: string;

  beforeAll(() => {
    coreIndex = fs.readFileSync(indexCorePath, "utf-8");
    routerSrc = fs.readFileSync(path.join(ingestDir, "router.ts"), "utf-8");
    serviceSrc = fs.readFileSync(
      path.join(ingestDir, "ingestService.ts"),
      "utf-8"
    );
    hmacSrc = fs.readFileSync(path.join(ingestDir, "hmac.ts"), "utf-8");
  });

  it("mounts ingestRouter at /api/ingest", () => {
    expect(coreIndex).toContain('app.use("/api/ingest", ingestRouter)');
    expect(coreIndex).toContain('from "../services/ingest"');
  });

  it("stashes rawBody for HMAC over the exact request bytes", () => {
    expect(coreIndex).toContain("rawBody");
    expect(coreIndex).toMatch(/verify:\s*\(/);
  });

  it("exposes POST /v1/job-sheets and health without Easy Auth", () => {
    expect(routerSrc).toContain('"/v1/job-sheets"');
    expect(routerSrc).toContain('"/health"');
    expect(routerSrc).not.toContain("sdk.authenticateRequest");
    expect(routerSrc).not.toContain("x-ms-client-principal");
    expect(routerSrc).toContain("x-api-key");
    expect(routerSrc).toContain("x-ingest-signature");
  });

  it("health advertises entraRequired: false", () => {
    expect(routerSrc).toContain("entraRequired: false");
  });

  it("idempotency keys on externalJobId and content hash", () => {
    expect(serviceSrc).toContain("getByExternalJobId");
    expect(serviceSrc).toContain("getByContentHash");
    expect(serviceSrc).toContain("external_job_id_and_hash");
    expect(serviceSrc).toContain("content_hash");
    expect(serviceSrc).toContain("CONFLICT");
  });

  it("signs with HMAC-SHA256 timing-safe compare", () => {
    expect(hmacSrc).toContain("createHmac");
    expect(hmacSrc).toContain("timingSafeEqual");
    expect(hmacSrc).toContain("INGEST_HMAC_SECRET");
  });

  it("documents required env vars in config module", () => {
    const configSrc = fs.readFileSync(
      path.join(ingestDir, "config.ts"),
      "utf-8"
    );
    expect(configSrc).toContain("INGEST_API_KEY");
    expect(configSrc).toContain("INGEST_HMAC_SECRET");
    expect(configSrc).toContain("INGEST_SYSTEM_USER_ID");
  });
});
