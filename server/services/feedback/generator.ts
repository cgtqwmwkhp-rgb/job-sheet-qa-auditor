/**
 * Feedback Generator
 *
 * Generates scorecards and fix packs for daily/weekly/monthly cadence.
 */

import type {
  CadencePeriod,
  EngineerScorecard,
  CustomerScorecard,
  AssetTypeScorecard,
  TemplateScorecard,
  FixPack,
  FixPackIssue,
  FeedbackReport,
  CockpitData,
  TrendDataPoint,
  ExportConfig,
} from "./types";
import { DEFAULT_EXPORT_CONFIG } from "./types";
import * as db from "../../db";
import {
  buildEngineerAnalyticsSummary,
  type EngineerDocumentRow,
  type EngineerUserRow,
} from "../engineerAnalytics/aggregateFromDb";
import type { RawFindingRow } from "../engineerAnalytics/mapFindings";

let generatedIdCounter = 0;

export interface FeedbackLiveRows {
  users: EngineerUserRow[];
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
}

export interface FeedbackReportOptions {
  referenceDate?: Date;
  liveRows?: FeedbackLiveRows;
}

/**
 * Generate unique ID
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const counter = (generatedIdCounter++).toString(36).padStart(4, "0");
  return `${prefix}-${timestamp}-${counter}`;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fixtureRatio(seed: string): number {
  return stableHash(seed) / 0xffffffff;
}

function fixtureNumber(seed: string, min: number, max: number): number {
  return min + fixtureRatio(seed) * (max - min);
}

function fixtureInt(seed: string, min: number, max: number): number {
  return min + Math.floor(fixtureRatio(seed) * (max - min + 1));
}

/**
 * Get period boundaries
 */
function getPeriodBoundaries(
  period: CadencePeriod,
  referenceDate?: Date
): { start: string; end: string } {
  const ref = referenceDate || new Date();
  const start = new Date(ref);
  const end = new Date(ref);

  switch (period) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      start.setDate(ref.getDate() - ref.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case "monthly":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(ref.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Determine trend direction
 */
function determineTrend(
  current: number,
  previous: number
): "improving" | "stable" | "declining" {
  const delta = current - previous;
  if (delta > 0.02) return "improving";
  if (delta < -0.02) return "declining";
  return "stable";
}

/**
 * Redact value if PII redaction enabled
 */
function redactValue<T>(value: T, redact: boolean): T | string {
  if (!redact) return value;
  if (typeof value === "string") return "[REDACTED]";
  return value;
}

/**
 * Generate engineer scorecard
 */
export function generateEngineerScorecard(
  engineerId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): EngineerScorecard {
  const { start, end } = getPeriodBoundaries(period);
  const seed = `engineer:${engineerId}:${period}`;

  // Fixture path for CI/local reports; live mode uses DB-backed aggregates below.
  const totalDocuments = fixtureInt(`${seed}:documents`, 50, 199);
  const passRate = fixtureNumber(`${seed}:pass`, 0.8, 0.98);
  const reviewQueueRate = fixtureNumber(`${seed}:review`, 0, 0.05);
  const failRate = Math.max(0, 1 - passRate - reviewQueueRate);

  return {
    scorecardId: generateId("eng-score"),
    period,
    periodStart: start,
    periodEnd: end,
    engineer: {
      id: engineerId,
      name: config.redactPii ? undefined : `Engineer ${engineerId}`,
      redacted: config.redactPii,
    },
    metrics: {
      totalDocuments,
      passRate,
      failRate,
      reviewQueueRate,
      averageProcessingTimeMs: fixtureInt(`${seed}:processing`, 1500, 3499),
      overrideRate: fixtureNumber(`${seed}:override`, 0, 0.15),
    },
    byAssetType: {
      job_sheet: {
        total: Math.floor(totalDocuments * 0.6),
        passed: Math.floor(totalDocuments * 0.6 * passRate),
        failed: Math.floor(totalDocuments * 0.6 * failRate),
        passRate,
      },
      invoice: {
        total: Math.floor(totalDocuments * 0.3),
        passed: Math.floor(totalDocuments * 0.3 * passRate),
        failed: Math.floor(totalDocuments * 0.3 * failRate),
        passRate,
      },
      receipt: {
        total: Math.floor(totalDocuments * 0.1),
        passed: Math.floor(totalDocuments * 0.1 * passRate),
        failed: Math.floor(totalDocuments * 0.1 * failRate),
        passRate,
      },
    },
    byTemplateId: {
      "template-a": {
        total: Math.floor(totalDocuments * 0.4),
        passed: Math.floor(totalDocuments * 0.4 * passRate),
        failed: Math.floor(totalDocuments * 0.4 * failRate),
        passRate,
      },
      "template-b": {
        total: Math.floor(totalDocuments * 0.35),
        passed: Math.floor(totalDocuments * 0.35 * passRate),
        failed: Math.floor(totalDocuments * 0.35 * failRate),
        passRate,
      },
      "template-c": {
        total: Math.floor(totalDocuments * 0.25),
        passed: Math.floor(totalDocuments * 0.25 * passRate),
        failed: Math.floor(totalDocuments * 0.25 * failRate),
        passRate,
      },
    },
    topIssues: [
      {
        reasonCode: "MISSING_FIELD",
        count: Math.floor((1 - passRate) * totalDocuments * 0.4),
        percentage: 40,
      },
      {
        reasonCode: "INVALID_FORMAT",
        count: Math.floor((1 - passRate) * totalDocuments * 0.3),
        percentage: 30,
      },
      {
        reasonCode: "LOW_CONFIDENCE",
        count: Math.floor((1 - passRate) * totalDocuments * 0.2),
        percentage: 20,
      },
    ],
    trend: {
      passRateDelta: fixtureNumber(`${seed}:pass-delta`, -0.05, 0.05),
      volumeDelta: fixtureNumber(`${seed}:volume-delta`, -0.1, 0.1),
      direction: determineTrend(passRate, passRate - 0.02),
    },
  };
}

/**
 * Generate customer scorecard
 */
export function generateCustomerScorecard(
  customerId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): CustomerScorecard {
  const { start, end } = getPeriodBoundaries(period);
  const seed = `customer:${customerId}:${period}`;

  const totalDocuments = fixtureInt(`${seed}:documents`, 100, 599);
  const passRate = fixtureNumber(`${seed}:pass`, 0.85, 0.97);

  return {
    scorecardId: generateId("cust-score"),
    period,
    periodStart: start,
    periodEnd: end,
    customer: {
      id: customerId,
      name: config.redactPii ? undefined : `Customer ${customerId}`,
      redacted: config.redactPii,
    },
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      averageProcessingTimeMs: fixtureInt(`${seed}:processing`, 2000, 4999),
    },
    byAssetType: {
      job_sheet: {
        total: Math.floor(totalDocuments * 0.7),
        passed: Math.floor(totalDocuments * 0.7 * passRate),
        failed: Math.floor(totalDocuments * 0.7 * (1 - passRate)),
        passRate,
      },
      invoice: {
        total: Math.floor(totalDocuments * 0.3),
        passed: Math.floor(totalDocuments * 0.3 * passRate),
        failed: Math.floor(totalDocuments * 0.3 * (1 - passRate)),
        passRate,
      },
    },
    topIssues: [
      {
        reasonCode: "MISSING_FIELD",
        count: Math.floor((1 - passRate) * totalDocuments * 0.5),
        percentage: 50,
      },
      {
        reasonCode: "OUT_OF_POLICY",
        count: Math.floor((1 - passRate) * totalDocuments * 0.3),
        percentage: 30,
      },
    ],
    trend: {
      passRateDelta: fixtureNumber(`${seed}:pass-delta`, -0.04, 0.04),
      volumeDelta: fixtureNumber(`${seed}:volume-delta`, -0.075, 0.075),
      direction: determineTrend(passRate, passRate - 0.01),
    },
  };
}

/**
 * Generate asset type scorecard
 */
export function generateAssetTypeScorecard(
  assetType: string,
  period: CadencePeriod
): AssetTypeScorecard {
  const { start, end } = getPeriodBoundaries(period);
  const seed = `asset:${assetType}:${period}`;

  const totalDocuments = fixtureInt(`${seed}:documents`, 500, 2499);
  const passRate = fixtureNumber(`${seed}:pass`, 0.88, 0.98);

  return {
    scorecardId: generateId("asset-score"),
    period,
    periodStart: start,
    periodEnd: end,
    assetType,
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      averageProcessingTimeMs: fixtureInt(`${seed}:processing`, 1800, 4299),
      averageConfidence: fixtureNumber(`${seed}:confidence`, 0.85, 0.97),
    },
    byTemplateId: {
      "template-a": {
        total: Math.floor(totalDocuments * 0.5),
        passed: Math.floor(totalDocuments * 0.5 * passRate),
        failed: Math.floor(totalDocuments * 0.5 * (1 - passRate)),
        passRate,
      },
      "template-b": {
        total: Math.floor(totalDocuments * 0.3),
        passed: Math.floor(totalDocuments * 0.3 * passRate),
        failed: Math.floor(totalDocuments * 0.3 * (1 - passRate)),
        passRate,
      },
      "template-c": {
        total: Math.floor(totalDocuments * 0.2),
        passed: Math.floor(totalDocuments * 0.2 * passRate),
        failed: Math.floor(totalDocuments * 0.2 * (1 - passRate)),
        passRate,
      },
    },
    topIssues: [
      {
        reasonCode: "MISSING_FIELD",
        count: Math.floor((1 - passRate) * totalDocuments * 0.4),
        percentage: 40,
      },
      {
        reasonCode: "INVALID_FORMAT",
        count: Math.floor((1 - passRate) * totalDocuments * 0.35),
        percentage: 35,
      },
    ],
    trend: {
      passRateDelta: fixtureNumber(`${seed}:pass-delta`, -0.03, 0.03),
      volumeDelta: fixtureNumber(`${seed}:volume-delta`, -0.125, 0.125),
      direction: determineTrend(passRate, passRate),
    },
  };
}

/**
 * Generate template scorecard
 */
export function generateTemplateScorecard(
  templateId: string,
  period: CadencePeriod
): TemplateScorecard {
  const { start, end } = getPeriodBoundaries(period);
  const seed = `template:${templateId}:${period}`;

  const totalDocuments = fixtureInt(`${seed}:documents`, 200, 999);
  const passRate = fixtureNumber(`${seed}:pass`, 0.9, 0.98);

  return {
    scorecardId: generateId("tmpl-score"),
    period,
    periodStart: start,
    periodEnd: end,
    templateId,
    templateName: `Template ${templateId}`,
    metrics: {
      totalDocuments,
      passRate,
      failRate: 1 - passRate,
      selectionAccuracy: fixtureNumber(`${seed}:selection`, 0.92, 0.99),
      averageConfidence: fixtureNumber(`${seed}:confidence`, 0.88, 0.98),
      ambiguityRate: fixtureNumber(`${seed}:ambiguity`, 0, 0.1),
    },
    byField: {
      jobNumber: {
        total: totalDocuments,
        correct: Math.floor(totalDocuments * 0.98),
        incorrect: Math.floor(totalDocuments * 0.02),
        accuracy: 0.98,
      },
      customerName: {
        total: totalDocuments,
        correct: Math.floor(totalDocuments * 0.95),
        incorrect: Math.floor(totalDocuments * 0.05),
        accuracy: 0.95,
      },
      serviceDate: {
        total: totalDocuments,
        correct: Math.floor(totalDocuments * 0.97),
        incorrect: Math.floor(totalDocuments * 0.03),
        accuracy: 0.97,
      },
      totalCost: {
        total: totalDocuments,
        correct: Math.floor(totalDocuments * 0.92),
        incorrect: Math.floor(totalDocuments * 0.08),
        accuracy: 0.92,
      },
    },
    topIssues: [
      {
        reasonCode: "INVALID_FORMAT",
        fieldId: "totalCost",
        count: Math.floor((1 - passRate) * totalDocuments * 0.5),
        percentage: 50,
      },
      {
        reasonCode: "MISSING_FIELD",
        fieldId: "customerName",
        count: Math.floor((1 - passRate) * totalDocuments * 0.3),
        percentage: 30,
      },
    ],
    trend: {
      passRateDelta: fixtureNumber(`${seed}:pass-delta`, -0.025, 0.025),
      volumeDelta: fixtureNumber(`${seed}:volume-delta`, -0.1, 0.1),
      direction: determineTrend(passRate, passRate + 0.01),
    },
  };
}

/**
 * Generate fix pack for a target
 */
export function generateFixPack(
  targetType: "engineer" | "customer" | "assetType" | "templateId",
  targetId: string,
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): FixPack {
  const { start, end } = getPeriodBoundaries(period);
  const seed = `fixpack:${targetType}:${targetId}:${period}`;

  const issueCount = fixtureInt(`${seed}:issues`, 5, 24);
  const issues: FixPackIssue[] = [];

  const reasonCodes = [
    "MISSING_FIELD",
    "INVALID_FORMAT",
    "OUT_OF_POLICY",
    "LOW_CONFIDENCE",
  ];
  const severities: Array<"S0" | "S1" | "S2" | "S3"> = ["S0", "S1", "S2", "S3"];

  for (let i = 0; i < issueCount; i++) {
    const issueSeed = `${seed}:issue:${i}`;
    const reasonCode =
      reasonCodes[fixtureInt(`${issueSeed}:reason`, 0, reasonCodes.length - 1)];
    const severity =
      severities[fixtureInt(`${issueSeed}:severity`, 0, severities.length - 1)];

    issues.push({
      issueId: generateId("issue"),
      documentId: `doc-${1000 + i}`,
      fieldId: ["jobNumber", "customerName", "serviceDate", "totalCost"][
        fixtureInt(`${issueSeed}:field`, 0, 3)
      ],
      reasonCode,
      severity,
      message: `${reasonCode.replace(/_/g, " ").toLowerCase()} detected`,
      context: {
        extractedValue: config.redactPii ? undefined : `value_${i}`,
        expectedPattern: "[A-Z]{2}-[0-9]{4}",
        confidence: fixtureNumber(`${issueSeed}:confidence`, 0.5, 0.9),
        pageNumber: 1,
        redacted: config.redactPii,
      },
      suggestedAction: `Review ${reasonCode.replace(/_/g, " ").toLowerCase()} and update extraction rules`,
      status: "open",
    });
  }

  // Count by severity and reason
  const bySeverity: Record<string, number> = {};
  const byReasonCode: Record<string, number> = {};
  let criticalCount = 0;

  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byReasonCode[issue.reasonCode] = (byReasonCode[issue.reasonCode] || 0) + 1;
    if (issue.severity === "S0" || issue.severity === "S1") {
      criticalCount++;
    }
  }

  return {
    fixPackId: generateId("fixpack"),
    period,
    periodStart: start,
    periodEnd: end,
    target: {
      type: targetType,
      id: targetId,
      name: config.redactPii ? undefined : `${targetType} ${targetId}`,
      redacted: config.redactPii,
    },
    issues,
    summary: {
      totalIssues: issues.length,
      bySeverity,
      byReasonCode,
      estimatedImpact: issues.length * 0.5, // Potential % improvement
    },
    priority:
      criticalCount > 5 ? "critical" : criticalCount > 2 ? "high" : "medium",
  };
}

/**
 * Generate full feedback report
 */
export function generateFeedbackReport(
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): FeedbackReport {
  const { start, end } = getPeriodBoundaries(period);

  // Generate scorecards
  const engineerScorecards = [
    generateEngineerScorecard("eng-001", period, config),
    generateEngineerScorecard("eng-002", period, config),
    generateEngineerScorecard("eng-003", period, config),
  ];

  const customerScorecards = [
    generateCustomerScorecard("cust-001", period, config),
    generateCustomerScorecard("cust-002", period, config),
  ];

  const assetTypeScorecards = [
    generateAssetTypeScorecard("job_sheet", period),
    generateAssetTypeScorecard("invoice", period),
  ];

  const templateScorecards = [
    generateTemplateScorecard("template-a", period),
    generateTemplateScorecard("template-b", period),
    generateTemplateScorecard("template-c", period),
  ];

  // Generate fix packs
  const fixPacks = [
    generateFixPack("engineer", "eng-001", period, config),
    generateFixPack("templateId", "template-a", period, config),
  ];

  // Calculate overall metrics
  const totalDocuments = engineerScorecards.reduce(
    (sum, s) => sum + s.metrics.totalDocuments,
    0
  );
  const avgPassRate =
    engineerScorecards.reduce((sum, s) => sum + s.metrics.passRate, 0) /
    engineerScorecards.length;

  // Count critical issues
  const criticalIssues = fixPacks.reduce((sum, fp) => {
    return (
      sum +
      fp.issues.filter(i => i.severity === "S0" || i.severity === "S1").length
    );
  }, 0);

  return {
    reportId: generateId("report"),
    period,
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date().toISOString(),
    overall: {
      totalDocuments,
      passRate: avgPassRate,
      failRate: 1 - avgPassRate,
      reviewQueueRate: 0.05,
    },
    engineerScorecards,
    customerScorecards,
    assetTypeScorecards,
    templateScorecards,
    fixPacks,
    summary: {
      totalEngineers: engineerScorecards.length,
      totalCustomers: customerScorecards.length,
      totalAssetTypes: assetTypeScorecards.length,
      totalTemplates: templateScorecards.length,
      totalFixPackIssues: fixPacks.reduce(
        (sum, fp) => sum + fp.issues.length,
        0
      ),
      criticalIssues,
    },
  };
}

export function isFeedbackLiveEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.FEATURE_FEEDBACK_LIVE === "true";
}

function priorWindowStart(startIso: string, endIso: string): Date {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const duration = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
  return new Date(startMs - duration);
}

async function loadFeedbackLiveRows(
  startIso: string,
  endIso: string
): Promise<FeedbackLiveRows> {
  const fetchStart = priorWindowStart(startIso, endIso);
  const fetchEnd = new Date(endIso);

  const [users, documents, findings] = await Promise.all([
    db.getAllUsers(),
    db.getEngineerAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
    }),
    db.getEngineerAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
    }),
  ]);

  return {
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      isActive: true,
    })),
    documents,
    findings: findings as RawFindingRow[],
  };
}

function mapLiveEngineerScorecard(
  entry: ReturnType<
    typeof buildEngineerAnalyticsSummary
  >["leaderboard"][number],
  period: CadencePeriod,
  periodStart: string,
  periodEnd: string,
  config: ExportConfig
): EngineerScorecard {
  const passRate =
    entry.documentsProcessed > 0 ? Math.max(0, 1 - entry.issueRate) : 0;
  const failed = entry.documentsWithIssues;
  const passed = Math.max(0, entry.documentsProcessed - failed);
  const topIssues = entry.topIssueType
    ? [
        {
          reasonCode: entry.topIssueType,
          count: entry.totalIssues,
          percentage: entry.totalIssues > 0 ? 100 : 0,
        },
      ]
    : [];

  return {
    scorecardId: `eng-score-live-${entry.engineerId}-${periodStart.slice(0, 10)}`,
    period,
    periodStart,
    periodEnd,
    engineer: {
      id: entry.engineerId,
      name: config.redactPii ? undefined : entry.engineerName,
      redacted: config.redactPii,
    },
    metrics: {
      totalDocuments: entry.documentsProcessed,
      passRate,
      failRate: entry.issueRate,
      reviewQueueRate: 0,
      averageProcessingTimeMs: 0,
      overrideRate: 0,
    },
    byAssetType: {
      all: {
        total: entry.documentsProcessed,
        passed,
        failed,
        passRate,
      },
    },
    byTemplateId: {
      all: {
        total: entry.documentsProcessed,
        passed,
        failed,
        passRate,
      },
    },
    topIssues,
    trend: {
      passRateDelta: 0,
      volumeDelta: 0,
      direction: entry.trend,
    },
  };
}

function mapLiveFixPack(
  entry: ReturnType<
    typeof buildEngineerAnalyticsSummary
  >["leaderboard"][number],
  period: CadencePeriod,
  periodStart: string,
  periodEnd: string,
  config: ExportConfig
): FixPack {
  const severity: FixPackIssue["severity"] =
    entry.criticalIssues > 0 ? "S1" : "S3";
  const reasonCode = entry.topIssueType ?? "OTHER";

  return {
    fixPackId: `fixpack-live-${entry.engineerId}-${periodStart.slice(0, 10)}`,
    period,
    periodStart,
    periodEnd,
    target: {
      type: "engineer",
      id: entry.engineerId,
      name: config.redactPii ? undefined : entry.engineerName,
      redacted: config.redactPii,
    },
    issues: [
      {
        issueId: `issue-live-${entry.engineerId}-${reasonCode}`,
        documentId: "aggregate",
        reasonCode,
        severity,
        message: `${entry.totalIssues} ${reasonCode.toLowerCase().replace(/_/g, " ")} issue(s) in period`,
        context: {
          redacted: config.redactPii,
        },
        suggestedAction: `Review recurring ${reasonCode.toLowerCase().replace(/_/g, " ")} findings for this engineer`,
        status: "open",
      },
    ],
    summary: {
      totalIssues: entry.totalIssues,
      bySeverity: {
        [severity]: entry.totalIssues,
      },
      byReasonCode: {
        [reasonCode]: entry.totalIssues,
      },
      estimatedImpact: entry.issueRate * 100,
    },
    priority:
      entry.criticalIssues > 5
        ? "critical"
        : entry.criticalIssues > 0
          ? "high"
          : "medium",
  };
}

export function generateFeedbackReportFromLiveRows(
  period: CadencePeriod,
  rows: FeedbackLiveRows,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG,
  options: Pick<FeedbackReportOptions, "referenceDate"> = {}
): FeedbackReport {
  const { start, end } = getPeriodBoundaries(period, options.referenceDate);
  const summary = buildEngineerAnalyticsSummary({
    users: rows.users,
    documents: rows.documents,
    findings: rows.findings,
    startDate: start,
    endDate: end,
  });

  const engineerScorecards = summary.leaderboard.map(entry =>
    mapLiveEngineerScorecard(entry, period, start, end, config)
  );
  const fixPacks = summary.leaderboard
    .filter(entry => entry.totalIssues > 0)
    .map(entry => mapLiveFixPack(entry, period, start, end, config));
  const documentsWithIssues = summary.leaderboard.reduce(
    (sum, entry) => sum + entry.documentsWithIssues,
    0
  );
  const passRate =
    summary.totalDocuments > 0
      ? Math.max(0, 1 - documentsWithIssues / summary.totalDocuments)
      : 0;
  const criticalIssues = summary.leaderboard.reduce(
    (sum, entry) => sum + entry.criticalIssues,
    0
  );

  return {
    reportId: `report-live-${period}-${start.slice(0, 10)}`,
    period,
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date().toISOString(),
    overall: {
      totalDocuments: summary.totalDocuments,
      passRate,
      failRate: summary.totalDocuments > 0 ? 1 - passRate : 0,
      reviewQueueRate: 0,
    },
    engineerScorecards,
    customerScorecards: [],
    assetTypeScorecards: [],
    templateScorecards: [],
    fixPacks,
    summary: {
      totalEngineers: summary.engineerCount,
      totalCustomers: 0,
      totalAssetTypes: 0,
      totalTemplates: 0,
      totalFixPackIssues: summary.totalIssues,
      criticalIssues,
    },
  };
}

export async function generateFeedbackReportForCadence(
  period: CadencePeriod,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG,
  options: FeedbackReportOptions = {}
): Promise<FeedbackReport> {
  if (!isFeedbackLiveEnabled()) {
    return generateFeedbackReport(period, config);
  }

  const { start, end } = getPeriodBoundaries(period, options.referenceDate);
  const rows = options.liveRows ?? (await loadFeedbackLiveRows(start, end));
  return generateFeedbackReportFromLiveRows(period, rows, config, options);
}

/**
 * Generate cockpit data for UI
 */
export function generateCockpitData(
  period: CadencePeriod = "weekly"
): CockpitData {
  const { start, end } = getPeriodBoundaries(period);

  // Generate trend data points
  const trends: TrendDataPoint[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(
      date.getDate() -
        i * (period === "daily" ? 1 : period === "weekly" ? 7 : 30)
    );

    trends.push({
      date: date.toISOString().split("T")[0],
      passRate: fixtureNumber(`cockpit:${period}:${i}:pass`, 0.88, 0.96),
      volume: fixtureInt(`cockpit:${period}:${i}:volume`, 100, 299),
      failRate: fixtureNumber(`cockpit:${period}:${i}:fail`, 0.05, 0.13),
    });
  }

  return {
    currentPeriod: {
      period,
      periodStart: start,
      periodEnd: end,
      passRate: trends[trends.length - 1].passRate,
      volume: trends[trends.length - 1].volume,
      criticalIssues: fixtureInt(`cockpit:${period}:critical`, 0, 9),
    },
    trends,
    topIssues: [
      { reasonCode: "MISSING_FIELD", count: 45, trend: "up" },
      { reasonCode: "INVALID_FORMAT", count: 32, trend: "down" },
      { reasonCode: "OUT_OF_POLICY", count: 18, trend: "stable" },
      { reasonCode: "LOW_CONFIDENCE", count: 12, trend: "down" },
    ],
    recentFixPacks: [
      {
        fixPackId: "fp-001",
        target: "Engineer eng-001",
        issueCount: 12,
        priority: "high",
      },
      {
        fixPackId: "fp-002",
        target: "Template template-a",
        issueCount: 8,
        priority: "medium",
      },
    ],
  };
}

/**
 * Export feedback report
 */
export function exportFeedbackReport(
  report: FeedbackReport,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): string {
  if (config.format === "json") {
    return JSON.stringify(report, null, 2);
  }

  if (config.format === "csv") {
    // Simple CSV export of overall metrics
    const rows = [
      "Metric,Value",
      `Total Documents,${report.overall.totalDocuments}`,
      `Pass Rate,${(report.overall.passRate * 100).toFixed(1)}%`,
      `Fail Rate,${(report.overall.failRate * 100).toFixed(1)}%`,
      `Total Fix Pack Issues,${report.summary.totalFixPackIssues}`,
      `Critical Issues,${report.summary.criticalIssues}`,
    ];
    return rows.join("\n");
  }

  // PDF would require a PDF library - return placeholder
  return "[PDF export requires additional library]";
}
