/**
 * API/model quota guard types (Phase 3.x)
 */

export interface QuotaWindow {
  used: number;
  limit: number;
  unit: string;
}

export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  reason: string;
}
