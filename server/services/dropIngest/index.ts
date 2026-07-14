/**
 * PR-IO-SHAREPOINT — watched-folder / Blob drop → signed ingest.
 *
 * Owns the poller only. Posts into PR-IO-INGEST via HTTP (API key + HMAC).
 * Does not mount or rewrite the ingest HMAC router.
 */

import {
  loadDropIngestConfig,
  resolveActiveSources,
  type DropIngestConfig,
} from "./config";
import { DropIngestPoller } from "./poller";
import {
  createAzureBlobDropSource,
  createFolderDropSource,
  type DropSource,
} from "./sources";
import { createDropStateStore } from "./stateStore";

export {
  loadDropIngestConfig,
  resolveActiveSources,
  type DropIngestConfig,
} from "./config";
export {
  createIngestAuthHeaders,
  postSignedIngestUpload,
  sha256Hex,
  buildExternalJobId,
  guessFileType,
  INGEST_JOB_SHEETS_PATH,
} from "./ingestClient";
export { DropIngestPoller, type DropPollTickResult } from "./poller";
export {
  FolderDropSource,
  BlobDropSource,
  createFolderDropSource,
  createAzureBlobDropSource,
} from "./sources";
export {
  MemoryDropStateStore,
  FileDropStateStore,
  createDropStateStore,
} from "./stateStore";

let activePoller: DropIngestPoller | null = null;

export function getDropIngestPoller(): DropIngestPoller | null {
  return activePoller;
}

export function getDropIngestStatus(): {
  enabled: boolean;
  credentialsReady: boolean;
  sources: Array<"folder" | "blob">;
  running: boolean;
  processedCount: number;
  lastTick: ReturnType<DropIngestPoller["getStatus"]>["lastTick"];
  entraRequired: false;
  challenge: string;
} {
  const config = loadDropIngestConfig();
  const sources = resolveActiveSources(config);
  const status = activePoller?.getStatus();
  return {
    enabled: config.enabled,
    credentialsReady: config.credentialsReady,
    sources,
    running: status?.running ?? false,
    processedCount: status?.processedCount ?? 0,
    lastTick: status?.lastTick ?? null,
    entraRequired: false,
    challenge: "Library drop → audit without manual /upload",
  };
}

/**
 * Build sources for config. Exported for tests.
 */
export async function buildDropSources(
  config: DropIngestConfig
): Promise<DropSource[]> {
  const kinds = resolveActiveSources(config);
  const sources: DropSource[] = [];
  for (const kind of kinds) {
    if (kind === "folder") {
      sources.push(createFolderDropSource(config));
    } else if (kind === "blob") {
      sources.push(await createAzureBlobDropSource(config));
    }
  }
  return sources;
}

/**
 * Start the drop poller when DROP_INGEST_ENABLED=true and credentials + sources exist.
 * Fail-safe: never throws into server boot.
 */
export async function startDropIngestPoller(
  env: NodeJS.ProcessEnv = process.env
): Promise<DropIngestPoller | null> {
  if (activePoller) return activePoller;

  const config = loadDropIngestConfig(env);
  if (!config.enabled) {
    console.log("[DropIngest] Disabled (set DROP_INGEST_ENABLED=true to start)");
    return null;
  }

  if (!config.credentialsReady) {
    console.warn(
      "[DropIngest] Enabled but INGEST_API_KEY / INGEST_HMAC_SECRET missing — not starting"
    );
    return null;
  }

  const kinds = resolveActiveSources(config);
  if (kinds.length === 0) {
    console.warn(
      "[DropIngest] Enabled but no sources configured (set DROP_INGEST_WATCH_DIR and/or blob connection)"
    );
    return null;
  }

  try {
    const sources = await buildDropSources(config);
    const state = await createDropStateStore(config.statePath);
    const poller = new DropIngestPoller({ config, sources, state });
    poller.start();
    activePoller = poller;
    console.log(
      `[DropIngest] Poller started sources=[${kinds.join(",")}] baseUrl=${config.baseUrl} deviceId=${config.deviceId}`
    );
    return poller;
  } catch (err) {
    console.warn("[DropIngest] Failed to start poller:", err);
    return null;
  }
}

export function stopDropIngestPoller(): void {
  if (activePoller) {
    activePoller.stop();
    activePoller = null;
  }
}

/** Test-only reset. */
export function resetDropIngestPollerForTests(): void {
  stopDropIngestPoller();
}
