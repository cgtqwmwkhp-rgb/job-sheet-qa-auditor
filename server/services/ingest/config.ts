/**
 * Ingest gateway configuration from environment.
 *
 * Env vars (document in PR / deploy notes — do not edit azure-deploy.yml here):
 * - INGEST_API_KEY          Shared secret for X-Api-Key (required to enable endpoint)
 * - INGEST_HMAC_SECRET      HMAC-SHA256 secret for X-Ingest-Signature (required)
 * - INGEST_MAX_SKEW_SECONDS Clock skew allowance for X-Ingest-Timestamp (default 300)
 * - INGEST_SYSTEM_USER_ID   users.id used as uploadedBy when creating job sheets
 */

export interface IngestConfig {
  apiKey: string;
  hmacSecret: string;
  maxSkewSeconds: number;
  systemUserId: number | null;
  enabled: boolean;
}

export function loadIngestConfig(
  env: NodeJS.ProcessEnv = process.env
): IngestConfig {
  const apiKey = (env.INGEST_API_KEY ?? "").trim();
  const hmacSecret = (env.INGEST_HMAC_SECRET ?? "").trim();
  const rawSkew = parseInt(env.INGEST_MAX_SKEW_SECONDS ?? "300", 10);
  const maxSkewSeconds =
    Number.isFinite(rawSkew) && rawSkew > 0 ? rawSkew : 300;
  const rawUser = parseInt(env.INGEST_SYSTEM_USER_ID ?? "", 10);
  const systemUserId = Number.isFinite(rawUser) && rawUser > 0 ? rawUser : null;

  return {
    apiKey,
    hmacSecret,
    maxSkewSeconds,
    systemUserId,
    enabled: Boolean(apiKey) && Boolean(hmacSecret),
  };
}
