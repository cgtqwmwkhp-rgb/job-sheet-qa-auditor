/**
 * Document Processor Service
 * Orchestrates the full document processing pipeline:
 * 1. Mistral OCR for text extraction
 * 2. Template selection (SSOT - templates only)
 * 3. Gemini 3.1 Pro for analysis against Gold Standard
 * 4. Result storage and audit trail
 *
 * PR-1: SSOT ENFORCEMENT
 * - No legacy goldSpecId path (deprecated)
 * - No hardcoded fallback specs
 * - All processing uses template registry
 * - Pipeline fails explicitly if no template matches
 */

import { createHash } from "crypto";
import { extractTextFromDocument, OCRResult } from "./ocr";
import {
  getOCRConfig,
  getOCREngineVersion,
  ocrResilienceReportFields,
} from "./ocrAdapter/types";
import { analyzeJobSheet, AnalysisResult, GoldSpec } from "./analyzer";
import { selectTemplateMultiSignal } from "./templateSelector";
import {
  enrichWithEmbeddedPdfText,
  isThinExtractedText,
  THIN_TEXT_CHAR_THRESHOLD,
} from "./embeddedPdfText";
import {
  getTemplateVersion,
  getTemplate,
  getActiveTemplates,
  ensureTemplatesReady,
  getDefaultTemplateVersion,
  type SelectionResult,
  FALLBACK_TEMPLATE_ID,
  isFallbackTemplate,
} from "./templateRegistry";
import {
  performHybridAssessment,
  type HybridAssessmentResult,
} from "./hybridAssessment";
import { specJsonToGoldSpec } from "./templateRegistry/defaultTemplate";
import {
  enrichFindingsWithOcrEvidence,
  computePageConfidencePrior,
  hasOcrSignatureEvidence,
} from "./ocrFindingEnrichment";
import { modelRegistryStamp } from "./modelRegistry";
import {
  runEnsembleExtraction,
  buildEnsembleReviewFindings,
  mergeExtractedFields,
  isEnsembleExtractionEnabled,
  formatPreExtractedHints,
  type EnsembleAdapterResult,
} from "./ensembleExtraction";
import { applyFindingHygiene } from "./findingHygiene";
import {
  evaluateShadowChallenger,
  isShadowChallengerEnabled,
  type ShadowComparison,
} from "./shadowChallenger";
import {
  getFeatureFlagsFromEnv,
  processWithIntegration,
  type PipelineOutput,
} from "./pipelineIntegration";
import {
  computeEce,
  isCalibrationEnabled,
  suggestThreshold,
} from "./calibration";
import {
  buildDriftAlert,
  formatAlertForChannel,
  isOpsAlertsEnabled,
  rankAttention,
} from "./opsAlerts";
import { isRiskRoutingEnabled, routeByRisk } from "./riskRouting";
import { evaluateStageSlo, isStageSloEnabled } from "./slo";
import {
  checkCollision,
  isTemplateCollisionEnabled,
} from "./templateCollision";
import { getVlmConfig, isVlmVerificationEnabled } from "./vlmAdapter";
import * as db from "../db";
import { v4 as uuidv4 } from "uuid";
import {
  beginProcessingProgress,
  finishProcessingProgress,
  syncStagesFromProcessor,
} from "./processingProgressStore";
import type { JobSheetProcessStatus } from "@shared/processingProgress";

export interface ProcessingResult {
  success: boolean;
  jobSheetId: number;
  auditResultId?: number;
  ocrResult: OCRResult;
  analysisResult?: AnalysisResult;
  selectionResult?: SelectionResult;
  /** Hybrid assessment result (for fallback/unknown documents) */
  hybridAssessment?: HybridAssessmentResult;
  /** Assessment mode used */
  assessmentMode?: "FULL" | "HYBRID";
  processingStages: {
    stage: string;
    status: "success" | "failed" | "skipped";
    durationMs: number;
    error?: string;
  }[];
  totalDurationMs: number;
}

export interface ProcessingOptions {
  /** Explicit template version ID (preferred - bypasses selection) */
  templateVersionId?: number;
  /**
   * @deprecated Legacy gold spec ID - REMOVED in SSOT enforcement
   * This option is ignored; use templateVersionId instead.
   */
  goldSpecId?: number;
  /** User ID for audit trail */
  userId?: number;
  /**
   * @deprecated Force use of legacy path - REMOVED in SSOT enforcement
   * This option is ignored; templates are always used.
   */
  useLegacyPath?: boolean;
}

export interface OrchestrateJobSheetProcessingRequest
  extends ProcessingOptions {
  jobSheetId: number;
  /**
   * Primary HTTP callers already have this from their job sheet lookup. Retry
   * callers can omit it and let documentProcessor hydrate the canonical record.
   */
  documentUrl?: string;
  /** Names the external entrypoint for logs/tests; do not branch pipeline logic on it. */
  source?: "primary" | "reprocess" | "template-reprocess" | "dlq-retry";
}

/**
 * PR-16: Persist selection + template cohort dimensions on the audit report
 * so analytics can aggregate by assetType / workType without a live registry join.
 */
function buildSelectionCohortMeta(
  selectionResult: SelectionResult | undefined,
  templateVersionId?: number
): {
  templateSlug: string | null;
  templateId: number | null;
  versionId: number | null;
  assetType: string | null;
  workType: string | null;
  client: string | null;
  confidenceBand: string | null;
  scoreGap: number | null;
} | null {
  if (!selectionResult && templateVersionId == null) return null;

  const versionId = selectionResult?.versionId ?? templateVersionId ?? null;
  const version = versionId != null ? getTemplateVersion(versionId) : null;
  const template =
    version != null
      ? getTemplate(version.templateId)
      : selectionResult?.templateId != null
        ? getTemplate(selectionResult.templateId)
        : null;

  const topCandidate = selectionResult?.candidates?.[0];

  return {
    templateSlug: topCandidate?.templateSlug ?? template?.templateId ?? null,
    templateId: selectionResult?.templateId ?? template?.id ?? null,
    versionId,
    assetType: template?.assetType ?? null,
    workType: template?.workType ?? null,
    client: template?.client ?? null,
    confidenceBand: selectionResult?.confidenceBand ?? null,
    scoreGap: selectionResult?.scoreGap ?? null,
  };
}

const PIPELINE_VERSION = "2.1.0"; // PR-8: ensemble extraction stage

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function confidenceToUnit(score: number): number {
  const unitScore = score > 1 ? score / 100 : score;
  return Math.max(0, Math.min(1, unitScore));
}

type FlaggedProcessorArtifacts = Record<string, unknown>;

function buildFlaggedProcessorArtifacts(input: {
  jobSheetId: number;
  ocrResult: OCRResult;
  analysisResult: AnalysisResult;
  stages: ProcessingResult["processingStages"];
  processingSettings: Awaited<ReturnType<typeof db.getProcessingSettings>>;
  selectionResult?: SelectionResult;
  usedTemplateVersionId?: number;
}): FlaggedProcessorArtifacts | null {
  const artifacts: FlaggedProcessorArtifacts = {};
  const confidence = confidenceToUnit(input.analysisResult.score);

  const addArtifact = <T>(
    key: string,
    enabled: boolean,
    build: () => T
  ): void => {
    if (!enabled) return;

    try {
      artifacts[key] = build();
    } catch (error) {
      console.warn(
        `[DocumentProcessor] ${key} feature artifact failed (non-fatal):`,
        error
      );
    }
  };

  addArtifact("calibration", isCalibrationEnabled(), () => {
    const currentThreshold = confidenceToUnit(
      input.processingSettings.llmConfidenceThreshold ?? 70
    );
    const labelledSamples: [] = [];

    return {
      sampleCount: labelledSamples.length,
      ece: computeEce(labelledSamples),
      thresholdSuggestion: suggestThreshold(labelledSamples, {
        currentThreshold,
      }),
      note: "No reviewed outcome labels are available during upload processing.",
    };
  });

  addArtifact("riskRouting", isRiskRoutingEnabled(), () =>
    routeByRisk({
      jobSheetId: input.jobSheetId,
      confidence,
      findings: input.analysisResult.findings.map(finding => ({
        severity: finding.severity,
        reasonCode: finding.reasonCode,
        fieldName: finding.fieldName,
      })),
    })
  );

  addArtifact("opsAlerts", isOpsAlertsEnabled(), () => {
    const reasons = [
      `result=${input.analysisResult.overallResult}`,
      `confidence=${confidence.toFixed(2)}`,
      `findings=${input.analysisResult.findings.length}`,
    ];
    const attentionScore = Math.max(
      0,
      Math.min(
        1,
        1 - confidence + (input.analysisResult.findings.length > 0 ? 0.15 : 0)
      )
    );
    const attentionQueue = rankAttention(
      [
        {
          jobSheetId: input.jobSheetId,
          score: Number(attentionScore.toFixed(4)),
          reasons,
        },
      ],
      1
    );
    const alert =
      attentionScore >= 0.5
        ? buildDriftAlert({
            metric: "processor_attention_score",
            severity: attentionScore >= 0.8 ? "critical" : "warn",
            message: `Job sheet ${input.jobSheetId} has elevated processor attention score ${attentionScore.toFixed(2)}`,
          })
        : null;

    return {
      attentionQueue,
      alert,
      formattedLog: alert ? formatAlertForChannel(alert, "log") : null,
    };
  });

  addArtifact("stageSlo", isStageSloEnabled(), () => {
    const stageMap = [
      ["OCR Text Extraction", "ocr"],
      ["Ensemble Extraction", "ensemble"],
      ["AI Analysis", "judgment"],
    ] as const;

    return stageMap
      .map(([processorStage, sloStage]) => {
        const observed = input.stages.find(
          stage => stage.stage === processorStage && stage.status !== "skipped"
        );
        if (!observed) return null;
        return evaluateStageSlo({
          stage: sloStage,
          latencyMs: observed.durationMs,
          ok: observed.status === "success",
        });
      })
      .filter(Boolean);
  });

  addArtifact("templateCollision", isTemplateCollisionEnabled(), () => {
    const version = input.usedTemplateVersionId
      ? getTemplateVersion(input.usedTemplateVersionId)
      : null;
    const selectedTemplate = version ? getTemplate(version.templateId) : null;
    const candidate = {
      templateId:
        selectedTemplate?.templateId ??
        input.selectionResult?.candidates?.[0]?.templateSlug ??
        `version-${input.usedTemplateVersionId ?? "unknown"}`,
      fingerprint: version?.hashSha256 ?? "",
      version: version?.version,
    };
    const existing = getActiveTemplates()
      .filter(template => template.templateId !== candidate.templateId)
      .map(template => {
        const activeVersion = template.activeVersionId
          ? getTemplateVersion(template.activeVersionId)
          : null;
        return {
          templateId: template.templateId,
          fingerprint: activeVersion?.hashSha256 ?? "",
          version: template.activeVersion ?? undefined,
        };
      });

    return checkCollision(candidate, existing);
  });

  addArtifact("vlmVerification", isVlmVerificationEnabled(), () => {
    const config = getVlmConfig();
    return {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      maxCropsPerDoc: config.maxCropsPerDoc,
      confidenceThreshold: config.confidenceThreshold,
      note: "Document processor has no crop image at this stage; ROI paths invoke VLM when crop data is present.",
    };
  });

  return Object.keys(artifacts).length > 0 ? artifacts : null;
}

/**
 * Process a job sheet document through the full pipeline
 *
 * @param jobSheetId - Job sheet ID to process
 * @param documentUrl - URL of the document file
 * @param goldSpecId - Legacy: Gold spec ID (deprecated, use options.templateVersionId)
 * @param userId - User ID for audit trail
 */
export async function processJobSheet(
  jobSheetId: number,
  documentUrl: string,
  goldSpecId?: number,
  userId?: number
): Promise<ProcessingResult> {
  return orchestrateJobSheetProcessing({
    source: "primary",
    jobSheetId,
    documentUrl,
    goldSpecId,
    userId,
  });
}

/**
 * Sole external orchestration entry for job-sheet processing. HTTP/tRPC,
 * reprocess, and DLQ retry paths should call this instead of assembling a
 * second pipeline outside documentProcessor.
 */
export async function orchestrateJobSheetProcessing(
  request: OrchestrateJobSheetProcessingRequest
): Promise<ProcessingResult> {
  let documentUrl = request.documentUrl;

  if (!documentUrl) {
    const jobSheet = await db.getJobSheetById(request.jobSheetId);
    if (!jobSheet) {
      throw new Error(`Job sheet ${request.jobSheetId} not found`);
    }
    documentUrl = jobSheet.fileUrl;
  }

  return processJobSheetWithOptions(request.jobSheetId, documentUrl, {
    goldSpecId: request.goldSpecId,
    templateVersionId: request.templateVersionId,
    userId: request.userId,
    useLegacyPath: request.useLegacyPath,
  });
}

/**
 * Internal implementation for the documentProcessor orchestration entry.
 *
 * TEMPLATE SELECTION RULES:
 * - If templateVersionId is provided: use that version directly
 * - If goldSpecId is provided: use legacy path
 * - Otherwise: attempt template selection from extracted text
 *   - HIGH confidence: auto-process
 *   - MEDIUM with gap >= 10: auto-process
 *   - MEDIUM with gap < 10: REVIEW_QUEUE (CONFLICT)
 *   - LOW: REVIEW_QUEUE (CONFLICT)
 */
async function processJobSheetWithOptions(
  jobSheetId: number,
  documentUrl: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const stages: ProcessingResult["processingStages"] = [];
  const runId = uuidv4();
  let selectionResult: SelectionResult | undefined;

  /** PR-11: push stage + sync live poll snapshot (non-fatal). */
  const recordStage = (
    stage: ProcessingResult["processingStages"][number],
    nextRunning?: string
  ) => {
    stages.push(stage);
    try {
      syncStagesFromProcessor(jobSheetId, stages, nextRunning);
    } catch (err) {
      console.warn("[DocumentProcessor] progress sync failed:", err);
    }
  };

  const finishProgress = (finalStatus: JobSheetProcessStatus) => {
    try {
      finishProcessingProgress(jobSheetId, finalStatus, stages);
    } catch (err) {
      console.warn("[DocumentProcessor] progress finish failed:", err);
    }
  };

  // Update job sheet status to processing
  try {
    await db.updateJobSheetStatus(jobSheetId, "processing");
  } catch (error) {
    console.warn(
      "[DocumentProcessor] Could not update job sheet status:",
      error
    );
  }

  try {
    beginProcessingProgress(jobSheetId);
  } catch (err) {
    console.warn("[DocumentProcessor] progress begin failed:", err);
  }

  // Stage 1: OCR Text Extraction
  const ocrStartTime = Date.now();
  let ocrResult: OCRResult;

  try {
    ocrResult = await extractTextFromDocument(documentUrl, { jobSheetId });
    recordStage(
      {
        stage: "OCR Text Extraction",
        status: ocrResult.success ? "success" : "failed",
        durationMs: Date.now() - ocrStartTime,
        error: ocrResult.error,
      },
      ocrResult.success ? "Template Selection" : undefined
    );
  } catch (error) {
    ocrResult = {
      success: false,
      pages: [],
      totalPages: 0,
      model: getOCRConfig().model,
      error: error instanceof Error ? error.message : "OCR failed",
    };
    recordStage({
      stage: "OCR Text Extraction",
      status: "failed",
      durationMs: Date.now() - ocrStartTime,
      error: ocrResult.error,
    });
  }

  // If OCR failed, mark as failed and return
  if (!ocrResult.success || ocrResult.pages.length === 0) {
    try {
      await db.updateJobSheetStatus(jobSheetId, "failed");
    } catch (error) {
      console.warn(
        "[DocumentProcessor] Could not update job sheet status:",
        error
      );
    }

    finishProgress("failed");
    return {
      success: false,
      jobSheetId,
      ocrResult,
      processingStages: stages,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Load processing thresholds (OCR / LLM confidence)
  const processingSettings = await db.getProcessingSettings();

  // Soft gate: low OCR page confidence must NOT abort before template selection /
  // Gemini judgment. Earlier hard-abort produced score≈OCR% with 0 findings in ~1s
  // (e.g. JOB-20260709-3AZPKT). Continue the pipeline and force review_queue later.
  const pageConfidencePrior = computePageConfidencePrior(ocrResult);
  const ocrThreshold = (processingSettings.ocrConfidenceThreshold ?? 60) / 100;
  const lowOcrConfidence =
    typeof pageConfidencePrior === "number" &&
    pageConfidencePrior < ocrThreshold;
  if (lowOcrConfidence) {
    console.warn(
      `[DocumentProcessor] OCR confidence below threshold — continuing to judgment`,
      {
        jobSheetId,
        pageConfidencePrior,
        ocrThreshold,
      }
    );
    recordStage({
      stage: "OCR Confidence Gate",
      status: "skipped",
      durationMs: 0,
      error: "LOW_OCR_CONFIDENCE",
    });
  }

  // Combine all page text (OCR baseline; may be replaced by embedded enrichment)
  let extractedText = ocrResult.pages
    .map(page => `--- Page ${page.pageNumber} ---\n${page.markdown}`)
    .join("\n\n");
  let pageTextsForPipeline = ocrResult.pages.map(p => p.markdown);
  let usedEmbeddedText = false;

  // Stage 1.25: Prefer embedded PDF text when richer than thin OCR markdown
  const enrichStartTime = Date.now();
  try {
    const enrichment = await enrichWithEmbeddedPdfText(
      documentUrl,
      ocrResult.pages.map(p => p.markdown)
    );
    extractedText = enrichment.extractedText;
    pageTextsForPipeline = enrichment.pageTexts;
    usedEmbeddedText = enrichment.usedEmbedded;
    recordStage({
      stage: "Embedded Text Enrichment",
      status: enrichment.stageStatus,
      durationMs: Date.now() - enrichStartTime,
      error: enrichment.stageError,
    });
    if (enrichment.usedEmbedded) {
      console.log("[DocumentProcessor] Preferring embedded PDF text over OCR", {
        jobSheetId,
        ocrLength: enrichment.ocrLength,
        embeddedLength: enrichment.embeddedLength,
      });
    }
  } catch (error) {
    recordStage({
      stage: "Embedded Text Enrichment",
      status: "failed",
      durationMs: Date.now() - enrichStartTime,
      error: error instanceof Error ? error.message : "enrichment failed",
    });
  }

  // =========================================================================
  // Stage 1.5: Template Selection (PR-1 SSOT Enforcement)
  //
  // SSOT RULES:
  // - Templates are the ONLY source of truth (no hardcoded fallback)
  // - If no templates exist, pipeline fails explicitly
  // - Legacy goldSpecId/useLegacyPath options are IGNORED
  // =========================================================================
  const selectionStartTime = Date.now();
  let spec: GoldSpec;
  let usedTemplateVersionId: number | undefined;

  // Thin-text guard: skip Gemini FULL path (avoids MISSING_FIELD storms)
  if (isThinExtractedText(extractedText)) {
    console.warn(
      `[DocumentProcessor] Thin extracted text (<${THIN_TEXT_CHAR_THRESHOLD} chars) — hybrid review instead of Gemini`,
      {
        jobSheetId,
        usableChars: extractedText.replace(/\s+/g, " ").trim().length,
      }
    );
    recordStage({
      stage: "Thin Text Guard",
      status: "skipped",
      durationMs: 0,
      error: "THIN_OCR_TEXT",
    });

    const hybridStartTime = Date.now();
    const avgConfidence =
      computePageConfidencePrior(ocrResult) ??
      (ocrResult.pages.length > 0 ? 0.7 : 0.5);
    const hybridResult = await performHybridAssessment(
      extractedText,
      pageTextsForPipeline,
      avgConfidence,
      "THIN_OCR_TEXT",
      { hasOcrSignature: hasOcrSignatureEvidence(ocrResult) }
    );
    recordStage({
      stage: "Hybrid Assessment",
      status: hybridResult.success ? "success" : "failed",
      durationMs: Date.now() - hybridStartTime,
      error: hybridResult.error,
    });

    try {
      await db.updateJobSheetStatus(jobSheetId, "review_queue");
    } catch (error) {
      console.warn(
        "[DocumentProcessor] Could not update job sheet status:",
        error
      );
    }

    try {
      const auditResult = await db.createAuditResult({
        jobSheetId,
        goldSpecId: options.goldSpecId || 1,
        runId,
        result: "review_queue",
        confidenceScore: "0",
        documentStrategy: usedEmbeddedText ? "embedded_text" : "ocr",
        ocrEngineVersion: getOCREngineVersion(
          ocrResult.model,
          getOCRConfig(),
          ocrResult.provider
        ),
        pipelineVersion: PIPELINE_VERSION,
        reportJson: {
          summary: hybridResult.llmSummary || hybridResult.reviewExplanation,
          extractedText,
          extractedFields: Object.fromEntries(
            hybridResult.extractedFields.map(f => [
              f.field,
              {
                value: f.value,
                confidence: f.confidence,
                pageNumber: f.pageNumber,
              },
            ])
          ),
          pageCount: ocrResult.totalPages,
          processingStages: stages,
          modelRegistry: modelRegistryStamp(),
          ...ocrResilienceReportFields(ocrResult),
          hybridAssessment: hybridResult,
          thinTextGuard: {
            threshold: THIN_TEXT_CHAR_THRESHOLD,
            usedEmbeddedText,
          },
        },
        processingTimeMs: Date.now() - startTime,
      });

      finishProgress("review_queue");
      return {
        success: hybridResult.success,
        jobSheetId,
        auditResultId: auditResult.id,
        ocrResult,
        hybridAssessment: hybridResult,
        assessmentMode: "HYBRID",
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (dbError) {
      console.error(
        "[DocumentProcessor] Failed to store thin-text hybrid results:",
        dbError
      );
      finishProgress("failed");
      return {
        success: false,
        jobSheetId,
        ocrResult,
        hybridAssessment: hybridResult,
        assessmentMode: "HYBRID",
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  // SSOT: Ensure templates are ready before processing
  try {
    ensureTemplatesReady();
  } catch (error) {
    // SSOT violation - no templates available
    const errorMsg =
      error instanceof Error ? error.message : "SSOT validation failed";
    console.error(`[DocumentProcessor] SSOT violation: ${errorMsg}`);

    try {
      await db.updateJobSheetStatus(jobSheetId, "failed");
    } catch (dbError) {
      console.warn(
        "[DocumentProcessor] Could not update job sheet status:",
        dbError
      );
    }

    recordStage({
      stage: "Template Selection",
      status: "failed",
      durationMs: Date.now() - selectionStartTime,
      error: errorMsg,
    });

    finishProgress("failed");
    return {
      success: false,
      jobSheetId,
      ocrResult,
      processingStages: stages,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Log deprecation warning if legacy options are used
  if (options.goldSpecId || options.useLegacyPath) {
    console.warn(
      "[DocumentProcessor] DEPRECATED: goldSpecId/useLegacyPath options are ignored. " +
        "Use templateVersionId instead. Pipeline will use template selection."
    );
  }

  if (options.templateVersionId) {
    // Explicit template version provided - use directly
    const version = getTemplateVersion(options.templateVersionId);
    if (version) {
      spec = convertSpecJsonToGoldSpec(version.specJson);
      usedTemplateVersionId = version.id;
      recordStage(
        {
          stage: "Template Selection",
          status: "success",
          durationMs: Date.now() - selectionStartTime,
        },
        "Ensemble Extraction"
      );
    } else {
      // Template version not found - fail explicitly (no fallback)
      const errorMsg = `Template version ${options.templateVersionId} not found`;
      console.error(`[DocumentProcessor] ${errorMsg}`);

      try {
        await db.updateJobSheetStatus(jobSheetId, "failed");
      } catch (dbError) {
        console.warn(
          "[DocumentProcessor] Could not update job sheet status:",
          dbError
        );
      }

      recordStage({
        stage: "Template Selection",
        status: "failed",
        durationMs: Date.now() - selectionStartTime,
        error: errorMsg,
      });

      finishProgress("failed");
      return {
        success: false,
        jobSheetId,
        ocrResult,
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    }
  } else {
    // Auto-select template via multi-signal recognition (tokens + layout + ROI + plausibility)
    selectionResult = selectTemplateMultiSignal({
      documentText: extractedText,
      pageTexts: pageTextsForPipeline,
      metadata: { pageCount: ocrResult.totalPages },
    });

    if (!selectionResult.autoProcessingAllowed) {
      // LOW or ambiguous MEDIUM confidence - use HYBRID ASSESSMENT instead of stopping
      console.log(
        `[DocumentProcessor] Template selection blocked: ${selectionResult.blockReason}`
      );
      console.log(
        `[DocumentProcessor] Using hybrid assessment for fallback processing`
      );

      recordStage({
        stage: "Template Selection",
        status: "skipped",
        durationMs: Date.now() - selectionStartTime,
        error: selectionResult.blockReason,
      });

      // Determine review reason
      const reviewReason =
        selectionResult.topScore === 0
          ? ("TEMPLATE_NOT_MATCHED" as const)
          : selectionResult.confidenceBand === "LOW"
            ? ("LOW_TEMPLATE_CONFIDENCE" as const)
            : ("AMBIGUOUS_SELECTION" as const);

      // Perform hybrid assessment - NEVER FAIL, always provide partial results
      const hybridStartTime = Date.now();
      // Prefer OCR-4 page confidence when available; otherwise neutral prior.
      const avgConfidence =
        computePageConfidencePrior(ocrResult) ??
        (ocrResult.pages.length > 0 ? 0.7 : 0.5);

      const hybridResult = await performHybridAssessment(
        extractedText,
        pageTextsForPipeline,
        avgConfidence,
        reviewReason,
        { hasOcrSignature: hasOcrSignatureEvidence(ocrResult) }
      );

      recordStage({
        stage: "Hybrid Assessment",
        status: hybridResult.success ? "success" : "failed",
        durationMs: Date.now() - hybridStartTime,
        error: hybridResult.error,
      });

      // Update status to review_queue
      try {
        await db.updateJobSheetStatus(jobSheetId, "review_queue");
      } catch (error) {
        console.warn(
          "[DocumentProcessor] Could not update job sheet status:",
          error
        );
      }

      // Store partial audit result with hybrid data
      try {
        const auditResult = await db.createAuditResult({
          jobSheetId,
          goldSpecId: options.goldSpecId || 1,
          runId,
          result: "review_queue",
          confidenceScore: String(selectionResult.topScore),
          documentStrategy: usedEmbeddedText ? "embedded_text" : "ocr",
          ocrEngineVersion: getOCREngineVersion(
            ocrResult.model,
            getOCRConfig(),
            ocrResult.provider
          ),
          pipelineVersion: PIPELINE_VERSION,
          reportJson: {
            summary: hybridResult.llmSummary || hybridResult.reviewExplanation,
            extractedText,
            extractedFields: Object.fromEntries(
              hybridResult.extractedFields.map(f => [
                f.field,
                {
                  value: f.value,
                  confidence: f.confidence,
                  pageNumber: f.pageNumber,
                },
              ])
            ),
            pageCount: ocrResult.totalPages,
            processingStages: stages,
            modelRegistry: modelRegistryStamp(),
            ...ocrResilienceReportFields(ocrResult),
            hybridAssessment: hybridResult,
            selectionResult,
            selectionCohort: buildSelectionCohortMeta(selectionResult),
          },
          processingTimeMs: Date.now() - startTime,
        });

        // NOTE: The hybrid path's extracted fields are informational, not
        // defects. They are already persisted on reportJson.extractedFields
        // above. They are intentionally NOT written to audit_findings, whose
        // reasonCode is a fixed defect enum (no VALID/informational value) —
        // the previous 'VALID' insert would have failed against the NOT NULL
        // enum column at runtime.

        // Persist succeeded; overall success follows hybrid assessment outcome
        finishProgress("review_queue");
        return {
          success: hybridResult.success,
          jobSheetId,
          auditResultId: auditResult.id,
          ocrResult,
          selectionResult,
          hybridAssessment: hybridResult,
          assessmentMode: "HYBRID",
          processingStages: stages,
          totalDurationMs: Date.now() - startTime,
        };
      } catch (dbError) {
        console.error(
          "[DocumentProcessor] Failed to store hybrid results:",
          dbError
        );

        finishProgress("failed");
        return {
          success: false,
          jobSheetId,
          ocrResult,
          selectionResult,
          hybridAssessment: hybridResult,
          assessmentMode: "HYBRID",
          processingStages: stages,
          totalDurationMs: Date.now() - startTime,
        };
      }
    }

    // HIGH or clear MEDIUM confidence - proceed with selected template
    const version = getTemplateVersion(selectionResult.versionId!);
    if (version) {
      spec = convertSpecJsonToGoldSpec(version.specJson);
      usedTemplateVersionId = version.id;
      recordStage(
        {
          stage: "Template Selection",
          status: "success",
          durationMs: Date.now() - selectionStartTime,
        },
        "Ensemble Extraction"
      );
    } else {
      // Template version should exist at this point - fail explicitly
      const errorMsg = `Selected template version ${selectionResult.versionId} not found`;
      console.error(`[DocumentProcessor] ${errorMsg}`);

      try {
        await db.updateJobSheetStatus(jobSheetId, "failed");
      } catch (dbError) {
        console.warn(
          "[DocumentProcessor] Could not update job sheet status:",
          dbError
        );
      }

      recordStage({
        stage: "Template Selection",
        status: "failed",
        durationMs: Date.now() - selectionStartTime,
        error: errorMsg,
      });

      finishProgress("failed");
      return {
        success: false,
        jobSheetId,
        ocrResult,
        selectionResult,
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  // =========================================================================
  // Stage 1.75: Ensemble Extraction (PR-8) — FULL path only
  // Non-fatal: failures are logged and the pipeline continues to analyzer.
  // Never sets overallResult PASS on its own (preserves PR-3 fail-closed).
  // =========================================================================
  const ensembleStartTime = Date.now();
  let ensembleResult: EnsembleAdapterResult | null = null;

  if (isEnsembleExtractionEnabled()) {
    try {
      ensembleResult = await runEnsembleExtraction(extractedText, {
        filename: `job-sheet-${jobSheetId}`,
        settings: processingSettings,
        useLlm: processingSettings.llmFallbackEnabled,
        extractionMethod: "OCR",
      });
      recordStage(
        {
          stage: "Ensemble Extraction",
          status: ensembleResult ? "success" : "failed",
          durationMs: Date.now() - ensembleStartTime,
          error: ensembleResult ? undefined : "Ensemble returned null",
        },
        "AI Analysis"
      );
    } catch (ensembleError) {
      console.warn(
        "[DocumentProcessor] Ensemble extraction failed (non-fatal):",
        ensembleError
      );
      recordStage(
        {
          stage: "Ensemble Extraction",
          status: "failed",
          durationMs: Date.now() - ensembleStartTime,
          error:
            ensembleError instanceof Error
              ? ensembleError.message
              : "Ensemble extraction failed",
        },
        "AI Analysis"
      );
    }
  } else {
    recordStage(
      {
        stage: "Ensemble Extraction",
        status: "skipped",
        durationMs: Date.now() - ensembleStartTime,
      },
      "AI Analysis"
    );
  }

  // =========================================================================
  // Stage 1.85: Pipeline Integration (Phase 1.4) — FULL path only
  // Master-flagged and fail-soft; sub-flags are no-ops unless enabled.
  // Persists artifacts on reportJson without changing canonical analysis.
  // =========================================================================
  const pipelineIntegrationStartTime = Date.now();
  let pipelineIntegrationResult: PipelineOutput | null = null;

  if (process.env.FEATURE_PIPELINE_INTEGRATION === "true") {
    try {
      const fileContent = Buffer.from(extractedText, "utf-8");
      pipelineIntegrationResult = await processWithIntegration(
        {
          documentId: String(jobSheetId),
          fileContent,
          fileHash: sha256(fileContent),
          templateVersionId: usedTemplateVersionId,
          templateHash: sha256(JSON.stringify(spec)),
        },
        getFeatureFlagsFromEnv(),
        extractedText
      );
      recordStage(
        {
          stage: "Pipeline Integration",
          status: "success",
          durationMs: Date.now() - pipelineIntegrationStartTime,
        },
        "AI Analysis"
      );
    } catch (pipelineIntegrationError) {
      console.warn(
        "[DocumentProcessor] Pipeline integration failed (non-fatal):",
        pipelineIntegrationError
      );
      recordStage(
        {
          stage: "Pipeline Integration",
          status: "failed",
          durationMs: Date.now() - pipelineIntegrationStartTime,
          error:
            pipelineIntegrationError instanceof Error
              ? pipelineIntegrationError.message
              : "Pipeline integration failed",
        },
        "AI Analysis"
      );
    }
  } else {
    recordStage(
      {
        stage: "Pipeline Integration",
        status: "skipped",
        durationMs: Date.now() - pipelineIntegrationStartTime,
      },
      "AI Analysis"
    );
  }

  // Stage 2: AI Analysis
  const analysisStartTime = Date.now();
  let analysisResult: AnalysisResult;

  try {
    analysisResult = await analyzeJobSheet(
      extractedText,
      spec,
      ocrResult.totalPages,
      {
        jobSheetId,
        confidenceThreshold: processingSettings.llmConfidenceThreshold,
        preExtractedFields: ensembleResult?.ensembleExtractedFields,
        preExtractedHintsBlock: ensembleResult
          ? formatPreExtractedHints(
              ensembleResult.ensembleExtractedFields,
              ensembleResult.artifact.fieldDetails
            )
          : undefined,
      }
    );
    recordStage(
      {
        stage: "AI Analysis",
        status: analysisResult.success ? "success" : "failed",
        durationMs: Date.now() - analysisStartTime,
        error: analysisResult.error,
      },
      "Store Results"
    );
  } catch (error) {
    analysisResult = {
      success: false,
      overallResult: "REVIEW_QUEUE",
      score: 0,
      findings: [],
      extractedFields: {},
      summary: "Analysis failed",
      processingTimeMs: Date.now() - analysisStartTime,
      model: "gemini-2.5-pro",
      error: error instanceof Error ? error.message : "Analysis failed",
    };
    recordStage(
      {
        stage: "AI Analysis",
        status: "failed",
        durationMs: Date.now() - analysisStartTime,
        error: analysisResult.error,
      },
      "Store Results"
    );
  }

  // Threshold: analyzer score below LLM confidence → force review_queue (LOW_LLM_CONFIDENCE)
  const llmThreshold = processingSettings.llmConfidenceThreshold ?? 70;
  if (
    analysisResult.success &&
    analysisResult.overallResult !== "REVIEW_QUEUE" &&
    analysisResult.score < llmThreshold
  ) {
    console.warn(
      `[DocumentProcessor] Analyzer score below LLM confidence threshold`,
      {
        jobSheetId,
        score: analysisResult.score,
        llmThreshold,
      }
    );
    analysisResult = {
      ...analysisResult,
      overallResult: "REVIEW_QUEUE",
      summary:
        `${analysisResult.summary} ` +
        `[LOW_LLM_CONFIDENCE] Score ${analysisResult.score} is below confidence threshold ${llmThreshold}; queued for human review.`,
      findings: [
        ...analysisResult.findings,
        {
          ruleId: "SYSTEM",
          fieldName: "Overall Confidence",
          severity: "S2" as const,
          reasonCode: "LOW_CONFIDENCE" as const,
          rawSnippet: "",
          normalisedSnippet: "",
          confidence: analysisResult.score,
          pageNumber: 1,
          whyItMatters: `Analyzer score ${analysisResult.score} is below llmConfidenceThreshold ${llmThreshold}.`,
          suggestedFix:
            "Review the document manually before accepting the result.",
        },
      ],
    };
  }

  // Soft OCR gate: after judgment, still force human review when page OCR prior was low.
  // Never skip Gemini — only demote PASS/FAIL → REVIEW_QUEUE with an explicit finding.
  if (lowOcrConfidence && analysisResult.overallResult !== "FAIL") {
    const ocrPct = Math.round((pageConfidencePrior ?? 0) * 100);
    analysisResult = {
      ...analysisResult,
      overallResult: "REVIEW_QUEUE",
      summary:
        `${analysisResult.summary} ` +
        `[LOW_OCR_CONFIDENCE] Page OCR confidence ${ocrPct}% is below threshold ${processingSettings.ocrConfidenceThreshold}; queued for human review after judgment.`,
      findings: [
        ...analysisResult.findings,
        {
          ruleId: "SYSTEM",
          fieldName: "OCR Confidence",
          severity: "S2" as const,
          reasonCode: "LOW_CONFIDENCE" as const,
          rawSnippet: "",
          normalisedSnippet: "",
          confidence: ocrPct,
          pageNumber: 1,
          whyItMatters: `OCR page confidence prior ${pageConfidencePrior} is below ocrConfidenceThreshold ${ocrThreshold}.`,
          suggestedFix:
            "Review the scan quality and extracted fields before accepting the result.",
        },
      ],
    };
  }

  // Ensemble consensus → review_queue on CONFLICT / low confidence required fields
  // Does not override FAIL; never promotes to PASS.
  if (
    ensembleResult?.reviewSignals.reviewRequired &&
    analysisResult.overallResult !== "FAIL"
  ) {
    const ensembleFindings = buildEnsembleReviewFindings(
      ensembleResult.reviewSignals,
      ensembleResult.artifact.fieldDetails,
      llmThreshold
    );
    const reasonTags = [
      ...ensembleResult.reviewSignals.conflictFields.map(
        () => "ENSEMBLE_CONFLICT"
      ),
      ...ensembleResult.reviewSignals.lowConfidenceFields.map(
        () => "ENSEMBLE_LOW_CONFIDENCE"
      ),
      ...ensembleResult.reviewSignals.missingRequired.map(
        () => "ENSEMBLE_MISSING_REQUIRED"
      ),
    ];
    analysisResult = {
      ...analysisResult,
      overallResult: "REVIEW_QUEUE",
      summary:
        `${analysisResult.summary} ` +
        `[ENSEMBLE] Consensus review required (${reasonTags.join(", ")}).`,
      findings: [...analysisResult.findings, ...ensembleFindings],
    };
  }

  // Finding hygiene: suppress garbage MISSING_FIELD / nonsense conflicts
  {
    const beforeCount = analysisResult.findings.length;
    const cleaned = applyFindingHygiene(analysisResult.findings, {
      preExtractedFields: ensembleResult?.ensembleExtractedFields,
      confidenceThreshold: llmThreshold,
    });
    if (cleaned.length !== beforeCount) {
      analysisResult = {
        ...analysisResult,
        findings: cleaned,
        summary:
          `${analysisResult.summary} ` +
          `[FINDING_HYGIENE] Reduced findings ${beforeCount}→${cleaned.length}.`,
      };
      recordStage({
        stage: "Finding Hygiene",
        status: "success",
        durationMs: 0,
      });
    } else {
      analysisResult = { ...analysisResult, findings: cleaned };
    }
  }

  // =========================================================================
  // Stage 2.5: Shadow / champion-challenger (PR-21)
  // Runs challenger without affecting canonical results unless canary samples.
  // Fail-soft: errors never fail the pipeline. Persisted on reportJson only.
  // =========================================================================
  const shadowStartTime = Date.now();
  let shadowComparison: ShadowComparison | null = null;

  if (isShadowChallengerEnabled()) {
    try {
      const shadowEval = await evaluateShadowChallenger({
        extractedText,
        goldSpec: spec,
        pageCount: ocrResult.totalPages,
        champion: analysisResult,
        jobSheetId,
        sampleKey: runId,
      });
      shadowComparison = shadowEval.comparison;
      if (shadowEval.canaryApplied && shadowEval.servedAnalysis) {
        console.log(
          "[DocumentProcessor] Shadow canary applied challenger result",
          {
            jobSheetId,
            champion: analysisResult.overallResult,
            challenger: shadowEval.servedAnalysis.overallResult,
          }
        );
        analysisResult = shadowEval.servedAnalysis;
      }
      recordStage(
        {
          stage: "Shadow Challenger",
          status: shadowComparison ? "success" : "skipped",
          durationMs: Date.now() - shadowStartTime,
        },
        "Store Results"
      );
    } catch (shadowError) {
      console.warn(
        "[DocumentProcessor] Shadow challenger failed (non-fatal):",
        shadowError
      );
      recordStage(
        {
          stage: "Shadow Challenger",
          status: "failed",
          durationMs: Date.now() - shadowStartTime,
          error:
            shadowError instanceof Error
              ? shadowError.message
              : "Shadow challenger failed",
        },
        "Store Results"
      );
    }
  } else {
    recordStage(
      {
        stage: "Shadow Challenger",
        status: "skipped",
        durationMs: Date.now() - shadowStartTime,
      },
      "Store Results"
    );
  }

  const flaggedProcessorArtifacts = buildFlaggedProcessorArtifacts({
    jobSheetId,
    ocrResult,
    analysisResult,
    stages,
    processingSettings,
    selectionResult,
    usedTemplateVersionId,
  });

  // Stage 3: Store Results
  const storageStartTime = Date.now();
  let auditResultId: number | undefined;

  try {
    // Determine final status
    const finalStatus =
      analysisResult.overallResult === "PASS"
        ? "completed"
        : analysisResult.overallResult === "REVIEW_QUEUE"
          ? "review_queue"
          : "completed";

    console.log(`[DocumentProcessor] Setting final status`, {
      jobSheetId,
      analyzerResult: analysisResult.overallResult,
      finalStatus,
      score: analysisResult.score,
    });

    // Update job sheet status
    await db.updateJobSheetStatus(jobSheetId, finalStatus);

    // Create audit result with correct schema fields
    const auditResult = await db.createAuditResult({
      jobSheetId,
      goldSpecId: options.goldSpecId || 1, // Default to spec ID 1 if not provided
      runId,
      result: analysisResult.overallResult.toLowerCase() as
        | "pass"
        | "fail"
        | "review_queue",
      confidenceScore: String(analysisResult.score),
      documentStrategy: usedEmbeddedText ? "embedded_text" : "ocr",
      ocrEngineVersion: getOCREngineVersion(
        ocrResult.model,
        getOCRConfig(),
        ocrResult.provider
      ),
      pipelineVersion: PIPELINE_VERSION,
      reportJson: {
        summary: analysisResult.summary,
        extractedText,
        extractedFields: ensembleResult
          ? mergeExtractedFields(
              analysisResult.extractedFields,
              ensembleResult.ensembleExtractedFields
            )
          : analysisResult.extractedFields,
        pageCount: ocrResult.totalPages,
        ...(typeof pageConfidencePrior === "number"
          ? {
              pageConfidencePrior,
              ocrConfidenceThreshold: processingSettings.ocrConfidenceThreshold,
              lowOcrConfidence,
            }
          : {}),
        processingStages: stages,
        modelRegistry: modelRegistryStamp(),
        ...(ensembleResult
          ? { ensembleExtraction: ensembleResult.artifact }
          : {}),
        ...(pipelineIntegrationResult
          ? { pipelineIntegration: pipelineIntegrationResult }
          : {}),
        ...(shadowComparison ? { shadowComparison } : {}),
        ...(flaggedProcessorArtifacts
          ? { featureFlagArtifacts: flaggedProcessorArtifacts }
          : {}),
        ...ocrResilienceReportFields(ocrResult),
        ...(selectionResult ? { selectionResult } : {}),
        selectionCohort: buildSelectionCohortMeta(
          selectionResult,
          usedTemplateVersionId
        ),
      },
      processingTimeMs: Date.now() - startTime,
    });

    auditResultId = auditResult.id;

    // Create audit findings (enrich with OCR-4 bboxes/confidence when available)
    if (analysisResult.findings.length > 0) {
      let findingsForInsert = analysisResult.findings;
      try {
        findingsForInsert = enrichFindingsWithOcrEvidence(
          analysisResult.findings,
          ocrResult
        );
      } catch (enrichError) {
        // Enrichment must NEVER fail the pipeline
        console.warn(
          "[DocumentProcessor] OCR finding enrichment failed:",
          enrichError
        );
      }

      const findingsToInsert = findingsForInsert.map(finding => ({
        auditResultId: auditResult.id,
        severity: finding.severity as "S0" | "S1" | "S2" | "S3",
        reasonCode: finding.reasonCode as any,
        fieldName: finding.fieldName,
        pageNumber: finding.pageNumber,
        boundingBox: finding.boundingBox || null,
        rawSnippet: finding.rawSnippet || "",
        normalisedSnippet: finding.normalisedSnippet || "",
        confidence: String(finding.confidence),
        ruleId: finding.ruleId,
        whyItMatters: finding.whyItMatters,
        suggestedFix: finding.suggestedFix,
      }));

      await db.createAuditFindings(findingsToInsert);
    }

    // Log the action
    if (options.userId) {
      await db.logAction({
        userId: options.userId,
        action: "PROCESS_JOB_SHEET",
        entityType: "job_sheet",
        entityId: jobSheetId,
        details: {
          runId,
          result: analysisResult.overallResult,
          score: analysisResult.score,
          findingsCount: analysisResult.findings.length,
          processingTimeMs: Date.now() - startTime,
        },
      });
    }

    recordStage({
      stage: "Store Results",
      status: "success",
      durationMs: Date.now() - storageStartTime,
    });
  } catch (error) {
    console.error("[DocumentProcessor] Failed to store results:", error);
    recordStage({
      stage: "Store Results",
      status: "failed",
      durationMs: Date.now() - storageStartTime,
      error: error instanceof Error ? error.message : "Storage failed",
    });
  }

  const storageFailed = stages.some(
    s => s.stage === "Store Results" && s.status === "failed"
  );

  const terminalStatus: JobSheetProcessStatus = storageFailed
    ? "failed"
    : analysisResult.overallResult === "REVIEW_QUEUE"
      ? "review_queue"
      : "completed";
  finishProgress(terminalStatus);

  return {
    success: analysisResult.success && !storageFailed && !!auditResultId,
    jobSheetId,
    auditResultId,
    ocrResult,
    analysisResult,
    selectionResult,
    assessmentMode: "FULL",
    processingStages: stages,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Reprocess a job sheet with a different Gold Standard spec
 */
export async function reprocessJobSheet(
  jobSheetId: number,
  goldSpecId: number,
  userId?: number
): Promise<ProcessingResult> {
  return orchestrateJobSheetProcessing({
    source: "reprocess",
    jobSheetId,
    goldSpecId,
    userId,
  });
}

/**
 * Reprocess a job sheet with a specific template version
 */
export async function reprocessWithTemplate(
  jobSheetId: number,
  templateVersionId: number,
  userId?: number
): Promise<ProcessingResult> {
  return orchestrateJobSheetProcessing({
    source: "template-reprocess",
    jobSheetId,
    templateVersionId,
    userId,
  });
}

/**
 * Convert template specJson to GoldSpec format for analyzer
 */
function convertSpecJsonToGoldSpec(specJson: any): GoldSpec {
  return {
    name: specJson.name || "Template Spec",
    version: specJson.version || "1.0.0",
    rules: (specJson.rules || []).map((rule: any) => ({
      id: rule.ruleId,
      field: rule.field,
      type: rule.type === "required" ? "presence" : rule.type,
      required: rule.type === "required",
      description: rule.description || "",
      pattern: rule.pattern,
      format: rule.pattern,
    })),
  };
}
