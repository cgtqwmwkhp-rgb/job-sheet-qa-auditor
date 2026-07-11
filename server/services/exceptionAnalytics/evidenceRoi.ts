/**
 * Evidence ROI analytics — comment quality + photo fail rates by engineer / rule.
 * Surfaces money-saving signal: cards blocked for thin diagnosis / incomplete photo proof.
 */

import type { OverturnFindingRow } from "./types";
import { resolveExceptionPeriod } from "./aggregate";

const EVIDENCE_PREFIXES = ["COMMENT-C", "PHOTO-C", "EVIDENCE-C"] as const;

export interface EvidenceRuleFailMetrics {
  ruleId: string;
  totalFindings: number;
  majorCount: number;
  minorCount: number;
  overturnedCount: number;
  overturnRate: number | null;
}

export interface EngineerEvidenceMetrics {
  engineerKey: string;
  commentFailCount: number;
  photoFailCount: number;
  coherenceFailCount: number;
  totalEvidenceFindings: number;
}

export interface EvidenceRoiSummary {
  period: { start: string; end: string };
  commentMajorCount: number;
  photoMajorCount: number;
  photoMinorCount: number;
  coherenceMajorCount: number;
  cardsBlockedEstimate: number;
  byRule: EvidenceRuleFailMetrics[];
  byEngineer: EngineerEvidenceMetrics[];
  moneySignal: string;
}

function isEvidenceRule(ruleId: string | null | undefined): boolean {
  if (!ruleId) return false;
  return EVIDENCE_PREFIXES.some(p => ruleId.startsWith(p));
}

function isMajorSeverity(severity: string): boolean {
  return (
    severity === "S0" ||
    severity === "S1" ||
    severity === "critical" ||
    severity === "major"
  );
}

function isMinorSeverity(severity: string): boolean {
  return severity === "S2" || severity === "minor" || severity === "warning";
}

/**
 * Aggregate COMMENT/PHOTO/EVIDENCE findings into an ROI dashboard summary.
 */
export function buildEvidenceRoiAnalytics(input: {
  findings: OverturnFindingRow[];
  startDate?: string;
  endDate?: string;
  /** Optional engineer attribution keyed by findingId */
  engineerByFindingId?: Record<number, string>;
}): EvidenceRoiSummary {
  const period = resolveExceptionPeriod(input.startDate, input.endDate);
  const inWindow = input.findings.filter(f => {
    const t = new Date(f.occurredAt).getTime();
    return (
      t >= new Date(period.start).getTime() &&
      t <= new Date(period.end).getTime() &&
      isEvidenceRule(f.ruleId)
    );
  });

  let commentMajorCount = 0;
  let photoMajorCount = 0;
  let photoMinorCount = 0;
  let coherenceMajorCount = 0;

  const byRuleMap = new Map<
    string,
    {
      total: number;
      major: number;
      minor: number;
      overturned: number;
      resolved: number;
    }
  >();

  const byEngineerMap = new Map<string, EngineerEvidenceMetrics>();

  for (const f of inWindow) {
    const ruleId = f.ruleId!.trim();
    let entry = byRuleMap.get(ruleId);
    if (!entry) {
      entry = { total: 0, major: 0, minor: 0, overturned: 0, resolved: 0 };
      byRuleMap.set(ruleId, entry);
    }
    entry.total++;
    if (isMajorSeverity(f.severity)) entry.major++;
    if (isMinorSeverity(f.severity)) entry.minor++;
    if (f.resolutionStatus === "overridden") entry.overturned++;
    if (
      f.resolutionStatus === "overridden" ||
      f.resolutionStatus === "waived" ||
      f.resolutionStatus === "approved"
    ) {
      entry.resolved++;
    }

    if (ruleId.startsWith("COMMENT-C") && isMajorSeverity(f.severity)) {
      commentMajorCount++;
    }
    if (ruleId.startsWith("PHOTO-C") && isMajorSeverity(f.severity)) {
      photoMajorCount++;
    }
    if (ruleId.startsWith("PHOTO-C") && isMinorSeverity(f.severity)) {
      photoMinorCount++;
    }
    if (ruleId.startsWith("EVIDENCE-C") && isMajorSeverity(f.severity)) {
      coherenceMajorCount++;
    }

    const eng =
      input.engineerByFindingId?.[f.findingId] ??
      (f.technicianId != null
        ? String(f.technicianId)
        : f.siteInfo
          ? `site:${f.siteInfo}`
          : `sheet:${f.jobSheetId}`);
    let engEntry = byEngineerMap.get(eng);
    if (!engEntry) {
      engEntry = {
        engineerKey: eng,
        commentFailCount: 0,
        photoFailCount: 0,
        coherenceFailCount: 0,
        totalEvidenceFindings: 0,
      };
      byEngineerMap.set(eng, engEntry);
    }
    engEntry.totalEvidenceFindings++;
    if (ruleId.startsWith("COMMENT-C")) engEntry.commentFailCount++;
    if (ruleId.startsWith("PHOTO-C")) engEntry.photoFailCount++;
    if (ruleId.startsWith("EVIDENCE-C")) engEntry.coherenceFailCount++;
  }

  const byRule: EvidenceRuleFailMetrics[] = Array.from(byRuleMap.entries())
    .map(([ruleId, e]) => ({
      ruleId,
      totalFindings: e.total,
      majorCount: e.major,
      minorCount: e.minor,
      overturnedCount: e.overturned,
      overturnRate: e.resolved > 0 ? e.overturned / e.resolved : null,
    }))
    .sort((a, b) => b.totalFindings - a.totalFindings);

  const byEngineer = Array.from(byEngineerMap.values()).sort(
    (a, b) => b.totalEvidenceFindings - a.totalEvidenceFindings
  );

  const cardsBlockedEstimate =
    commentMajorCount + photoMajorCount + coherenceMajorCount;

  return {
    period,
    commentMajorCount,
    photoMajorCount,
    photoMinorCount,
    coherenceMajorCount,
    cardsBlockedEstimate,
    byRule,
    byEngineer,
    moneySignal: `${cardsBlockedEstimate} card(s) blocked this period for thin diagnosis / incomplete photo proof / narrative↔photo contradiction.`,
  };
}
