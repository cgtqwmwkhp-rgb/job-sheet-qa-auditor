/**
 * Feature-flag matrix types (PR-OPS-FLAGS).
 *
 * Read-only view of what this process sees + the staging/prod deploy contract.
 * Source of deploy expectations: .github/workflows/azure-deploy.yml (owned by FlagOps).
 */

export type DeployExpectation =
  | "true"
  | "false"
  | "unset"
  /** Set only when a related secret/capability is present (e.g. Azure DI). */
  | "conditional";

/** Whether staging and production are expected to match for this flag. */
export type FlagParity =
  | "must_match"
  | "intentionally_divergent"
  | "unspecified";

export type DefaultWhenUnset = "off" | "on" | "conditional";

export interface FeatureFlagCatalogEntry {
  key: string;
  description: string;
  /** How application code treats an unset env var. */
  defaultWhenUnset: DefaultWhenUnset;
  /** Critical for ops / release bar — shown prominently. */
  critical: boolean;
  parity: FlagParity;
  deploy: {
    staging: DeployExpectation;
    production: DeployExpectation;
    note?: string;
  };
}

export interface EffectiveFeatureFlag {
  key: string;
  description: string;
  critical: boolean;
  parity: FlagParity;
  /** Raw process.env value, or null if unset. */
  raw: string | null;
  /** True when raw is exactly "true" or "1". */
  truthy: boolean;
  defaultWhenUnset: DefaultWhenUnset;
  deploy: FeatureFlagCatalogEntry["deploy"];
  /**
   * Whether this process's truthy state matches the deploy contract for
   * the current APP_ENV (staging/production). Null when not applicable
   * (development, conditional, or unspecified).
   */
  matchesDeployContract: boolean | null;
}

export interface KeyEnvVar {
  key: string;
  description: string;
  raw: string | null;
  /** Presence-only for secret-like keys; never returns secret values. */
  configured?: boolean;
}

export interface DeployMatrixRow {
  key: string;
  description: string;
  critical: boolean;
  parity: FlagParity;
  staging: DeployExpectation;
  production: DeployExpectation;
  /** True when staging and production expectations are identical. */
  stagingProdMatch: boolean;
  note?: string;
}

export interface FeatureFlagMatrixSnapshot {
  timestamp: string;
  environment: string;
  nodeEnv: string;
  readOnly: true;
  source: {
    effective: "process.env";
    deployContract: "azure-deploy.yml (documented; FlagOps-owned)";
  };
  /** Critical flags whose staging/prod deploy expectations match. */
  criticalParity: {
    matched: string[];
    intentionallyDivergent: string[];
    allCriticalMatchedOrDocumented: boolean;
  };
  deployMatrix: DeployMatrixRow[];
  flags: EffectiveFeatureFlag[];
  /** FEATURE_* present in process.env but not in the catalog. */
  uncatalogued: Array<{ key: string; raw: string }>;
  keyEnv: KeyEnvVar[];
}
