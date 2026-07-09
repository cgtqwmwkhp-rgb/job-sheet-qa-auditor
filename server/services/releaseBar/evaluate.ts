/**
 * Release bar evaluation (Phase 3.6)
 *
 * Pure quarantine exit criteria — no CI, deploy, or network coupling.
 */

import type {
  QuarantineCriteria,
  ReleaseBarResult,
  SmokeCheck,
} from "./types";

export interface EvaluateReleaseBarOptions {
  openSev1?: number;
  e2ePassed?: boolean;
}

export function evaluateReleaseBar(
  checks: SmokeCheck[],
  criteria: QuarantineCriteria,
  opts: EvaluateReleaseBarOptions = {}
): ReleaseBarResult {
  const blockers: string[] = [];
  const openSev1 = opts.openSev1 ?? 0;
  const e2ePassed = opts.e2ePassed ?? false;

  const failingSmoke = checks.filter(check => check.passed === false);

  for (const check of checks) {
    if (check.required && check.passed !== true) {
      blockers.push(`Required smoke check failed: ${check.name} (${check.id})`);
    }
  }

  if (openSev1 > criteria.maxOpenSev1) {
    blockers.push(
      `Open Sev1 incidents (${openSev1}) exceed max (${criteria.maxOpenSev1})`
    );
  }

  if (failingSmoke.length > criteria.maxFailingSmoke) {
    blockers.push(
      `Failing smoke checks (${failingSmoke.length}) exceed max (${criteria.maxFailingSmoke})`
    );
  }

  if (criteria.requireE2E && !e2ePassed) {
    blockers.push("E2E tests have not passed");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    checks,
  };
}
