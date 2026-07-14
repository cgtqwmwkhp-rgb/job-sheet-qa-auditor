/**
 * FinOps stage cost rollup module (Phase 3.x) + admin API cost ledger.
 *
 * Pure helpers for aggregating per-stage cost and latency observations.
 * FEATURE_FINOPS gates experimental rollup wiring; the admin cost ledger
 * records LLM usage independently so Settings can always show spend.
 */

export const FEATURE_FLAG = "FEATURE_FINOPS";

export * from "./types";
export { rollupStageCosts } from "./rollup";
export { estimateTokenCostUsd, resolveTokenPricing } from "./pricing";
export { deriveToolId, toolDisplayLabel } from "./toolLabels";
export {
  getUsdToGbpRate,
  clearUsdGbpRateCache,
  convertUsdToDisplay,
  type UsdGbpRate,
} from "./fx";
export {
  recordApiCost,
  clearApiCostLedger,
  getApiCostEventCount,
  summarizeApiCosts,
  hydrateApiCostLedgerFromDb,
  importApiCostEvents,
  exportApiCostEvents,
  isApiCostLedgerHydrated,
  type RecordApiCostInput,
} from "./ledger";

/**
 * Default: disabled when FEATURE_FINOPS unset.
 * Set FEATURE_FINOPS=true to enable experimental stage-rollup wiring.
 */
export function isFinOpsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
