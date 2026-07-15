/**
 * Shadow / champion-challenger config (PR-21 / PR-AI-11)
 *
 * Feature flags (default OFF for safe rollout):
 * - FEATURE_SHADOW_CHALLENGER=true → enable shadow or canary
 * - FEATURE_SHADOW_REAL_MODEL=true → use real alternate model adapter
 * - SHADOW_MODE=shadow|canary|off (default shadow when flag on)
 * - SHADOW_CANARY_PERCENT=0–100 (default 0; only used in canary mode)
 * - SHADOW_REAL_MODEL_ID=gemini-2.0-flash (alternate model id)
 * - SHADOW_MEASUREMENT_MIN_SAMPLES=30 (pp-delta readiness threshold)
 *
 * FlagOps measurement path (advisory only — do NOT edit azure-deploy from
 * this lane; set on Container App / env):
 *   FEATURE_SHADOW_CHALLENGER=true
 *   SHADOW_MODE=shadow
 *   SHADOW_CANARY_PERCENT=0
 * Optional Gemini Flash challenger:
 *   FEATURE_SHADOW_REAL_MODEL=true
 *   SHADOW_REAL_MODEL_ID=gemini-2.0-flash
 *   (requires GEMINI_API_KEY; unavailable model means no challenger run)
 */

import type { ChallengerStrategy, ShadowMode } from "./types";

export const FEATURE_FLAG = "FEATURE_SHADOW_CHALLENGER";
export const REAL_MODEL_FEATURE_FLAG = "FEATURE_SHADOW_REAL_MODEL";
export const DEFAULT_SHADOW_REAL_MODEL_ID = "gemini-2.0-flash";

/** Env values FlagOps should set for advisory pp-delta measurement. */
export const FLAGOPS_SHADOW_MEASUREMENT_ENV = {
  FEATURE_SHADOW_CHALLENGER: "true",
  SHADOW_MODE: "shadow",
  SHADOW_CANARY_PERCENT: "0",
} as const;

export interface ShadowChallengerConfig {
  enabled: boolean;
  mode: ShadowMode;
  /** 0–100; fraction of traffic that serves challenger when mode=canary */
  canaryPercent: number;
  strategy: ChallengerStrategy;
  realModelEnabled: boolean;
  realModelId: string;
}

export const DEFAULT_SHADOW_CONFIG: ShadowChallengerConfig = {
  enabled: false,
  mode: "off",
  canaryPercent: 0,
  strategy: "rule_based",
  realModelEnabled: false,
  realModelId: DEFAULT_SHADOW_REAL_MODEL_ID,
};

function parseMode(raw: string | undefined): ShadowMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "shadow" || v === "canary" || v === "off") return v;
  return "shadow";
}

function parseCanaryPercent(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseStrategy(raw: string | undefined): ChallengerStrategy {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "rule_based") return "rule_based";
  if (v === "real_model") return "real_model";
  return "rule_based";
}

function parseRealModelId(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  return v.length > 0 ? v : DEFAULT_SHADOW_REAL_MODEL_ID;
}

/**
 * Default: disabled when FEATURE_SHADOW_CHALLENGER unset.
 * Set FEATURE_SHADOW_CHALLENGER=true to enable.
 */
export function isShadowChallengerEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export function isShadowRealModelEnabled(): boolean {
  return process.env[REAL_MODEL_FEATURE_FLAG] === "true";
}

export function getShadowChallengerConfig(): ShadowChallengerConfig {
  if (!isShadowChallengerEnabled()) {
    return { ...DEFAULT_SHADOW_CONFIG };
  }

  const mode = parseMode(process.env.SHADOW_MODE);
  const realModelEnabled = isShadowRealModelEnabled();
  const strategy: ChallengerStrategy = realModelEnabled
    ? "real_model"
    : parseStrategy(process.env.SHADOW_CHALLENGER_STRATEGY);
  const realModelId = parseRealModelId(process.env.SHADOW_REAL_MODEL_ID);

  // Rule-based analysis unconditionally PASSes any sufficiently long document.
  // It may be useful as a local fallback, but it is not a valid challenger:
  // enabling it would create an always-PASS theater measurement and could
  // accidentally serve PASS if a caller bypassed the canary guard.
  if (mode === "off" || strategy === "rule_based") {
    return {
      enabled: false,
      mode: "off",
      canaryPercent: 0,
      strategy,
      realModelEnabled,
      realModelId,
    };
  }

  return {
    enabled: true,
    mode,
    canaryPercent: parseCanaryPercent(process.env.SHADOW_CANARY_PERCENT),
    strategy,
    realModelEnabled,
    realModelId,
  };
}

/**
 * True when enabled in shadow (compare-only) mode — never serves challenger.
 * This is the safe path for measuring pp deltas before canary.
 */
export function isShadowAdvisoryMode(config?: ShadowChallengerConfig): boolean {
  const cfg = config ?? getShadowChallengerConfig();
  return cfg.enabled && cfg.mode === "shadow";
}

/**
 * Deterministic canary sample from a stable key (jobSheetId / runId).
 * Same key always yields the same decision for a given percent.
 */
export function shouldApplyCanary(
  sampleKey: string | number,
  canaryPercent: number
): boolean {
  if (canaryPercent <= 0) return false;
  if (canaryPercent >= 100) return true;
  const hash = hashString(String(sampleKey));
  return hash % 100 < canaryPercent;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}
