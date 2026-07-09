/**
 * Pure cohort bias statistics (Phase 3.2)
 *
 * Groups shadow comparison samples by cohortKey and computes agreement /
 * overturn rates for bias monitoring dashboards.
 */

import type { CohortBiasStat, DisagreementSample } from "./types";

function isDisagreement(sample: DisagreementSample): boolean {
  return sample.championLabel !== sample.challengerLabel;
}

/**
 * Compute per-cohort bias stats from shadow disagreement samples.
 *
 * - disagreements: championLabel !== challengerLabel
 * - agreementRate: agreeing samples / total samples in cohort
 * - overturnRate: overturned disagreements / disagreements in cohort
 */
export function computeCohortBias(
  samples: DisagreementSample[]
): CohortBiasStat[] {
  if (samples.length === 0) {
    return [];
  }

  const byCohort = new Map<
    string,
    { total: number; disagreements: number; overturned: number }
  >();

  for (const sample of samples) {
    const entry = byCohort.get(sample.cohortKey) ?? {
      total: 0,
      disagreements: 0,
      overturned: 0,
    };

    entry.total++;

    if (isDisagreement(sample)) {
      entry.disagreements++;
      if (sample.overturned === true) {
        entry.overturned++;
      }
    }

    byCohort.set(sample.cohortKey, entry);
  }

  return Array.from(byCohort.entries())
    .map(([cohortKey, entry]) => ({
      cohortKey,
      disagreements: entry.disagreements,
      agreementRate:
        entry.total > 0
          ? (entry.total - entry.disagreements) / entry.total
          : 0,
      overturnRate:
        entry.disagreements > 0 ? entry.overturned / entry.disagreements : 0,
    }))
    .sort((a, b) => a.cohortKey.localeCompare(b.cohortKey));
}
