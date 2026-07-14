/**
 * Feature-flag matrix — effective process.env + staging/prod deploy contract.
 *
 * Read-only. No mutations. Secrets are never returned (presence only).
 */

import { FEATURE_FLAG_CATALOG, KEY_ENV_CATALOG } from "./catalog";
import type {
  DeployExpectation,
  DeployMatrixRow,
  EffectiveFeatureFlag,
  FeatureFlagMatrixSnapshot,
  KeyEnvVar,
} from "./types";

/** Mirror of APP_ENV resolution without importing ENV (avoids JWT boot side-effects). */
function resolveAppEnvironment(): string {
  const appEnv = process.env.APP_ENV?.toLowerCase();
  if (
    appEnv === "staging" ||
    appEnv === "production" ||
    appEnv === "development"
  ) {
    return appEnv;
  }
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export type {
  DeployExpectation,
  DeployMatrixRow,
  EffectiveFeatureFlag,
  FeatureFlagCatalogEntry,
  FeatureFlagMatrixSnapshot,
  FlagParity,
  KeyEnvVar,
} from "./types";

export { FEATURE_FLAG_CATALOG, KEY_ENV_CATALOG } from "./catalog";

function isTruthyFlag(raw: string | null | undefined): boolean {
  return raw === "true" || raw === "1";
}

function expectationMatches(
  expectation: DeployExpectation,
  raw: string | null
): boolean | null {
  if (expectation === "conditional") return null;
  if (expectation === "unset") return raw === null;
  if (expectation === "true") return isTruthyFlag(raw);
  if (expectation === "false") {
    return raw === "false" || raw === "0";
  }
  return null;
}

function matchesDeployContract(
  environment: string,
  staging: DeployExpectation,
  production: DeployExpectation,
  raw: string | null
): boolean | null {
  if (environment === "staging") {
    return expectationMatches(staging, raw);
  }
  if (environment === "production") {
    return expectationMatches(production, raw);
  }
  return null;
}

function stagingProdMatch(
  staging: DeployExpectation,
  production: DeployExpectation
): boolean {
  return staging === production;
}

export function getFeatureFlagMatrix(
  now: Date = new Date()
): FeatureFlagMatrixSnapshot {
  const environment = resolveAppEnvironment();
  const catalogKeys = new Set(FEATURE_FLAG_CATALOG.map(e => e.key));

  const flags: EffectiveFeatureFlag[] = FEATURE_FLAG_CATALOG.map(entry => {
    const raw = process.env[entry.key];
    const normalized = raw === undefined || raw === "" ? null : raw;
    return {
      key: entry.key,
      description: entry.description,
      critical: entry.critical,
      parity: entry.parity,
      raw: normalized,
      truthy: isTruthyFlag(normalized),
      defaultWhenUnset: entry.defaultWhenUnset,
      deploy: entry.deploy,
      matchesDeployContract: matchesDeployContract(
        environment,
        entry.deploy.staging,
        entry.deploy.production,
        normalized
      ),
    };
  });

  const deployMatrix: DeployMatrixRow[] = FEATURE_FLAG_CATALOG.filter(
    e => e.critical || e.parity !== "unspecified"
  ).map(entry => ({
    key: entry.key,
    description: entry.description,
    critical: entry.critical,
    parity: entry.parity,
    staging: entry.deploy.staging,
    production: entry.deploy.production,
    stagingProdMatch: stagingProdMatch(
      entry.deploy.staging,
      entry.deploy.production
    ),
    note: entry.deploy.note,
  }));

  const matched = deployMatrix
    .filter(r => r.critical && r.parity === "must_match" && r.stagingProdMatch)
    .map(r => r.key);
  const intentionallyDivergent = deployMatrix
    .filter(r => r.critical && r.parity === "intentionally_divergent")
    .map(r => r.key);

  const mustMatchRows = deployMatrix.filter(
    r => r.critical && r.parity === "must_match"
  );
  const allCriticalMatchedOrDocumented =
    mustMatchRows.every(r => r.stagingProdMatch) &&
    intentionallyDivergent.length > 0;

  const uncatalogued: Array<{ key: string; raw: string }> = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("FEATURE_")) continue;
    if (catalogKeys.has(key)) continue;
    if (value === undefined) continue;
    uncatalogued.push({ key, raw: value });
  }
  uncatalogued.sort((a, b) => a.key.localeCompare(b.key));

  const keyEnv: KeyEnvVar[] = KEY_ENV_CATALOG.map(entry => {
    const raw = process.env[entry.key];
    if (entry.secret) {
      return {
        key: entry.key,
        description: entry.description,
        raw: null,
        configured: Boolean(raw && raw.trim()),
      };
    }
    return {
      key: entry.key,
      description: entry.description,
      raw: raw === undefined || raw === "" ? null : raw,
    };
  });

  return {
    timestamp: now.toISOString(),
    environment,
    nodeEnv: process.env.NODE_ENV || "development",
    readOnly: true,
    source: {
      effective: "process.env",
      deployContract: "azure-deploy.yml (documented; FlagOps-owned)",
    },
    criticalParity: {
      matched,
      intentionallyDivergent,
      allCriticalMatchedOrDocumented,
    },
    deployMatrix,
    flags,
    uncatalogued,
    keyEnv,
  };
}
