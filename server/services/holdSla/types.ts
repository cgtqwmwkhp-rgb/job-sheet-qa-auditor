/**
 * Hold-queue SLA clock types (Phase 3.x)
 */

export interface HoldItem {
  id: string;
  openedAt: string | Date;
  severity?: string;
}

export interface SlaStatus {
  id: string;
  ageMs: number;
  breached: boolean;
  deadlineMs: number;
}
