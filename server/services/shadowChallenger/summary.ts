/**
 * Shadow disagreement summary builder (PR-21 / PR-AI-11)
 *
 * Surfaces pass-rate pp deltas so challenger lift can be measured in
 * advisory shadow mode before any canary serve.
 */

import {
  buildDisagreementReport,
  extractShadowComparisonsFromReports,
} from "./compare";
import { getShadowChallengerConfig } from "./config";
import type { ShadowChallengerSummary, ShadowComparison } from "./types";

export function resolveShadowPeriod(input?: {
  startDate?: string;
  endDate?: string;
}): { start: string; end: string } {
  const end = input?.endDate ? new Date(input.endDate) : new Date();
  const start = input?.startDate
    ? new Date(input.startDate)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function buildShadowChallengerSummary(input: {
  reportJsons?: unknown[];
  comparisons?: ShadowComparison[];
  asOf?: string;
}): ShadowChallengerSummary {
  const config = getShadowChallengerConfig();
  const comparisons =
    input.comparisons ??
    extractShadowComparisonsFromReports(input.reportJsons ?? []);
  const report = buildDisagreementReport(comparisons);

  return {
    enabled: config.enabled,
    mode: config.mode,
    canaryPercent: config.canaryPercent,
    strategy: config.strategy,
    realModelEnabled: config.realModelEnabled,
    realModelId: config.realModelId,
    asOf: input.asOf ?? new Date().toISOString(),
    report,
    passRate: report.passRate,
  };
}
