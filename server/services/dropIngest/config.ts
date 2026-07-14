/**
 * Drop-ingest poller configuration (PR-IO-SHAREPOINT).
 *
 * Watches a SharePoint-synced folder and/or Azure Blob drop prefix, then
 * POSTs each new file into the signed machine ingest contract from PR-IO-INGEST.
 *
 * Env vars (document in PR / deploy notes — do not edit azure-deploy.yml here):
 * - DROP_INGEST_ENABLED              "true" to start the poller
 * - DROP_INGEST_MODE                 "folder" | "blob" | "auto" (default auto)
 * - DROP_INGEST_WATCH_DIR            Local / synced-library folder path
 * - DROP_INGEST_BLOB_CONNECTION_STRING  Azure connection (falls back to AZURE_STORAGE_CONNECTION_STRING)
 * - DROP_INGEST_BLOB_CONTAINER       Container name (default: jobsheet-drops)
 * - DROP_INGEST_BLOB_PREFIX          Optional blob name prefix filter
 * - DROP_INGEST_POLL_INTERVAL_MS     Poll interval (default 30000)
 * - DROP_INGEST_DEVICE_ID            deviceId sent to ingest (default sharepoint-drop)
 * - DROP_INGEST_BASE_URL             Base URL of this app (default http://127.0.0.1:$PORT)
 * - DROP_INGEST_ARCHIVE_DIR          Optional folder to move processed local files into
 * - DROP_INGEST_STATE_PATH           Optional durable processed-key state file
 * - DROP_INGEST_MAX_FILE_BYTES       Max file size (default 45mb)
 * - INGEST_API_KEY / INGEST_HMAC_SECRET  Same secrets as PR-IO-INGEST client
 */

export type DropIngestMode = "folder" | "blob" | "auto";

export interface DropIngestConfig {
  enabled: boolean;
  mode: DropIngestMode;
  watchDir: string | null;
  blobConnectionString: string | null;
  blobContainer: string;
  blobPrefix: string;
  pollIntervalMs: number;
  deviceId: string;
  baseUrl: string;
  archiveDir: string | null;
  statePath: string | null;
  maxFileBytes: number;
  apiKey: string;
  hmacSecret: string;
  ingestPath: string;
  /** True when API key + HMAC secret are present (can call ingest). */
  credentialsReady: boolean;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadDropIngestConfig(
  env: NodeJS.ProcessEnv = process.env
): DropIngestConfig {
  const enabled =
    (env.DROP_INGEST_ENABLED ?? "").trim().toLowerCase() === "true";
  const modeRaw = (env.DROP_INGEST_MODE ?? "auto").trim().toLowerCase();
  const mode: DropIngestMode =
    modeRaw === "folder" || modeRaw === "blob" || modeRaw === "auto"
      ? modeRaw
      : "auto";

  const watchDir = (env.DROP_INGEST_WATCH_DIR ?? "").trim() || null;
  const blobConnectionString =
    (env.DROP_INGEST_BLOB_CONNECTION_STRING ?? "").trim() ||
    (env.AZURE_STORAGE_CONNECTION_STRING ?? "").trim() ||
    null;
  const blobContainer =
    (env.DROP_INGEST_BLOB_CONTAINER ?? "").trim() || "jobsheet-drops";
  const blobPrefix = (env.DROP_INGEST_BLOB_PREFIX ?? "").trim();

  const port = (env.PORT ?? "3000").trim() || "3000";
  const baseUrl =
    (env.DROP_INGEST_BASE_URL ?? "").trim() || `http://127.0.0.1:${port}`;

  const apiKey = (env.INGEST_API_KEY ?? "").trim();
  const hmacSecret = (env.INGEST_HMAC_SECRET ?? "").trim();

  return {
    enabled,
    mode,
    watchDir,
    blobConnectionString,
    blobContainer,
    blobPrefix,
    pollIntervalMs: parsePositiveInt(env.DROP_INGEST_POLL_INTERVAL_MS, 30_000),
    deviceId: (env.DROP_INGEST_DEVICE_ID ?? "").trim() || "sharepoint-drop",
    baseUrl: baseUrl.replace(/\/+$/, ""),
    archiveDir: (env.DROP_INGEST_ARCHIVE_DIR ?? "").trim() || null,
    statePath: (env.DROP_INGEST_STATE_PATH ?? "").trim() || null,
    maxFileBytes: parsePositiveInt(
      env.DROP_INGEST_MAX_FILE_BYTES,
      45 * 1024 * 1024
    ),
    apiKey,
    hmacSecret,
    ingestPath: "/api/ingest/v1/job-sheets",
    credentialsReady: Boolean(apiKey) && Boolean(hmacSecret),
  };
}

/**
 * Resolve which sources to activate for the given config.
 */
export function resolveActiveSources(
  config: DropIngestConfig
): Array<"folder" | "blob"> {
  if (config.mode === "folder") {
    return config.watchDir ? ["folder"] : [];
  }
  if (config.mode === "blob") {
    return config.blobConnectionString ? ["blob"] : [];
  }
  // auto
  const sources: Array<"folder" | "blob"> = [];
  if (config.watchDir) sources.push("folder");
  if (config.blobConnectionString) sources.push("blob");
  return sources;
}
