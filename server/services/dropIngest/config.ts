/**
 * Drop-ingest poller configuration (PR-IO-SHAREPOINT).
 *
 * Watches a SharePoint-synced folder, Graph drive folder, and/or Azure Blob drop prefix, then
 * POSTs each new file into the signed machine ingest contract from PR-IO-INGEST.
 *
 * Env vars (document in PR / deploy notes — do not edit azure-deploy.yml here):
 * - DROP_INGEST_ENABLED              "true" to start the poller
 * - DROP_INGEST_MODE                 "folder" | "blob" | "graph" | "auto" (default auto)
 * - DROP_INGEST_WATCH_DIR            Local / synced-library folder path
 * - DROP_INGEST_BLOB_CONNECTION_STRING  Azure connection (falls back to AZURE_STORAGE_CONNECTION_STRING)
 * - DROP_INGEST_BLOB_CONTAINER       Container name (default: jobsheet-drops)
 * - DROP_INGEST_BLOB_PREFIX          Optional blob name prefix filter
 * - FEATURE_DROP_GRAPH               "true" to permit Microsoft Graph polling
 * - DROP_INGEST_GRAPH_DRIVE_ID       SharePoint document-library drive ID
 * - DROP_INGEST_GRAPH_FOLDER_ID      Folder item ID (defaults to the drive root)
 * - GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET
 * - DROP_INGEST_POLL_INTERVAL_MS     Poll interval (default 30000)
 * - DROP_INGEST_DEVICE_ID            deviceId sent to ingest (default sharepoint-drop)
 * - DROP_INGEST_BASE_URL             Base URL of this app (default http://127.0.0.1:$PORT)
 * - DROP_INGEST_ARCHIVE_DIR          Optional folder to move processed local files into
 * - DROP_INGEST_STATE_PATH           Optional durable processed-key state file
 * - DROP_INGEST_MAX_FILE_BYTES       Max file size (default 45mb)
 * - DROP_INGEST_MAX_ATTEMPTS         Transient failures before poison→DLQ (default 3)
 * - INGEST_API_KEY / INGEST_HMAC_SECRET  Same secrets as PR-IO-INGEST client
 */

export type DropIngestMode = "folder" | "blob" | "graph" | "auto";

export interface DropIngestConfig {
  enabled: boolean;
  mode: DropIngestMode;
  watchDir: string | null;
  blobConnectionString: string | null;
  blobContainer: string;
  blobPrefix: string;
  graphEnabled: boolean;
  graphDriveId: string | null;
  graphFolderId: string | null;
  graphCredentialsReady: boolean;
  pollIntervalMs: number;
  deviceId: string;
  baseUrl: string;
  archiveDir: string | null;
  statePath: string | null;
  maxFileBytes: number;
  /** Transient ingest failures before poison→DLQ quarantine. */
  maxAttempts: number;
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
    modeRaw === "folder" ||
    modeRaw === "blob" ||
    modeRaw === "graph" ||
    modeRaw === "auto"
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
  const graphEnabled =
    (env.FEATURE_DROP_GRAPH ?? "").trim().toLowerCase() === "true";
  const graphDriveId = (env.DROP_INGEST_GRAPH_DRIVE_ID ?? "").trim() || null;
  const graphFolderId = (env.DROP_INGEST_GRAPH_FOLDER_ID ?? "").trim() || null;
  const graphCredentialsReady = Boolean(
    (env.GRAPH_TENANT_ID ?? "").trim() &&
      (env.GRAPH_CLIENT_ID ?? "").trim() &&
      (env.GRAPH_CLIENT_SECRET ?? "").trim()
  );

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
    graphEnabled,
    graphDriveId,
    graphFolderId,
    graphCredentialsReady,
    pollIntervalMs: parsePositiveInt(env.DROP_INGEST_POLL_INTERVAL_MS, 30_000),
    deviceId: (env.DROP_INGEST_DEVICE_ID ?? "").trim() || "sharepoint-drop",
    baseUrl: baseUrl.replace(/\/+$/, ""),
    archiveDir: (env.DROP_INGEST_ARCHIVE_DIR ?? "").trim() || null,
    statePath: (env.DROP_INGEST_STATE_PATH ?? "").trim() || null,
    maxFileBytes: parsePositiveInt(
      env.DROP_INGEST_MAX_FILE_BYTES,
      45 * 1024 * 1024
    ),
    maxAttempts: parsePositiveInt(env.DROP_INGEST_MAX_ATTEMPTS, 3),
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
): Array<"folder" | "blob" | "graph"> {
  if (config.mode === "folder") {
    return config.watchDir ? ["folder"] : [];
  }
  if (config.mode === "blob") {
    return config.blobConnectionString ? ["blob"] : [];
  }
  if (config.mode === "graph") {
    return config.graphEnabled &&
      config.graphDriveId &&
      config.graphCredentialsReady
      ? ["graph"]
      : [];
  }
  // auto
  const sources: Array<"folder" | "blob" | "graph"> = [];
  if (config.watchDir) sources.push("folder");
  if (config.blobConnectionString) sources.push("blob");
  if (
    config.graphEnabled &&
    config.graphDriveId &&
    config.graphCredentialsReady
  ) {
    sources.push("graph");
  }
  return sources;
}
