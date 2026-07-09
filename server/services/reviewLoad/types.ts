/**
 * Reviewer load balancer types (Phase 3.x)
 */

export interface ReviewerLoad {
  reviewerId: string;
  openItems: number;
  capacity: number;
}

export interface Assignment {
  jobSheetId: string;
  reviewerId: string;
}
