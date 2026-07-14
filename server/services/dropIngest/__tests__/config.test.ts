import { describe, expect, it } from "vitest";
import { loadDropIngestConfig, resolveActiveSources } from "../config";

describe("dropIngest config", () => {
  it("is disabled by default", () => {
    const cfg = loadDropIngestConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.credentialsReady).toBe(false);
  });

  it("enables when DROP_INGEST_ENABLED=true and credentials present", () => {
    const cfg = loadDropIngestConfig({
      DROP_INGEST_ENABLED: "true",
      DROP_INGEST_WATCH_DIR: "/tmp/library-drop",
      INGEST_API_KEY: "k",
      INGEST_HMAC_SECRET: "s",
      DROP_INGEST_DEVICE_ID: "sp-sync-1",
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.credentialsReady).toBe(true);
    expect(cfg.watchDir).toBe("/tmp/library-drop");
    expect(cfg.deviceId).toBe("sp-sync-1");
    expect(cfg.ingestPath).toBe("/api/ingest/v1/job-sheets");
  });

  it("auto mode activates folder and/or blob sources", () => {
    expect(
      resolveActiveSources(
        loadDropIngestConfig({
          DROP_INGEST_MODE: "auto",
          DROP_INGEST_WATCH_DIR: "/tmp/d",
        })
      )
    ).toEqual(["folder"]);

    expect(
      resolveActiveSources(
        loadDropIngestConfig({
          DROP_INGEST_MODE: "auto",
          AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
        })
      )
    ).toEqual(["blob"]);

    expect(
      resolveActiveSources(
        loadDropIngestConfig({
          DROP_INGEST_MODE: "blob",
          DROP_INGEST_WATCH_DIR: "/tmp/d",
        })
      )
    ).toEqual([]);
  });
});
