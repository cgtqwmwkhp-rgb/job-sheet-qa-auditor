/**
 * Promotion readiness score types (Phase 3.x)
 *
 * Pure signal inputs and score output — no processor wiring yet.
 */

export interface PromotionSignals {
  ece?: number;
  overturnRate?: number;
  shadowAgreementRate?: number;
  smokePassRate?: number;
}

export interface PromotionScore {
  score: number;
  ready: boolean;
  reasons: string[];
}
