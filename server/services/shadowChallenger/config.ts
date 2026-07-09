/**
 * Shadow / champion-challenger config (PR-21)
 *
 * Feature flags (default OFF for safe rollout):
 * - FEATURE_SHADOW_CHALLENGER=true → enable shadow or canary
 * - SHADOW_MODE=shadow|canary|off (default shadow when flag on)
 * - SHADOW_CANARY_PERCENT=0–100 (default 0; only used in canary mode)
 * - SHADOW_CHALLENGER_STRATEGY=rule_based (default; mocks-only overnight)
 */

import type { ChallengerStrategy, ShadowMode } from "./types";

export const FEATURE_FLAG = "FEATURE_SHADOW_CHALLENGER";

export interface ShadowChallengerConfig {
  enabled: boolean;
  mode: ShadowMode;
  /** 0–100; fraction of traffic that serves challenger when mode=canary */
  canaryPercent: number;
  strategy: ChallengerStrategy;
}

export const DEFAULT_SHADOW_CONFIG: ShadowChallengerConfig = {
  enabled: false,
  mode: "off",
  canaryPercent: 0,
  strategy: "rule_based",
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
  return "rule_based";
}

/**
 * Default: disabled when FEATURE_SHADOW_CHALLENGER unset.
 * Set FEATURE_SHADOW_CHALLENGER=true to enable.
 */
export function isShadowChallengerEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export function getShadowChallengerConfig(): ShadowChallengerConfig {
  if (!isShadowChallengerEnabled()) {
    return { ...DEFAULT_SHADOW_CONFIG };
  }

  const mode = parseMode(process.env.SHADOW_MODE);
  if (mode === "off") {
    return {
      enabled: false,
      mode: "off",
      canaryPercent: 0,
      strategy: parseStrategy(process.env.SHADOW_CHALLENGER_STRATEGY),
    };
  }

  return {
    enabled: true,
    mode,
    canaryPercent: parseCanaryPercent(process.env.SHADOW_CANARY_PERCENT),
    strategy: parseStrategy(process.env.SHADOW_CHALLENGER_STRATEGY),
  };
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
