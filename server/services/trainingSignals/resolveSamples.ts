/**
 * Resolve audit finding ids → job sheet ids for Exceptions deep links.
 */

export async function resolveJobSheetsForFindings(
  deps: {
    getFinding: (
      id: number
    ) => Promise<{ auditResultId: number } | undefined>;
    getAuditResult: (
      id: number
    ) => Promise<{ jobSheetId: number } | undefined>;
  },
  findingIds: number[]
): Promise<Array<{ findingId: number; jobSheetId: number }>> {
  const out: Array<{ findingId: number; jobSheetId: number }> = [];
  const seenSheets = new Set<number>();

  for (const findingId of findingIds) {
    const finding = await deps.getFinding(findingId);
    if (!finding) continue;
    const audit = await deps.getAuditResult(finding.auditResultId);
    if (!audit) continue;
    if (seenSheets.has(audit.jobSheetId)) continue;
    seenSheets.add(audit.jobSheetId);
    out.push({ findingId, jobSheetId: audit.jobSheetId });
  }

  return out;
}
