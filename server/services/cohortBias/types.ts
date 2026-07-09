/**
 * Cohort bias monitoring types (Phase 3.2)
 *
 * Tracks shadow champion/challenger disagreements by cohort (e.g. engineer,
 * asset type, site) to surface systematic bias in alternate-model comparisons.
 */

/** One shadow comparison sample tagged with a cohort dimension. */
export interface DisagreementSample {
  /** Cohort dimension key, e.g. "engineer:alice" or "asset:generator". */
  cohortKey: string;
  championLabel: string;
  challengerLabel: string;
  /** When known: human review overturned the champion on this disagreement. */
  overturned?: boolean;
}

/** Aggregated bias stats for a single cohort. */
export interface CohortBiasStat {
  cohortKey: string;
  /** Count of samples where champion and challenger labels differ. */
  disagreements: number;
  /** Share of samples where labels agree (0–1). */
  agreementRate: number;
  /** Share of disagreements overturned in favor of challenger (0–1). */
  overturnRate: number;
}
