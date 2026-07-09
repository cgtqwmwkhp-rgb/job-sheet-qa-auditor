/**
 * Predictive Risk Analytics — pure aggregation (PR-19)
 *
 * Leading indicators (minor-issue mix, dispute rate, ambiguity trend,
 * issue rate, critical density) → risk scores → attention queue + fix packs.
 * Fixtures/mocks only in contract tests — no live OCR/LLM.
 */

import {
  generateFixPack,
  type EngineerProfile,
  type IssueOccurrence,
  type IssueType,
  type FixPack,
} from "../engineerAnalytics";
import {
  mapReasonCodeToIssueType,
  mapResolutionStatus,
  type DbReasonCode,
  type DbResolutionStatus,
  type DbSeverity,
} from "../engineerAnalytics/mapFindings";
import {
  DEFAULT_RISK_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
  type AttentionQueueItem,
  type LeadingIndicators,
  type PredictiveAlertPrediction,
  type PredictiveDisputeRow,
  type PredictiveDocumentRow,
  type PredictiveFindingRow,
  type PredictiveRiskSummary,
  type PredictiveRiskThresholds,
  type PredictiveUserRow,
  type RiskBand,
  type RiskEntityType,
  type RiskScoreBreakdown,
} from "./types";

const UNKNOWN = "Unknown";

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function resolvePredictivePeriod(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const fallback = defaultPeriod();
  return {
    start: startDate ? new Date(startDate).toISOString() : fallback.start,
    end: endDate ? new Date(endDate).toISOString() : fallback.end,
  };
}

function inPeriod(value: Date | string, start: string, end: string): boolean {
  const t = new Date(value).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

function normalizeKey(
  value: string | number | null | undefined,
  fallback: string = UNKNOWN
): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isAmbiguousResult(result: PredictiveDocumentRow["result"]): boolean {
  return result === "review_queue";
}

function isIssueResult(result: PredictiveDocumentRow["result"]): boolean {
  return result === "fail" || result === "review_queue";
}

function isMinorSeverity(severity: string): boolean {
  return severity === "S2" || severity === "S3";
}

function isCriticalSeverity(severity: string): boolean {
  return severity === "S0" || severity === "S1";
}

export function riskBandFromScore(
  score: number,
  thresholds: PredictiveRiskThresholds = DEFAULT_RISK_THRESHOLDS
): RiskBand {
  if (score >= thresholds.criticalAt) return "critical";
  if (score >= thresholds.highAt) return "high";
  if (score >= thresholds.mediumAt) return "medium";
  return "low";
}

/**
 * Score leading indicators into a 0–100 composite risk score.
 */
export function scoreLeadingIndicators(
  indicators: LeadingIndicators,
  weights: typeof DEFAULT_RISK_WEIGHTS = DEFAULT_RISK_WEIGHTS
): RiskScoreBreakdown {
  const riskScore = clamp100(
    indicators.minorIssueMix * weights.minorIssueMix +
      indicators.disputeRate * weights.disputeRate +
      indicators.ambiguityTrend * weights.ambiguityTrend +
      indicators.issueRate * weights.issueRate +
      indicators.criticalDensity * weights.criticalDensity
  );
  return {
    indicators,
    weights: { ...weights },
    riskScore,
    band: riskBandFromScore(riskScore),
  };
}

function midPoint(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return new Date(start + (end - start) / 2).toISOString();
}

function entityKeyForDoc(
  doc: PredictiveDocumentRow,
  entityType: RiskEntityType
): string {
  if (entityType === "engineer") return normalizeKey(doc.technicianId);
  if (entityType === "asset") return normalizeKey(doc.assetType);
  return normalizeKey(doc.templateSlug);
}

function entityLabel(
  entityType: RiskEntityType,
  key: string,
  users: PredictiveUserRow[]
): string {
  if (entityType === "engineer") {
    if (key === UNKNOWN) return "Unknown engineer";
    const user = users.find(u => String(u.id) === key);
    return user?.name?.trim() || user?.email || `Engineer ${key}`;
  }
  if (entityType === "asset") {
    return key === UNKNOWN ? "Unknown asset" : key;
  }
  return key === UNKNOWN ? "Unknown template" : key;
}

function findingMatchesEntity(
  finding: PredictiveFindingRow,
  docsById: Map<number, PredictiveDocumentRow>,
  entityType: RiskEntityType,
  key: string
): boolean {
  if (entityType === "engineer") {
    return normalizeKey(finding.technicianId) === key;
  }
  const doc = docsById.get(finding.jobSheetId);
  if (!doc) return false;
  return entityKeyForDoc(doc, entityType) === key;
}

/**
 * Compute leading-indicator scores for one entity over the period.
 */
export function computeEntityIndicators(input: {
  documents: PredictiveDocumentRow[];
  findings: PredictiveFindingRow[];
  disputes: PredictiveDisputeRow[];
  entityType: RiskEntityType;
  entityKey: string;
  startDate: string;
  endDate: string;
}): LeadingIndicators & {
  documentCount: number;
  findingCount: number;
  disputeCount: number;
} {
  const mid = midPoint(input.startDate, input.endDate);
  const docsById = new Map(
    input.documents.map(d => [d.jobSheetId, d] as const)
  );

  const entityDocs = input.documents.filter(
    d =>
      inPeriod(d.processedAt, input.startDate, input.endDate) &&
      entityKeyForDoc(d, input.entityType) === input.entityKey
  );

  const entityFindings = input.findings.filter(
    f =>
      inPeriod(f.occurredAt, input.startDate, input.endDate) &&
      findingMatchesEntity(f, docsById, input.entityType, input.entityKey)
  );

  const findingIds = new Set(entityFindings.map(f => f.findingId));
  const entityDisputes = input.disputes.filter(
    d =>
      inPeriod(d.createdAt, input.startDate, input.endDate) &&
      (findingIds.has(d.auditFindingId) ||
        (input.entityType === "engineer" &&
          normalizeKey(d.raisedBy) === input.entityKey))
  );

  const documentCount = entityDocs.length;
  const findingCount = entityFindings.length;
  const disputeCount = entityDisputes.length;

  // Minor-issue mix: share of findings that are S2/S3 (leading soft-fail signal)
  const minorCount = entityFindings.filter(f =>
    isMinorSeverity(f.severity)
  ).length;
  const minorIssueMix =
    findingCount > 0 ? clamp100((minorCount / findingCount) * 100) : 0;

  // Dispute rate: disputes / findings, scaled (0.5 → 100)
  const rawDisputeRate =
    findingCount > 0 ? disputeCount / findingCount : disputeCount > 0 ? 1 : 0;
  const disputeRate = clamp100(rawDisputeRate * 200);

  // Ambiguity trend: recent half review_queue rate vs prior half
  const priorDocs = entityDocs.filter(
    d => new Date(d.processedAt).getTime() < new Date(mid).getTime()
  );
  const recentDocs = entityDocs.filter(
    d => new Date(d.processedAt).getTime() >= new Date(mid).getTime()
  );
  const priorAmb =
    priorDocs.length > 0
      ? priorDocs.filter(d => isAmbiguousResult(d.result)).length /
        priorDocs.length
      : 0;
  const recentAmb =
    recentDocs.length > 0
      ? recentDocs.filter(d => isAmbiguousResult(d.result)).length /
        recentDocs.length
      : 0;
  // Delta scaled: +0.5 absolute increase → 100
  const ambDelta = recentAmb - priorAmb;
  const ambiguityTrend = clamp100(50 + ambDelta * 100);

  // Issue rate on documents
  const issueDocs = entityDocs.filter(d => isIssueResult(d.result)).length;
  const issueRate =
    documentCount > 0 ? clamp100((issueDocs / documentCount) * 100) : 0;

  // Critical density: S0/S1 per document, scaled (0.5 → 100)
  const criticalFindings = entityFindings.filter(f =>
    isCriticalSeverity(f.severity)
  ).length;
  const criticalDensity =
    documentCount > 0 ? clamp100((criticalFindings / documentCount) * 200) : 0;

  return {
    minorIssueMix,
    disputeRate,
    ambiguityTrend,
    issueRate,
    criticalDensity,
    documentCount,
    findingCount,
    disputeCount,
  };
}

function buildDrivers(indicators: LeadingIndicators): string[] {
  const drivers: Array<{ key: string; label: string; value: number }> = [
    {
      key: "ambiguityTrend",
      label: "Rising review-queue / ambiguity trend",
      value: indicators.ambiguityTrend,
    },
    {
      key: "disputeRate",
      label: "Elevated dispute rate",
      value: indicators.disputeRate,
    },
    {
      key: "minorIssueMix",
      label: "High minor-issue mix (S2/S3)",
      value: indicators.minorIssueMix,
    },
    {
      key: "issueRate",
      label: "Elevated document issue rate",
      value: indicators.issueRate,
    },
    {
      key: "criticalDensity",
      label: "Critical finding density",
      value: indicators.criticalDensity,
    },
  ];
  return drivers
    .filter(d => d.value >= 40)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(d => d.label);
}

function suggestedAction(
  entityType: RiskEntityType,
  band: RiskBand,
  hasFixPack: boolean
): string {
  if (band === "critical" || band === "high") {
    if (entityType === "engineer" && hasFixPack) {
      return "Assign fix pack and schedule coaching this week";
    }
    if (entityType === "template") {
      return "Review template selection tokens and ambiguity governance";
    }
    if (entityType === "asset") {
      return "Inspect asset cohort for recurring defects and site coaching";
    }
    return "Prioritise for QA attention and root-cause review";
  }
  if (hasFixPack) return "Share fix pack focus areas with the technician";
  return "Monitor leading indicators over the next period";
}

function toIssueOccurrence(finding: PredictiveFindingRow): IssueOccurrence {
  const resolutionStatus = mapResolutionStatus(
    finding.resolutionStatus as DbResolutionStatus
  );
  return {
    id: `finding-${finding.findingId}`,
    engineerId: normalizeKey(finding.technicianId, "0"),
    documentId: String(finding.jobSheetId),
    issueType: mapReasonCodeToIssueType(
      finding.reasonCode as DbReasonCode,
      finding.fieldName
    ) as IssueType,
    severity: finding.severity as DbSeverity,
    fieldName: finding.fieldName,
    reasonCode: finding.reasonCode,
    occurredAt: toIso(finding.occurredAt),
    wasDisputed: false,
    wasWaived: resolutionStatus === "waived",
    resolutionStatus,
  };
}

function buildEngineerFixPack(
  entityKey: string,
  label: string,
  findings: PredictiveFindingRow[],
  startDate: string,
  endDate: string
): FixPack | null {
  const periodFindings = findings.filter(
    f =>
      normalizeKey(f.technicianId) === entityKey &&
      inPeriod(f.occurredAt, startDate, endDate)
  );
  if (periodFindings.length === 0) return null;

  const issues = periodFindings.map(toIssueOccurrence);
  const profile: EngineerProfile = {
    id: entityKey,
    name: label,
    employeeId: entityKey,
    startDate: startDate.slice(0, 10),
    isActive: true,
  };
  return generateFixPack(profile, issues);
}

function predictFailureDate(riskScore: number, asOf: Date): string {
  // Higher risk → sooner predicted attention date (7–45 days)
  const days = Math.max(7, Math.round(45 - (riskScore / 100) * 38));
  const d = new Date(asOf.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function toPrediction(
  item: AttentionQueueItem,
  asOf: Date
): PredictiveAlertPrediction {
  const topDriver = item.drivers[0] ?? "Elevated leading-indicator risk";
  return {
    assetId: `${item.entityType}:${item.entityKey}`,
    riskScore: item.riskScore,
    predictedFailureDate: predictFailureDate(item.riskScore, asOf),
    reason: `${item.label} — ${topDriver}`,
    confidence: clamp100(55 + item.riskScore * 0.35),
  };
}

/**
 * Build the full predictive risk summary: attention queue, predictions, fix packs.
 */
export function buildPredictiveRiskSummary(input: {
  documents: PredictiveDocumentRow[];
  findings: PredictiveFindingRow[];
  disputes?: PredictiveDisputeRow[];
  users?: PredictiveUserRow[];
  startDate: string;
  endDate: string;
  thresholds?: PredictiveRiskThresholds;
  entityTypes?: RiskEntityType[];
}): PredictiveRiskSummary {
  const thresholds = input.thresholds ?? DEFAULT_RISK_THRESHOLDS;
  const disputes = input.disputes ?? [];
  const users = input.users ?? [];
  const entityTypes: RiskEntityType[] = input.entityTypes ?? [
    "engineer",
    "asset",
    "template",
  ];
  const asOfDate = new Date();
  const asOf = asOfDate.toISOString();

  const periodDocs = input.documents.filter(d =>
    inPeriod(d.processedAt, input.startDate, input.endDate)
  );

  const queue: AttentionQueueItem[] = [];
  const allScored: number[] = [];

  for (const entityType of entityTypes) {
    const keys = new Set<string>();
    for (const doc of periodDocs) {
      keys.add(entityKeyForDoc(doc, entityType));
    }

    for (const key of Array.from(keys)) {
      if (key === UNKNOWN && entityType !== "engineer") continue;

      const indicators = computeEntityIndicators({
        documents: input.documents,
        findings: input.findings,
        disputes,
        entityType,
        entityKey: key,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      if (indicators.documentCount < thresholds.minDocuments) continue;

      const scored = scoreLeadingIndicators({
        minorIssueMix: indicators.minorIssueMix,
        disputeRate: indicators.disputeRate,
        ambiguityTrend: indicators.ambiguityTrend,
        issueRate: indicators.issueRate,
        criticalDensity: indicators.criticalDensity,
      });
      allScored.push(scored.riskScore);

      if (scored.riskScore < thresholds.attentionScore) continue;

      const label = entityLabel(entityType, key, users);
      let fixPack: FixPack | null = null;
      if (entityType === "engineer") {
        fixPack = buildEngineerFixPack(
          key,
          label,
          input.findings,
          input.startDate,
          input.endDate
        );
      }

      const drivers = buildDrivers(scored.indicators);
      queue.push({
        id: `risk-${entityType}-${key}`,
        entityType,
        entityKey: key,
        label,
        riskScore: scored.riskScore,
        band: scored.band,
        indicators: scored.indicators,
        drivers,
        documentCount: indicators.documentCount,
        findingCount: indicators.findingCount,
        disputeCount: indicators.disputeCount,
        fixPack,
        suggestedAction: suggestedAction(
          entityType,
          scored.band,
          fixPack != null && fixPack.summary.totalIssues > 0
        ),
      });
    }
  }

  queue.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return a.label.localeCompare(b.label);
  });

  const fixPacks = queue
    .map(q => q.fixPack)
    .filter((fp): fp is FixPack => fp != null && fp.summary.totalIssues > 0);

  const predictions = queue.slice(0, 12).map(q => toPrediction(q, asOfDate));

  const criticalCount = queue.filter(q => q.band === "critical").length;
  const highCount = queue.filter(q => q.band === "high").length;
  const avgRiskScore =
    allScored.length > 0
      ? clamp100(allScored.reduce((s, n) => s + n, 0) / allScored.length)
      : 0;

  return {
    period: { start: input.startDate, end: input.endDate },
    asOf,
    attentionQueue: queue,
    predictions,
    fixPacks,
    summary: {
      entitiesScored: allScored.length,
      needingAttention: queue.length,
      criticalCount,
      highCount,
      fixPackCount: fixPacks.length,
      avgRiskScore,
    },
  };
}
