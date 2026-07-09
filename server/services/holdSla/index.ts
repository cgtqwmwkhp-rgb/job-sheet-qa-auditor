export type { HoldItem, SlaStatus } from "./types";
export { DEFAULT_SLA_BY_SEVERITY, evaluateHoldSla } from "./clock";

export function isHoldSlaEnabled(): boolean {
  return process.env.FEATURE_HOLD_SLA === "true";
}
