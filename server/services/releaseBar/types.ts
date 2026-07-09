/**
 * Release bar types (Phase 3.6)
 *
 * Smoke checklist and quarantine exit criteria — pure evaluators, no wiring yet.
 */

export interface SmokeCheck {
  id: string;
  name: string;
  required: boolean;
  passed?: boolean;
}

export interface QuarantineCriteria {
  maxOpenSev1: number;
  maxFailingSmoke: number;
  requireE2E: boolean;
}

export interface ReleaseBarResult {
  ready: boolean;
  blockers: string[];
  checks: SmokeCheck[];
}
