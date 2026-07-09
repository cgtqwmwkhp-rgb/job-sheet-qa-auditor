export type HoldItem = {
  id: string;
  openedAt: string | Date;
  severity?: string;
};

export type SlaStatus = {
  id: string;
  ageMs: number;
  breached: boolean;
  deadlineMs: number;
};
