/**
 * Template Studio dry-run audit — real pipeline, no live stats.
 *
 * Mimics a live audit under a pinned draft template so authors can finesse
 * fields/ROI/tokens before activating. Results are durable JSON only
 * (versionId + hashSha256); they never write job_sheets / audit_results.
 */

import { getTemplateVersion } from "../templateRegistry";
import {
  orchestrateJobSheetProcessing,
  type ProcessingResult,
} from "../documentProcessor";
import { getStudioSampleUrl } from "./sampleStore";
import { loadStudioJson, persistStudioJson } from "./durableStore";
import * as db from "../../db";
import { getStorageAdapter } from "../../storage";

export const DRY_RUN_REPORT_VERSION = "1.0.0";

export interface DryRunFindingSummary {
  ruleId?: string;
  fieldName?: string | null;
  severity?: string;
  reasonCode?: string;
  whyItMatters?: string;
  suggestedFix?: string;
}

export interface DryRunSourceRun {
  source: {
    kind: "studio_sample" | "job_sheet";
    jobSheetId?: number;
    documentUrl: string;
    fileName?: string;
  };
  success: boolean;
  overallResult: string;
  assessmentMode: "FULL" | "HYBRID" | "UNKNOWN";
  score: number | null;
  findings: DryRunFindingSummary[];
  processingStages: ProcessingResult["processingStages"];
  durationMs: number;
  blockingIssues: string[];
  pipelineOk: boolean;
}

export interface DryRunReport {
  reportVersion: typeof DRY_RUN_REPORT_VERSION;
  versionId: number;
  hashSha256: string;
  templateId: number;
  /** Pipeline completed FULL under pinned template (findings may still exist). */
  pipelineOk: boolean;
  /** pipelineOk && acknowledged for this hash — unlocks activateStaging. */
  allowed: boolean;
  overallResult: string;
  assessmentMode: "FULL" | "HYBRID" | "UNKNOWN";
  score: number | null;
  runs: DryRunSourceRun[];
  blockingIssues: string[];
  findings: DryRunFindingSummary[];
  runAt: string;
  durationMs: number;
  acknowledgedBy?: number;
  acknowledgedAt?: string;
}

export function dryRunKey(versionId: number, hashSha256: string): string {
  return `template-studio/dry-runs/${versionId}-${hashSha256.slice(0, 16)}.json`;
}

const inMemoryDryRuns = new Map<string, DryRunReport>();

export function resetDryRunStore(): void {
  inMemoryDryRuns.clear();
}

export async function loadDryRunReport(
  versionId: number,
  hashSha256: string
): Promise<DryRunReport | null> {
  const key = dryRunKey(versionId, hashSha256);
  const mem = inMemoryDryRuns.get(key);
  if (mem) return mem;
  const loaded = await loadStudioJson<DryRunReport>(key);
  if (loaded) inMemoryDryRuns.set(key, loaded);
  return loaded;
}

async function saveDryRunReport(report: DryRunReport): Promise<void> {
  const key = dryRunKey(report.versionId, report.hashSha256);
  inMemoryDryRuns.set(key, report);
  await persistStudioJson(key, report);
}

/** Test helper — seed a pipeline-ok acknowledged dry-run without OCR. */
export async function seedAcknowledgedDryRunForTests(input: {
  versionId: number;
  hashSha256: string;
  templateId: number;
  userId?: number;
}): Promise<DryRunReport> {
  const report: DryRunReport = {
    reportVersion: DRY_RUN_REPORT_VERSION,
    versionId: input.versionId,
    hashSha256: input.hashSha256,
    templateId: input.templateId,
    pipelineOk: true,
    allowed: true,
    overallResult: "PASS",
    assessmentMode: "FULL",
    score: 100,
    runs: [],
    blockingIssues: [],
    findings: [],
    runAt: new Date().toISOString(),
    durationMs: 1,
    acknowledgedBy: input.userId ?? 1,
    acknowledgedAt: new Date().toISOString(),
  };
  await saveDryRunReport(report);
  return report;
}

function summarizeFindings(result: ProcessingResult): DryRunFindingSummary[] {
  const findings = result.analysisResult?.findings ?? [];
  return findings.slice(0, 40).map(f => ({
    ruleId: f.ruleId,
    fieldName: f.fieldName,
    severity: f.severity,
    reasonCode: f.reasonCode,
    whyItMatters: f.whyItMatters,
    suggestedFix: f.suggestedFix,
  }));
}

function evaluatePipelineOk(
  result: ProcessingResult,
  expectedVersionId: number
): { pipelineOk: boolean; blockingIssues: string[] } {
  const blockingIssues: string[] = [];
  if (!result.success) {
    blockingIssues.push("PIPELINE_FAILED");
  }
  if (result.assessmentMode !== "FULL") {
    blockingIssues.push(
      `ASSESSMENT_MODE_${result.assessmentMode ?? "UNKNOWN"}`
    );
  }
  const ocrFailed = result.processingStages.some(
    s => s.stage === "OCR Text Extraction" && s.status === "failed"
  );
  if (ocrFailed) {
    blockingIssues.push("OCR_FAILED");
  }
  // Pinned template: selection is bypassed; ensure we did not fall to hybrid
  // without a full analysis result.
  if (result.assessmentMode === "FULL" && !result.analysisResult) {
    blockingIssues.push("MISSING_ANALYSIS");
  }
  void expectedVersionId;
  return {
    pipelineOk: blockingIssues.length === 0,
    blockingIssues,
  };
}

async function resolveJobSheetDocumentUrl(
  jobSheetId: number
): Promise<{ url: string; fileName?: string }> {
  const jobSheet = await db.getJobSheetById(jobSheetId);
  if (!jobSheet) {
    throw new Error(`Job sheet not found: ${jobSheetId}`);
  }
  let fileUrl = jobSheet.fileUrl;
  if (jobSheet.fileKey) {
    const storage = getStorageAdapter();
    const got = await storage.get(jobSheet.fileKey);
    fileUrl = got.url;
  }
  if (!fileUrl) {
    throw new Error(`Job sheet ${jobSheetId} has no file`);
  }
  return { url: fileUrl, fileName: jobSheet.fileName };
}

async function runOneSource(input: {
  version: NonNullable<ReturnType<typeof getTemplateVersion>>;
  kind: "studio_sample" | "job_sheet";
  documentUrl: string;
  jobSheetId?: number;
  fileName?: string;
  userId?: number;
}): Promise<DryRunSourceRun> {
  const started = Date.now();
  const result = await orchestrateJobSheetProcessing({
    source: "studio-dry-run",
    jobSheetId: input.jobSheetId && input.jobSheetId > 0 ? input.jobSheetId : 0,
    documentUrl: input.documentUrl,
    templateVersionId: input.version.id,
    userId: input.userId,
    persistResults: false,
    skipProgress: true,
  });

  const { pipelineOk, blockingIssues } = evaluatePipelineOk(
    result,
    input.version.id
  );
  const overallResult =
    result.analysisResult?.overallResult ??
    (result.assessmentMode === "HYBRID" ? "REVIEW_QUEUE" : "UNKNOWN");

  return {
    source: {
      kind: input.kind,
      jobSheetId: input.jobSheetId,
      documentUrl: input.documentUrl,
      fileName: input.fileName,
    },
    success: result.success,
    overallResult,
    assessmentMode: result.assessmentMode ?? "UNKNOWN",
    score:
      typeof result.analysisResult?.score === "number"
        ? result.analysisResult.score
        : null,
    findings: summarizeFindings(result),
    processingStages: result.processingStages,
    durationMs: Date.now() - started,
    blockingIssues,
    pipelineOk,
  };
}

export async function runStudioDryRun(input: {
  versionId: number;
  userId: number;
  jobSheetIds?: number[];
}): Promise<DryRunReport> {
  const version = getTemplateVersion(input.versionId);
  if (!version) {
    throw new Error(`Version not found: ${input.versionId}`);
  }

  const sample = await getStudioSampleUrl(input.versionId);
  if (!sample) {
    throw new Error(
      "DRY_RUN_NO_SAMPLE: Attach a sample PDF in Template Studio before dry-run"
    );
  }

  const started = Date.now();
  const runs: DryRunSourceRun[] = [];

  runs.push(
    await runOneSource({
      version,
      kind: "studio_sample",
      documentUrl: sample.url,
      fileName: sample.meta.fileName,
      userId: input.userId,
    })
  );

  for (const jobSheetId of input.jobSheetIds ?? []) {
    if (!Number.isFinite(jobSheetId) || jobSheetId <= 0) continue;
    const doc = await resolveJobSheetDocumentUrl(jobSheetId);
    runs.push(
      await runOneSource({
        version,
        kind: "job_sheet",
        documentUrl: doc.url,
        jobSheetId,
        fileName: doc.fileName,
        userId: input.userId,
      })
    );
  }

  const blockingIssues = Array.from(
    new Set(runs.flatMap(r => r.blockingIssues))
  );
  const pipelineOk = runs.every(r => r.pipelineOk);
  const primary = runs[0];
  const findings = runs.flatMap(r => r.findings).slice(0, 60);

  // Fresh run clears previous acknowledgment (hash-bound).
  const report: DryRunReport = {
    reportVersion: DRY_RUN_REPORT_VERSION,
    versionId: version.id,
    hashSha256: version.hashSha256,
    templateId: version.templateId,
    pipelineOk,
    allowed: false,
    overallResult: primary?.overallResult ?? "UNKNOWN",
    assessmentMode: primary?.assessmentMode ?? "UNKNOWN",
    score: primary?.score ?? null,
    runs,
    blockingIssues,
    findings,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };

  await saveDryRunReport(report);
  return report;
}

export async function acknowledgeDryRun(input: {
  versionId: number;
  hashSha256: string;
  userId: number;
}): Promise<DryRunReport> {
  const version = getTemplateVersion(input.versionId);
  if (!version) {
    throw new Error(`Version not found: ${input.versionId}`);
  }
  if (version.hashSha256 !== input.hashSha256) {
    throw new Error(
      "DRY_RUN_STALE: Draft changed since dry-run — re-run dry-run audit"
    );
  }

  const report = await loadDryRunReport(input.versionId, input.hashSha256);
  if (!report) {
    throw new Error(
      "DRY_RUN_REQUIRED: Run a dry-run audit before acknowledging"
    );
  }
  if (report.hashSha256 !== version.hashSha256) {
    throw new Error(
      "DRY_RUN_STALE: Draft changed since dry-run — re-run dry-run audit"
    );
  }
  if (!report.pipelineOk) {
    throw new Error(
      `DRY_RUN_PIPELINE_FAILED: Fix blocking issues before confirming (${report.blockingIssues.join(", ")})`
    );
  }

  const acknowledged: DryRunReport = {
    ...report,
    acknowledgedBy: input.userId,
    acknowledgedAt: new Date().toISOString(),
    allowed: true,
  };
  await saveDryRunReport(acknowledged);
  return acknowledged;
}

/**
 * Gate helper for activateStaging / activationReport.
 */
export async function getDryRunGateStatus(versionId: number): Promise<{
  report: DryRunReport | null;
  allowed: boolean;
  blocking: boolean;
  code:
    | "OK"
    | "DRY_RUN_REQUIRED"
    | "DRY_RUN_STALE"
    | "DRY_RUN_NOT_ACKNOWLEDGED"
    | "DRY_RUN_PIPELINE_FAILED";
  message: string;
}> {
  const version = getTemplateVersion(versionId);
  if (!version) {
    return {
      report: null,
      allowed: false,
      blocking: true,
      code: "DRY_RUN_REQUIRED",
      message: "Version not found",
    };
  }
  const report = await loadDryRunReport(versionId, version.hashSha256);
  if (!report) {
    return {
      report: null,
      allowed: false,
      blocking: true,
      code: "DRY_RUN_REQUIRED",
      message: "Run a dry-run audit on the sample before activating",
    };
  }
  if (report.hashSha256 !== version.hashSha256) {
    return {
      report,
      allowed: false,
      blocking: true,
      code: "DRY_RUN_STALE",
      message: "Draft changed since dry-run — re-run and confirm",
    };
  }
  if (!report.pipelineOk) {
    return {
      report,
      allowed: false,
      blocking: true,
      code: "DRY_RUN_PIPELINE_FAILED",
      message: `Dry-run pipeline failed: ${report.blockingIssues.join(", ")}`,
    };
  }
  if (!report.acknowledgedBy || !report.allowed) {
    return {
      report,
      allowed: false,
      blocking: true,
      code: "DRY_RUN_NOT_ACKNOWLEDGED",
      message:
        "Confirm the dry-run looks correct after reviewing findings before activating",
    };
  }
  return {
    report,
    allowed: true,
    blocking: false,
    code: "OK",
    message: "Dry-run acknowledged for current draft",
  };
}
