/**
 * Contract: PR-IO-SHAREPOINT drop poller posts into PR-IO-INGEST path
 * without owning the HMAC router / Easy Auth session.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  INGEST_JOB_SHEETS_PATH,
  createIngestAuthHeaders,
} from "../../services/dropIngest/ingestClient";
import { createDropIngestRouter } from "../../services/dropIngest/router";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("dropIngest contract (PR-IO-SHAREPOINT)", () => {
  it("targets the signed ingest mount path from PR-IO-INGEST", () => {
    expect(INGEST_JOB_SHEETS_PATH).toBe("/api/ingest/v1/job-sheets");
  });

  it("signs with X-Api-Key + X-Ingest-* headers (no Entra cookie)", () => {
    const headers = createIngestAuthHeaders({
      apiKey: "k",
      hmacSecret: "s",
      method: "POST",
      path: INGEST_JOB_SHEETS_PATH,
      rawBody: "{}",
      timestampSec: 1,
    });
    expect(Object.keys(headers).sort()).toEqual([
      "X-Api-Key",
      "X-Ingest-Signature",
      "X-Ingest-Timestamp",
    ]);
    expect(headers["X-Ingest-Signature"].startsWith("sha256=")).toBe(true);
  });

  it("exposes /api/drop-ingest/health without entraRequired", async () => {
    const router = createDropIngestRouter();
    const layer = router.stack.find(
      (l: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
        l.route?.path === "/health" && l.route?.methods?.get
    );
    expect(layer).toBeTruthy();

    // Smoke the handler via a minimal mock req/res
    let payload: Record<string, unknown> | null = null;
    const handler = layer.route.stack[0].handle;
    await new Promise<void>(resolve => {
      handler(
        {},
        {
          json: (body: Record<string, unknown>) => {
            payload = body;
            resolve();
          },
        }
      );
    });
    expect(payload).toMatchObject({
      ok: true,
      service: "drop-ingest",
      entraRequired: false,
      challenge: "Library drop → audit without manual /upload",
    });
  });

  it("server mounts drop-ingest router and does not edit azure-deploy.yml", () => {
    const indexSrc = readFileSync(
      path.join(repoRoot, "server/_core/index.ts"),
      "utf8"
    );
    expect(indexSrc).toContain('app.use("/api/drop-ingest", dropIngestRouter)');
    expect(indexSrc).toContain("startDropIngestPoller");
    // Ownership: do not claim ingest HMAC router
    expect(indexSrc).not.toContain('app.use("/api/ingest"');
  });
});
