import type { EvalDocumentResult, EvalDocumentSource } from "../eval/types";
import type {
  AmbiguityRateData,
  OverrideSpikeData,
  ScanQualityData,
  TokenCollisionData,
} from "../drift/types";
import {
  buildDriftAnalyticsSummary,
  normalizeConfidence,
  resolveDriftPeriod,
  type DriftDocumentRow,
  type DriftFindingRow,
} from "../../server/services/driftAnalytics";

export interface LiveMetricsPeriod {
  startDate?: string;
  endDate?: string;
}

export interface LiveDriftMetrics {
  ambiguityData: AmbiguityRateData;
  tokenCollisionData: TokenCollisionData;
  overrideData: OverrideSpikeData;
  scanQualityData: ScanQualityData;
  selectionAccuracy: number;
  fieldAccuracy: number;
  fusionDisagreementRate: number;
  pass2Rate: number;
}

interface LiveRows {
  documents: DriftDocumentRow[];
  findings?: DriftFindingRow[];
}

const RESULT_OK = new Set<DriftDocumentRow["result"]>(["pass", "waived"]);
const SEVERITY_ORDER: Array<DriftFindingRow["severity"]> = [
  "S0",
  "S1",
  "S2",
  "S3",
];

function isSuccessfulResult(result: DriftDocumentRow["result"]): boolean {
  return RESULT_OK.has(result);
}

function sourceForLiveDocument(): EvalDocumentSource {
  return "sampled_production";
}

function countRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function maxSeverityForJob(
  jobSheetId: number,
  findingsByJob: Map<number, DriftFindingRow[]>
): DriftFindingRow["severity"] {
  const severities = findingsByJob.get(jobSheetId)?.map(f => f.severity) ?? [];
  return SEVERITY_ORDER.find(severity => severities.includes(severity)) ?? "S3";
}

function groupDocumentsByTemplate(documents: DriftDocumentRow[]) {
  const groups = new Map<string, DriftDocumentRow[]>();
  for (const doc of documents) {
    const key = doc.templateSlug?.trim() || "unknown-template";
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return groups;
}

function countFindingsByJob(findings: DriftFindingRow[] = []) {
  const byJob = new Map<number, DriftFindingRow[]>();
  for (const finding of findings) {
    byJob.set(finding.jobSheetId, [
      ...(byJob.get(finding.jobSheetId) ?? []),
      finding,
    ]);
  }
  return byJob;
}

export function collectLiveEvalResultsFromRows({
  documents,
  findings = [],
}: LiveRows): EvalDocumentResult[] {
  const findingsByJob = countFindingsByJob(findings);

  return [...documents]
    .sort((a, b) => a.jobSheetId - b.jobSheetId)
    .map(doc => {
      const templateId = doc.templateSlug?.trim() || "unknown-template";
      const confidence = normalizeConfidence(doc.confidenceScore) ?? 0;
      const isCorrect = isSuccessfulResult(doc.result);
      const severity = maxSeverityForJob(doc.jobSheetId, findingsByJob);
      const pass2Triggered = doc.result === "review_queue";

      return {
        documentId: String(doc.jobSheetId),
        documentName: `job-sheet-${doc.jobSheetId}`,
        source: sourceForLiveDocument(),
        selection: {
          expectedTemplateId: templateId,
          actualTemplateId: templateId,
          isCorrect,
          confidence,
          runnerUpDelta: 0,
          isAmbiguous: pass2Triggered,
        },
        fields: [
          {
            fieldId: "audit_result",
            fieldName: "audit_result",
            expectedValue: "pass",
            actualValue: doc.result,
            isCorrect,
            confidence,
            severity,
          },
        ],
        fusionResults: [
          {
            fieldId: "audit_result",
            ocrValue: doc.result,
            imageQaValue: isCorrect ? doc.result : "review_required",
            agreed: isCorrect,
            decision: isCorrect ? "merged" : "conflict",
          },
        ],
        pass2: {
          triggered: pass2Triggered,
          reason: pass2Triggered ? "review_queue" : undefined,
          interpreter: pass2Triggered ? "gemini" : undefined,
          escalated: false,
        },
        overallResult: isCorrect ? "pass" : "fail",
        expectedResult: "pass",
        matchesExpectation: isCorrect,
      };
    });
}

export function collectLiveDriftMetricsFromRows({
  documents,
  findings = [],
}: LiveRows): LiveDriftMetrics {
  const totalDocuments = documents.length;
  const findingsByJob = countFindingsByJob(findings);
  const findingJobIds = new Set(findings.map(f => f.jobSheetId));
  const ambiguousSelections = documents.filter(
    doc => doc.result === "review_queue"
  ).length;
  const failedDocuments = documents.filter(doc => doc.result === "fail").length;
  const waivedDocuments = documents.filter(
    doc => doc.result === "waived"
  ).length;
  const lowQualityScans = documents.filter(doc => {
    const confidence = normalizeConfidence(doc.confidenceScore);
    return confidence != null && confidence < 0.75;
  }).length;
  const confidenceSamples = documents
    .map(doc => normalizeConfidence(doc.confidenceScore))
    .filter((value): value is number => value != null);
  const averageConfidence =
    confidenceSamples.length > 0
      ? confidenceSamples.reduce((sum, value) => sum + value, 0) /
        confidenceSamples.length
      : 0;

  const byTemplateId: AmbiguityRateData["byTemplateId"] = {};
  const tokenByTemplateId: TokenCollisionData["byTemplateId"] = {};
  for (const [templateId, docs] of groupDocumentsByTemplate(documents)) {
    const ambiguous = docs.filter(doc => doc.result === "review_queue").length;
    byTemplateId[templateId] = {
      total: docs.length,
      ambiguous,
      rate: countRate(ambiguous, docs.length),
    };
    tokenByTemplateId[templateId] = {
      tokens: docs.length,
      collisions: 0,
      collidingTokens: [],
    };
  }

  const fieldAccuracy = countRate(
    Math.max(totalDocuments - findingJobIds.size, 0),
    totalDocuments
  );
  const selectionAccuracy = countRate(
    documents.filter(doc => isSuccessfulResult(doc.result)).length,
    totalDocuments
  );
  const pass2Rate = countRate(ambiguousSelections, totalDocuments);

  return {
    ambiguityData: {
      totalDocuments,
      ambiguousSelections,
      byTemplateId,
    },
    tokenCollisionData: {
      totalTokens: totalDocuments,
      collisions: 0,
      byTemplateId: tokenByTemplateId,
    },
    overrideData: {
      totalDecisions: totalDocuments,
      overrides: waivedDocuments,
      byType: {
        waived: waivedDocuments,
      },
    },
    scanQualityData: {
      totalScans: totalDocuments,
      lowQualityScans,
      averageConfidence,
      byField: {
        audit_result: {
          total: totalDocuments,
          lowConfidence: lowQualityScans,
          averageConfidence,
        },
      },
    },
    selectionAccuracy,
    fieldAccuracy,
    fusionDisagreementRate: countRate(
      failedDocuments + ambiguousSelections,
      totalDocuments
    ),
    pass2Rate,
  };
}

export async function collectLiveEvalResults(
  period: LiveMetricsPeriod = {}
): Promise<EvalDocumentResult[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("Live evaluation requires DATABASE_URL");
  }

  const db = await import("../../server/db");
  const resolved = resolveDriftPeriod(period.startDate, period.endDate);
  const [documents, findings] = await Promise.all([
    db.getDriftAnalyticsDocuments({
      startDate: new Date(resolved.start),
      endDate: new Date(resolved.end),
    }),
    db.getDriftAnalyticsFindings({
      startDate: new Date(resolved.start),
      endDate: new Date(resolved.end),
    }),
  ]);

  return collectLiveEvalResultsFromRows({ documents, findings });
}

export async function collectLiveDriftMetrics(
  period: LiveMetricsPeriod = {}
): Promise<LiveDriftMetrics> {
  if (!process.env.DATABASE_URL) {
    throw new Error("Live drift metrics require DATABASE_URL");
  }

  const db = await import("../../server/db");
  const resolved = resolveDriftPeriod(period.startDate, period.endDate);
  const [documents, findings] = await Promise.all([
    db.getDriftAnalyticsDocuments({
      startDate: new Date(resolved.start),
      endDate: new Date(resolved.end),
    }),
    db.getDriftAnalyticsFindings({
      startDate: new Date(resolved.start),
      endDate: new Date(resolved.end),
    }),
  ]);

  buildDriftAnalyticsSummary({
    documents,
    findings,
    startDate: resolved.start,
    endDate: resolved.end,
  });

  return collectLiveDriftMetricsFromRows({ documents, findings });
}
