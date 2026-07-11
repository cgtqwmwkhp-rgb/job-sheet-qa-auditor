/**
 * Read auditPolicyDecision from persisted reportJson.
 */

export function mapHasMajorFailsFromReport(reportJson: unknown): boolean {
  if (!reportJson || typeof reportJson !== "object") return false;
  const decision = (reportJson as Record<string, unknown>).auditPolicyDecision;
  if (!decision || typeof decision !== "object") return false;
  return (decision as { hasMajorFails?: unknown }).hasMajorFails === true;
}
