/**
 * Risk-based routing module (Phase 3.1)
 *
 * Feature flag (default OFF):
 * - FEATURE_RISK_ROUTING=true → enable routing in downstream wiring
 *
 * Not yet wired into documentProcessor — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_RISK_ROUTING";

export function isRiskRoutingEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { routeByRisk, isCriticalFinding } from "./riskRouter";
