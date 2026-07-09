import type {
  GoldenDocument,
  GoldenFinding,
  GoldenValidatedField,
} from "./types";
import { mapToCanonicalReasonCode } from "./types";

interface ProcessingFinding {
  ruleId?: string;
  fieldName?: string;
  severity?: "S0" | "S1" | "S2" | "S3";
  reasonCode?: string;
  rawSnippet?: string;
  normalisedSnippet?: string;
  confidence?: number;
  pageNumber?: number;
  boundingBox?: unknown;
  whyItMatters?: string;
  suggestedFix?: string;
}

interface ProcessingResultLike {
  success: boolean;
  analysisResult?: {
    overallResult: "PASS" | "FAIL" | "REVIEW_QUEUE";
    score: number;
    findings: ProcessingFinding[];
    extractedFields: Record<
      string,
      {
        value: unknown;
        confidence?: number;
        pageNumber?: number;
      }
    >;
  };
  hybridAssessment?: {
    extractedFields?: Array<{
      field: string;
      value: unknown;
      confidence?: number;
      pageNumber?: number;
    }>;
  };
}

type PipelineFixtureRuntime = NonNullable<GoldenDocument["pipeline"]>;

type GoldenDocumentWithLegacyRuntime = GoldenDocument & {
  jobSheetId?: number;
  documentUrl?: string;
  templateVersionId?: number;
  userId?: number;
  fixture?: PipelineFixtureRuntime;
  source?: PipelineFixtureRuntime;
};

export type ParityPipelineExecutor = (
  document: GoldenDocument,
  runtime: PipelineFixtureRuntime
) => Promise<ProcessingResultLike>;

export interface ResolveActualResultsOptions {
  mock?: boolean;
  executor?: ParityPipelineExecutor;
}

export class ParityRunSkippedError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join("; "));
    this.name = "ParityRunSkippedError";
    this.reasons = reasons;
  }
}

export function isParityRunSkippedError(
  error: unknown
): error is ParityRunSkippedError {
  return error instanceof ParityRunSkippedError;
}

export function shouldUseMockActualResults(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return args.includes("--mock") || env.PARITY_MOCK === "1";
}

/**
 * Generate mock actual results for offline testing.
 */
export function generateMockActualResults(
  goldenDocs: GoldenDocument[]
): GoldenDocument[] {
  return goldenDocs.map(doc => ({
    ...doc,
    validatedFields: doc.validatedFields.map(field => ({
      ...field,
    })),
  }));
}

export async function resolveActualResults(
  goldenDocs: GoldenDocument[],
  options: ResolveActualResultsOptions = {}
): Promise<GoldenDocument[]> {
  if (options.mock) {
    return generateMockActualResults(goldenDocs);
  }

  const missingRuntime = goldenDocs
    .filter(doc => !getPipelineRuntime(doc))
    .map(doc => doc.id);

  if (missingRuntime.length > 0) {
    throw new ParityRunSkippedError([
      `Real parity requires fixture pipeline metadata for: ${missingRuntime.join(", ")}`,
      "Run with --mock or PARITY_MOCK=1 for offline fixture-only parity.",
    ]);
  }

  const executor = options.executor ?? executeFixtureThroughPipeline;
  const actualDocs: GoldenDocument[] = [];

  for (const goldenDoc of goldenDocs) {
    const runtime = getPipelineRuntime(goldenDoc);
    if (!runtime) continue;

    try {
      const result = await executor(goldenDoc, runtime);
      actualDocs.push(
        convertProcessingResultToGoldenDocument(goldenDoc, result)
      );
    } catch (error) {
      throw new ParityRunSkippedError([
        `Real parity pipeline attempt failed for ${goldenDoc.id}: ${formatError(error)}`,
        "No retry was attempted; run with --mock or PARITY_MOCK=1 for offline fallback.",
      ]);
    }
  }

  return actualDocs;
}

export function getPipelineRuntime(
  doc: GoldenDocument
): PipelineFixtureRuntime | null {
  const legacyDoc = doc as GoldenDocumentWithLegacyRuntime;
  const runtime = legacyDoc.pipeline ?? legacyDoc.fixture ?? legacyDoc.source;

  if (runtime) {
    return runtime;
  }

  if (
    legacyDoc.jobSheetId != null ||
    legacyDoc.documentUrl ||
    legacyDoc.templateVersionId != null
  ) {
    return {
      jobSheetId: legacyDoc.jobSheetId,
      documentUrl: legacyDoc.documentUrl,
      templateVersionId: legacyDoc.templateVersionId,
      userId: legacyDoc.userId,
    };
  }

  return null;
}

export function convertProcessingResultToGoldenDocument(
  goldenDoc: GoldenDocument,
  result: ProcessingResultLike
): GoldenDocument {
  const extractedFields = extractFields(result);
  const findings = result.analysisResult?.findings ?? [];
  const actualFindings = findings.map((finding, index) =>
    convertFinding(goldenDoc.id, finding, index)
  );
  const actualResult =
    result.analysisResult?.overallResult === "PASS" ? "pass" : "fail";

  return {
    ...goldenDoc,
    expectedResult: result.success && actualResult === "pass" ? "pass" : "fail",
    extractedFields: Object.fromEntries(
      Object.entries(extractedFields).map(([field, value]) => [
        field,
        value.value,
      ])
    ),
    validatedFields: goldenDoc.validatedFields.map(expectedField =>
      convertValidatedField(expectedField, findings, extractedFields)
    ),
    findings: actualFindings,
  };
}

async function executeFixtureThroughPipeline(
  doc: GoldenDocument,
  runtime: PipelineFixtureRuntime
): Promise<ProcessingResultLike> {
  const { orchestrateJobSheetProcessing } = await import(
    "../../server/services/documentProcessor"
  );
  const jobSheetId =
    runtime.jobSheetId ?? (await createFixtureJobSheet(doc, runtime));

  return orchestrateJobSheetProcessing({
    source: "reprocess",
    jobSheetId,
    documentUrl: runtime.documentUrl,
    templateVersionId: runtime.templateVersionId,
    userId: runtime.userId,
  });
}

async function createFixtureJobSheet(
  doc: GoldenDocument,
  runtime: PipelineFixtureRuntime
): Promise<number> {
  if (!runtime.documentUrl) {
    throw new Error("documentUrl is required when jobSheetId is not provided");
  }

  const db = await import("../../server/db");
  const created = await db.createJobSheet({
    fileUrl: runtime.documentUrl,
    fileKey: runtime.fileKey ?? `parity/${doc.id}`,
    fileName: runtime.fileName ?? `${doc.id}.pdf`,
    fileType: runtime.fileType ?? "application/pdf",
    fileSizeBytes: runtime.fileSizeBytes,
    uploadedBy: runtime.userId ?? 0,
    status: "pending",
  });

  return created.id;
}

function extractFields(
  result: ProcessingResultLike
): Record<
  string,
  { value: unknown; confidence?: number; pageNumber?: number }
> {
  if (result.analysisResult?.extractedFields) {
    return result.analysisResult.extractedFields;
  }

  return Object.fromEntries(
    (result.hybridAssessment?.extractedFields ?? []).map(field => [
      field.field,
      {
        value: field.value,
        confidence: field.confidence,
        pageNumber: field.pageNumber,
      },
    ])
  );
}

function convertValidatedField(
  expectedField: GoldenValidatedField,
  findings: ProcessingFinding[],
  extractedFields: Record<
    string,
    { value: unknown; confidence?: number; pageNumber?: number }
  >
): GoldenValidatedField {
  const finding = findings.find(
    candidate =>
      candidate.ruleId === expectedField.ruleId ||
      candidate.fieldName === expectedField.field
  );
  const extracted = extractedFields[expectedField.field];

  return {
    ruleId: expectedField.ruleId,
    field: expectedField.field,
    status: finding ? "failed" : "passed",
    value: extracted?.value ?? null,
    confidence: normalizeConfidence(
      finding?.confidence ?? extracted?.confidence ?? expectedField.confidence
    ),
    pageNumber:
      finding?.pageNumber ?? extracted?.pageNumber ?? expectedField.pageNumber,
    severity: finding?.severity ?? expectedField.severity,
    reasonCode: finding?.reasonCode
      ? mapToCanonicalReasonCode(finding.reasonCode)
      : undefined,
    message: finding?.whyItMatters,
    evidence:
      finding?.rawSnippet || finding?.boundingBox
        ? {
            snippet: finding.rawSnippet ?? finding.normalisedSnippet ?? "",
            boundingBox: finding.boundingBox ?? null,
          }
        : undefined,
  };
}

function convertFinding(
  documentId: string,
  finding: ProcessingFinding,
  index: number
): GoldenFinding {
  return {
    id: `${documentId}-${finding.ruleId ?? "finding"}-${index + 1}`,
    ruleId: finding.ruleId ?? `PIPELINE-${index + 1}`,
    field: finding.fieldName ?? "document",
    severity: finding.severity ?? "S1",
    reasonCode: finding.reasonCode
      ? mapToCanonicalReasonCode(finding.reasonCode)
      : "PIPELINE_ERROR",
    message: finding.whyItMatters ?? finding.suggestedFix ?? "Pipeline finding",
    extractedValue: finding.normalisedSnippet,
    pageNumber: finding.pageNumber,
    evidence:
      finding.rawSnippet || finding.boundingBox
        ? {
            snippet: finding.rawSnippet ?? finding.normalisedSnippet ?? "",
            boundingBox: finding.boundingBox ?? null,
          }
        : undefined,
  };
}

function normalizeConfidence(confidence: number): number {
  return confidence > 1 ? confidence / 100 : confidence;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
