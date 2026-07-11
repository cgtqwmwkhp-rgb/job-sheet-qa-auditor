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
  fetchPdfBuffer,
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
  aliasCanonicalExtractedFields,
  type EnsembleAdapterResult,
} from "./ensembleExtraction";
import {
  applyFindingHygiene,
  hasSignatureLabelEvidence,
  hasVorBannerEvidence,
  hasOnlyInformationalFindings,
  sanitizeExtractedFieldsForSignatures,
} from "./findingHygiene";
import {
  evaluateJobSummaryConsistency,
  type FailurePathSignals,
} from "./jobSummaryConsistency";
import {
  evaluateWastedJourneyConsistency,
  isWastedJourneyDocument,
  isWastedJourneyExcludedField,
  mergeWastedJourneyFindings,
  WASTED_JOURNEY_TEMPLATE_ID,
} from "./wastedJourneyConsistency";
import { computeDocumentationQualityScore } from "./documentationQuality";
import { evaluatePhotoEvidenceConsistency } from "./photoEvidence";
import { applyAuditPolicy, resolveAuditFormFamily } from "./auditPolicy";
import {
  runSelectionMarkDetection,
  isSelectionMarksEnabled,
  reconcileSelectionMarksWithJudgment,
  hasBlockingFailMarks,
  countHighConfidenceFailMarks,
  type SelectionMarksResult,
} from "./selectionMarks";
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
import {
  isGeminiMultimodalEnabled,
  verifySignatureInk,
  VLM_PDF_MAX_BYTES,
  type SignatureInkVerificationResult,
} from "./vlmInkVerification";
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
      note: "Ink verification runs via PDF document path when FEATURE_VLM_VERIFICATION is on.",
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
        "Selection Marks"
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
        "Selection Marks"
      );
    }
  } else {
    recordStage(
      {
        stage: "Ensemble Extraction",
        status: "skipped",
        durationMs: Date.now() - ensembleStartTime,
      },
      "Selection Marks"
    );
  }

  // =========================================================================
  // Stage 1.78: Selection Marks (Azure DI prebuilt-layout) — fail-soft
  // Visual radio/checkbox state (Ok/Adv/Fail/N/A) for Gemini hints + artifact.
  // =========================================================================
  const selectionMarksStartTime = Date.now();
  let selectionMarksResult: SelectionMarksResult | null = null;

  if (isSelectionMarksEnabled()) {
    try {
      selectionMarksResult = await runSelectionMarkDetection(documentUrl, {
        headerText: extractedText.slice(0, 4000),
      });
      const marksOk =
        !!selectionMarksResult && !selectionMarksResult.artifact.error;
      recordStage(
        {
          stage: "Selection Marks",
          status: marksOk ? "success" : "failed",
          durationMs: Date.now() - selectionMarksStartTime,
          error: marksOk
            ? undefined
            : selectionMarksResult?.artifact.error ||
              "Selection marks returned null",
        },
        "Pipeline Integration"
      );
    } catch (selectionMarksError) {
      console.warn(
        "[DocumentProcessor] Selection marks failed (non-fatal):",
        selectionMarksError
      );
      recordStage(
        {
          stage: "Selection Marks",
          status: "failed",
          durationMs: Date.now() - selectionMarksStartTime,
          error:
            selectionMarksError instanceof Error
              ? selectionMarksError.message
              : "Selection marks failed",
        },
        "Pipeline Integration"
      );
    }
  } else {
    recordStage(
      {
        stage: "Selection Marks",
        status: "skipped",
        durationMs: Date.now() - selectionMarksStartTime,
      },
      "Pipeline Integration"
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

  // Stage 1.9: Fetch PDF once for VLM ink + Gemini multimodal (fail-soft)
  const pdfFetchStart = Date.now();
  let sharedPdfBuffer: Buffer | null = null;
  try {
    sharedPdfBuffer = await fetchPdfBuffer(documentUrl);
    recordStage({
      stage: "PDF Buffer Fetch",
      status: sharedPdfBuffer ? "success" : "skipped",
      durationMs: Date.now() - pdfFetchStart,
      error: sharedPdfBuffer ? undefined : "PDF_FETCH_EMPTY",
    });
  } catch (pdfErr) {
    recordStage({
      stage: "PDF Buffer Fetch",
      status: "failed",
      durationMs: Date.now() - pdfFetchStart,
      error: pdfErr instanceof Error ? pdfErr.message : "pdf fetch failed",
    });
  }

  // Stage 1.95: Anthropic VLM signature ink verification (fail-soft)
  let vlmInkResult: SignatureInkVerificationResult | null = null;
  const vlmStart = Date.now();
  if (isVlmVerificationEnabled()) {
    try {
      vlmInkResult = await verifySignatureInk({
        documentUrl,
        pdfBuffer: sharedPdfBuffer,
        disputed: true,
        disputeReason:
          "OCR cannot see handwritten ink; verify Technician/Customer Signature area",
        extractionConfidence: 0.4,
      });
      recordStage({
        stage: "VLM Ink Verification",
        status: vlmInkResult.ran ? "success" : "skipped",
        durationMs: Date.now() - vlmStart,
        error: vlmInkResult.skippedReason,
      });
    } catch (vlmErr) {
      console.warn(
        "[DocumentProcessor] VLM ink verification failed (non-fatal):",
        vlmErr
      );
      recordStage({
        stage: "VLM Ink Verification",
        status: "failed",
        durationMs: Date.now() - vlmStart,
        error: vlmErr instanceof Error ? vlmErr.message : "vlm failed",
      });
    }
  } else {
    recordStage({
      stage: "VLM Ink Verification",
      status: "skipped",
      durationMs: 0,
    });
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
        documentAttachment: (() => {
          if (!isGeminiMultimodalEnabled()) return undefined;
          if (
            !sharedPdfBuffer ||
            sharedPdfBuffer.length === 0 ||
            sharedPdfBuffer.length > VLM_PDF_MAX_BYTES
          ) {
            return undefined;
          }
          return {
            dataBase64: sharedPdfBuffer.toString("base64"),
            mimeType: "application/pdf" as const,
          };
        })(),
        preExtractedFields: (() => {
          const base = aliasCanonicalExtractedFields({
            ...(ensembleResult?.ensembleExtractedFields ?? {}),
            ...(selectionMarksResult?.preExtractedFields ?? {}),
          });
          // Text-layer signature label → Present hint for Gemini (ink not in OCR)
          if (
            hasSignatureLabelEvidence(extractedText) &&
            !base.customerSignature &&
            !base.engineerSignOff
          ) {
            const present = {
              value: "Present",
              confidence: 75,
              pageNumber: 1,
            };
            base.customerSignature = present;
            base.engineerSignOff = present;
          }
          // Anthropic VLM ink result overrides / strengthens signature hint
          if (vlmInkResult?.preExtractedHint) {
            base.customerSignature = vlmInkResult.preExtractedHint;
            base.engineerSignOff = vlmInkResult.preExtractedHint;
          }
          if (hasVorBannerEvidence(extractedText) && !base.vorStatus) {
            base.vorStatus = {
              value: "Present",
              confidence: 85,
              pageNumber: 1,
            };
          }
          return Object.keys(base).length > 0 ? base : undefined;
        })(),
        preExtractedHintsBlock: (() => {
          const fields = aliasCanonicalExtractedFields({
            ...(ensembleResult?.ensembleExtractedFields ?? {}),
            ...(selectionMarksResult?.preExtractedFields ?? {}),
          });
          if (
            hasSignatureLabelEvidence(extractedText) &&
            !fields.customerSignature &&
            !fields.engineerSignOff
          ) {
            const present = {
              value: "Present",
              confidence: 75,
              pageNumber: 1,
            };
            fields.customerSignature = present;
            fields.engineerSignOff = present;
          }
          if (vlmInkResult?.preExtractedHint) {
            fields.customerSignature = vlmInkResult.preExtractedHint;
            fields.engineerSignOff = vlmInkResult.preExtractedHint;
          }
          if (hasVorBannerEvidence(extractedText) && !fields.vorStatus) {
            fields.vorStatus = {
              value: "Present",
              confidence: 85,
              pageNumber: 1,
            };
          }
          const block = formatPreExtractedHints(
            fields,
            ensembleResult?.artifact.fieldDetails
          );
          const sigNote = hasSignatureLabelEvidence(extractedText)
            ? "\n\nNote: Signature label/box detected in text. Handwritten ink is usually invisible to OCR — do not mark signature Absent/MISSING solely for lack of ink text."
            : "";
          const vorNote = hasVorBannerEvidence(extractedText)
            ? "\n\nNote: VOR banner detected — record vorStatus as Present. Do not invent Engineer Comments / Work Notes as MISSING_FIELD when those fields are optional on this template."
            : "\n\nNote: Do not emit MISSING_FIELD for optional Work Notes / Engineer Comments on Job Summary forms.";
          const vlmNote =
            vlmInkResult?.ran && vlmInkResult.imageQa?.vlmUsed
              ? `\n\nNote: Anthropic VLM ink verification → ${vlmInkResult.preExtractedHint?.value ?? "inconclusive"} @ ${Math.round((vlmInkResult.imageQa.confidence || 0) * 100)}% (${vlmInkResult.imageQa.details || ""}). Prefer this over OCR absence for signatures.`
              : "";
          const marksNote = selectionMarksResult?.hintsBlock
            ? `\n\n${selectionMarksResult.hintsBlock}`
            : "";
          const multimodalNote =
            isGeminiMultimodalEnabled() && sharedPdfBuffer
              ? "\n\nNote: The original PDF is attached for multimodal review — verify handwritten signatures and visual marks against the page image."
              : "";
          const combined =
            `${block || ""}${sigNote}${vorNote}${vlmNote}${marksNote}${multimodalNote}`.trim();
          return combined || undefined;
        })(),
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

  // Selection marks → first-class findings (visual ground truth, not Gemini-dependent)
  if (selectionMarksResult?.artifact.rows.length) {
    analysisResult = {
      ...analysisResult,
      findings: reconcileSelectionMarksWithJudgment(
        analysisResult.findings,
        selectionMarksResult.artifact
      ),
    };
    if (
      hasBlockingFailMarks(selectionMarksResult.artifact) &&
      analysisResult.overallResult === "PASS"
    ) {
      analysisResult = {
        ...analysisResult,
        overallResult: "REVIEW_QUEUE",
        summary:
          `${analysisResult.summary} ` +
          `[SELECTION_MARKS] High-confidence Fail mark(s) detected; queued for review.`,
      };
    }
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
          severity: "S3" as const,
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
          severity: "S3" as const,
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
  // Filter optional template fields (e.g. workDescription) out of missingRequired.
  // Wasted Journey: never require job number or serial number.
  {
    const templateVersion = usedTemplateVersionId
      ? getTemplateVersion(usedTemplateVersionId)
      : null;
    const selectedSlug =
      buildSelectionCohortMeta(selectionResult, usedTemplateVersionId)
        ?.templateSlug ?? null;
    const isWastedJourney =
      selectedSlug === WASTED_JOURNEY_TEMPLATE_ID ||
      isWastedJourneyDocument(extractedText);

    const optionalFieldIds = new Set(
      (
        (
          templateVersion?.specJson as {
            fields?: Array<{ field: string; required?: boolean }>;
          }
        )?.fields ?? []
      )
        .filter(f => f.required === false)
        .map(f => f.field)
    );

    const dropEnsembleField = (field: string) => {
      if (optionalFieldIds.has(field)) return true;
      if (isWastedJourney && isWastedJourneyExcludedField(field)) return true;
      return false;
    };

    if (
      ensembleResult?.reviewSignals.reviewRequired &&
      analysisResult.overallResult !== "FAIL"
    ) {
      const filteredMissing =
        ensembleResult.reviewSignals.missingRequired.filter(
          f => !dropEnsembleField(f)
        );
      const filteredLow =
        ensembleResult.reviewSignals.lowConfidenceFields.filter(
          f => !dropEnsembleField(f)
        );
      const filteredConflicts =
        ensembleResult.reviewSignals.conflictFields.filter(
          f => !dropEnsembleField(f)
        );
      const stillRequired =
        filteredConflicts.length > 0 ||
        filteredMissing.length > 0 ||
        filteredLow.length > 0;

      if (stillRequired) {
        const filteredSignals = {
          ...ensembleResult.reviewSignals,
          missingRequired: filteredMissing,
          lowConfidenceFields: filteredLow,
          conflictFields: filteredConflicts,
          reviewRequired: true,
        };
        const ensembleFindings = buildEnsembleReviewFindings(
          filteredSignals,
          ensembleResult.artifact.fieldDetails,
          llmThreshold
        ).filter(f => {
          if (isWastedJourney && isWastedJourneyExcludedField(f.fieldName)) {
            return false;
          }
          // Drop Engineer Comments / Work Notes when workDescription is optional
          if (
            optionalFieldIds.has("workDescription") &&
            /engineer\s*comments|work\s*notes|workDescription|comments/i.test(
              f.fieldName
            )
          ) {
            return false;
          }
          return true;
        });
        const reasonTags = [
          ...filteredSignals.conflictFields.map(() => "ENSEMBLE_CONFLICT"),
          ...filteredSignals.lowConfidenceFields.map(
            () => "ENSEMBLE_LOW_CONFIDENCE"
          ),
          ...filteredSignals.missingRequired.map(
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
    }
  }

  // Finding hygiene: suppress garbage MISSING_FIELD / nonsense conflicts
  {
    const signatureLabelPresent = hasSignatureLabelEvidence(extractedText);
    const hasOcrSignature = hasOcrSignatureEvidence(ocrResult);
    const vlmSaysPresent = vlmInkResult?.preExtractedHint?.value === "Present";
    const vlmSaysAbsent = vlmInkResult?.preExtractedHint?.value === "Absent";
    const templateVersion = usedTemplateVersionId
      ? getTemplateVersion(usedTemplateVersionId)
      : null;
    const optionalTemplateFields = (
      (
        templateVersion?.specJson as {
          fields?: Array<{
            field: string;
            required?: boolean;
            aliases?: string[];
          }>;
        }
      )?.fields ?? []
    )
      .filter(f => f.required === false)
      .map(f => f.field);
    const optionalFieldAliases = (
      (
        templateVersion?.specJson as {
          fields?: Array<{
            field: string;
            required?: boolean;
            aliases?: string[];
          }>;
        }
      )?.fields ?? []
    )
      .filter(f => f.required === false)
      .flatMap(f => f.aliases ?? []);

    const beforeCount = analysisResult.findings.length;
    let cleaned = applyFindingHygiene(analysisResult.findings, {
      preExtractedFields: aliasCanonicalExtractedFields({
        ...(ensembleResult?.ensembleExtractedFields ?? {}),
        ...(selectionMarksResult?.preExtractedFields ?? {}),
        ...(vlmInkResult?.preExtractedHint
          ? {
              customerSignature: vlmInkResult.preExtractedHint,
              engineerSignOff: vlmInkResult.preExtractedHint,
            }
          : {}),
        ...(hasVorBannerEvidence(extractedText)
          ? {
              vorStatus: {
                value: "Present",
                confidence: 85,
                pageNumber: 1,
              },
            }
          : {}),
      }),
      confidenceThreshold: llmThreshold,
      signatureLabelPresent: signatureLabelPresent && !vlmSaysAbsent,
      hasOcrSignature: hasOcrSignature || vlmSaysPresent,
      documentText: extractedText,
      optionalTemplateFields,
      optionalFieldAliases,
    });

    // Wasted Journey: drop job number / serial noise from any stage
    const hygieneSlug =
      buildSelectionCohortMeta(selectionResult, usedTemplateVersionId)
        ?.templateSlug ?? null;
    if (
      hygieneSlug === WASTED_JOURNEY_TEMPLATE_ID ||
      isWastedJourneyDocument(extractedText)
    ) {
      cleaned = cleaned.filter(f => !isWastedJourneyExcludedField(f.fieldName));
    }
    const sanitizedFields = sanitizeExtractedFieldsForSignatures(
      analysisResult.extractedFields,
      {
        signatureLabelPresent: signatureLabelPresent && !vlmSaysAbsent,
        hasOcrSignature: hasOcrSignature || vlmSaysPresent,
      }
    );
    const findingsChanged =
      JSON.stringify(cleaned) !== JSON.stringify(analysisResult.findings);
    const fieldsChanged =
      JSON.stringify(sanitizedFields) !==
      JSON.stringify(analysisResult.extractedFields);

    if (findingsChanged || fieldsChanged) {
      // If we removed/converted signature Absents that caused FAIL, demote to
      // review_queue rather than leaving a FAIL with no supporting S0/S1 findings.
      let overallResult = analysisResult.overallResult;
      if (
        analysisResult.overallResult === "FAIL" &&
        !cleaned.some(
          f =>
            (f.severity === "S0" || f.severity === "S1") &&
            f.reasonCode !== "LOW_CONFIDENCE"
        )
      ) {
        overallResult = "REVIEW_QUEUE";
      }
      analysisResult = {
        ...analysisResult,
        overallResult,
        extractedFields: sanitizedFields,
        findings: cleaned,
        summary:
          `${analysisResult.summary} ` +
          `[FINDING_HYGIENE] Findings ${beforeCount}→${cleaned.length}` +
          (signatureLabelPresent || hasOcrSignature
            ? "; signature label/OCR evidence applied."
            : ".") +
          (hasVorBannerEvidence(extractedText) ? " VOR banner recorded." : ""),
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

  // Form-family consistency: Wasted Journey vs Job Summary failure-path.
  // Never run repair/VOR failure-path rules on wasted-journey sheets.
  // Hard-fail vs score-only is decided by Admin Audit Policy after merge (not here).
  let auditFormFamily = resolveAuditFormFamily(null, false);
  let failurePathSignals: FailurePathSignals | null = null;
  let failurePathSignalSummary: string | null = null;
  {
    const selectedSlug =
      buildSelectionCohortMeta(selectionResult, usedTemplateVersionId)
        ?.templateSlug ?? null;
    const isWastedJourney =
      selectedSlug === WASTED_JOURNEY_TEMPLATE_ID ||
      isWastedJourneyDocument(extractedText);
    auditFormFamily = resolveAuditFormFamily(selectedSlug, isWastedJourney);

    if (isWastedJourney) {
      const consistency = evaluateWastedJourneyConsistency(extractedText);
      if (consistency.findings.length > 0) {
        analysisResult = {
          ...analysisResult,
          findings: mergeWastedJourneyFindings(
            analysisResult.findings,
            consistency.findings
          ),
          summary:
            `${analysisResult.summary} ` +
            `[WASTED_JOURNEY] ${consistency.summary}`,
        };
        recordStage({
          stage: "Wasted Journey Consistency",
          status: "success",
          durationMs: 0,
          error: consistency.hasBlockingIssues
            ? consistency.summary
            : undefined,
        });
      }
    } else {
      const failMarkCount = countHighConfidenceFailMarks(
        selectionMarksResult?.artifact
      );
      // Prefer Azure DI layout text for completion-block evaluation when
      // available — it preserves grid structure that Mistral OCR flattens.
      const jsrText = selectionMarksResult?.layoutText || extractedText;
      const consistency = evaluateJobSummaryConsistency(jsrText, {
        failMarkCount,
      });
      failurePathSignals = consistency.signals;
      const jsrTextSource = selectionMarksResult?.layoutText
        ? "azure-layout"
        : "ocr-primary";
      failurePathSignalSummary = [
        `VOR=${consistency.signals.vor}`,
        `SafeToUse=${consistency.signals.unsafe ? "No" : consistency.signals.safeYes ? "Yes" : "Unknown"}`,
        `ReturnVisit=${consistency.signals.returnVisit ? "Yes" : consistency.signals.returnVisitNo ? "No" : "Unknown"}`,
        `Incomplete=${consistency.signals.incomplete ? "Yes" : consistency.signals.worksCompleteYes ? "No" : "Unknown"}`,
        `FailMarks=${consistency.signals.failMarkCount}`,
        `PartsStillRequired=${consistency.signals.partsStillRequired}`,
        `TextSource=${jsrTextSource}`,
      ].join(" | ");
      if (consistency.findings.length > 0) {
        analysisResult = {
          ...analysisResult,
          findings: [...analysisResult.findings, ...consistency.findings],
          summary:
            `${analysisResult.summary} ` +
            `[FAILURE_PATH] ${consistency.summary}`,
        };
        recordStage({
          stage: "Failure Path Consistency",
          status: "success",
          durationMs: 0,
          error: consistency.hasBlockingIssues
            ? consistency.summary
            : undefined,
        });
      }
    }
  }

  // Photo evidence scaffold (PHOTO-C010): advisory when parts/repairs present
  if (!isWastedJourneyDocument(extractedText)) {
    const photoResult = evaluatePhotoEvidenceConsistency(extractedText);
    if (photoResult.findings.length > 0) {
      analysisResult = {
        ...analysisResult,
        findings: [...analysisResult.findings, ...photoResult.findings],
        summary: `${analysisResult.summary} [PHOTO_EVIDENCE] ${photoResult.summary}`,
      };
      recordStage({
        stage: "Photo Evidence",
        status: "success",
        durationMs: 0,
      });
    }
  }

  // Promote REVIEW_QUEUE → PASS when only informational S3 findings remain
  // (e.g. OCR Confidence soft-gate + Present field injections) and score is strong.
  if (
    analysisResult.overallResult === "REVIEW_QUEUE" &&
    analysisResult.score >= llmThreshold &&
    hasOnlyInformationalFindings(analysisResult.findings) &&
    !hasBlockingFailMarks(selectionMarksResult?.artifact)
  ) {
    analysisResult = {
      ...analysisResult,
      overallResult: "PASS",
      summary:
        `${analysisResult.summary} ` +
        `[AUTO_PASS] Only informational findings remain after hygiene; promoted to PASS.`,
    };
    recordStage({
      stage: "Informational Pass Promotion",
      status: "success",
      durationMs: 0,
    });
  }

  // Admin Audit Policy: Major → hard FAIL; Minor → Doc Quality only.
  let auditPolicyDecision: {
    formFamily: string;
    hasMajorFails: boolean;
    majorCount: number;
    minorCount: number;
    weights: { major: number; minor: number; informational: number };
    policyVersion: string;
    ruleSnapshotHash: string;
  } | null = null;
  const auditPolicy = await db.getAuditPolicy();
  {
    const applied = applyAuditPolicy({
      findings: analysisResult.findings,
      formFamily: auditFormFamily,
      policy: auditPolicy,
      currentResult: analysisResult.overallResult,
    });
    auditPolicyDecision = {
      formFamily: auditFormFamily,
      hasMajorFails: applied.hasMajorFails,
      majorCount: applied.majorCount,
      minorCount: applied.minorCount,
      weights: auditPolicy.weights,
      policyVersion: applied.policyVersion,
      ruleSnapshotHash: applied.ruleSnapshotHash,
    };
    analysisResult = {
      ...analysisResult,
      overallResult: applied.overallResult,
      findings: applied.findings,
      summary:
        `${analysisResult.summary} ` +
        `[AUDIT_POLICY] form=${auditFormFamily} majors=${applied.majorCount} minors=${applied.minorCount} → ${applied.overallResult}.`,
    };
    recordStage({
      stage: "Audit Policy (Major/Minor)",
      status: "success",
      durationMs: 0,
      error: applied.hasMajorFails
        ? `${applied.majorCount} major fail(s)`
        : undefined,
    });
  }

  // Replace LLM self-confidence with engineer documentation quality (0–100).
  // LLM confidence is retained in reportJson for ops; the stored/UI score is the mark.
  const llmConfidenceForReport = analysisResult.score;
  let documentationQualityPenalties: ReturnType<
    typeof computeDocumentationQualityScore
  >["penalties"] = [];
  {
    const quality = computeDocumentationQualityScore(analysisResult.findings, {
      llmConfidence: llmConfidenceForReport,
      overallResult: analysisResult.overallResult,
      weights: auditPolicy.weights,
    });
    documentationQualityPenalties = quality.penalties;
    analysisResult = {
      ...analysisResult,
      score: quality.score,
      summary:
        `${analysisResult.summary} ` +
        `[DOC_QUALITY] ${quality.summary} (LLM confidence was ${llmConfidenceForReport}).`,
    };
    recordStage({
      stage: "Documentation Quality Score",
      status: "success",
      durationMs: 0,
    });
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
        documentationQualityScore: analysisResult.score,
        documentationQualityPenalties,
        llmConfidenceScore: llmConfidenceForReport,
        ...(auditPolicyDecision ? { auditPolicyDecision } : {}),
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
        ...(selectionMarksResult
          ? { selectionMarks: selectionMarksResult.artifact }
          : {}),
        ...(failurePathSignals
          ? { failurePathSignals, signalSummary: failurePathSignalSummary }
          : {}),
        ...(vlmInkResult ? { vlmInkVerification: vlmInkResult.artifact } : {}),
        geminiMultimodal: {
          enabled: isGeminiMultimodalEnabled(),
          attached:
            isGeminiMultimodalEnabled() &&
            Boolean(
              sharedPdfBuffer &&
                sharedPdfBuffer.length > 0 &&
                sharedPdfBuffer.length <= VLM_PDF_MAX_BYTES
            ),
        },
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
