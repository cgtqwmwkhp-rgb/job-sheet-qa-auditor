/**
 * Document Processor Service
 * Orchestrates the full document processing pipeline:
 * 1. Mistral OCR for text extraction
 * 2. Template selection (SSOT - templates only)
 * 3. Gemini 2.5 for analysis against Gold Standard
 * 4. Result storage and audit trail
 * 
 * PR-1: SSOT ENFORCEMENT
 * - No legacy goldSpecId path (deprecated)
 * - No hardcoded fallback specs
 * - All processing uses template registry
 * - Pipeline fails explicitly if no template matches
 */

import { extractTextFromDocument, OCRResult } from './ocr';
import { analyzeJobSheet, AnalysisResult, GoldSpec } from './analyzer';
import { selectTemplate, createSelectionTraceArtifact } from './templateSelector';
import {
  getTemplateVersion,
  getActiveTemplates,
  ensureTemplatesReady,
  getDefaultTemplateVersion,
  type SelectionResult,
} from './templateRegistry';
import { specJsonToGoldSpec } from './templateRegistry/defaultTemplate';
import * as db from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessingResult {
  success: boolean;
  jobSheetId: number;
  auditResultId?: number;
  ocrResult: OCRResult;
  analysisResult?: AnalysisResult;
  selectionResult?: SelectionResult;
  processingStages: {
    stage: string;
    status: 'success' | 'failed' | 'skipped';
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

const PIPELINE_VERSION = '2.0.0'; // Updated for template system

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
  // Wrap legacy parameters into options
  return processJobSheetWithOptions(jobSheetId, documentUrl, {
    goldSpecId,
    userId,
  });
}

/**
 * Process a job sheet with full options support
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
export async function processJobSheetWithOptions(
  jobSheetId: number,
  documentUrl: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const stages: ProcessingResult['processingStages'] = [];
  const runId = uuidv4();
  let selectionResult: SelectionResult | undefined;
  
  // Update job sheet status to processing
  try {
    await db.updateJobSheetStatus(jobSheetId, 'processing');
  } catch (error) {
    console.warn('[DocumentProcessor] Could not update job sheet status:', error);
  }

  // Stage 1: OCR Text Extraction
  const ocrStartTime = Date.now();
  let ocrResult: OCRResult;
  
  try {
    ocrResult = await extractTextFromDocument(documentUrl);
    stages.push({
      stage: 'OCR Text Extraction',
      status: ocrResult.success ? 'success' : 'failed',
      durationMs: Date.now() - ocrStartTime,
      error: ocrResult.error,
    });
  } catch (error) {
    ocrResult = {
      success: false,
      pages: [],
      totalPages: 0,
      model: 'mistral-ocr-latest',
      error: error instanceof Error ? error.message : 'OCR failed',
    };
    stages.push({
      stage: 'OCR Text Extraction',
      status: 'failed',
      durationMs: Date.now() - ocrStartTime,
      error: ocrResult.error,
    });
  }

  // If OCR failed, mark as failed and return
  if (!ocrResult.success || ocrResult.pages.length === 0) {
    try {
      await db.updateJobSheetStatus(jobSheetId, 'failed');
    } catch (error) {
      console.warn('[DocumentProcessor] Could not update job sheet status:', error);
    }
    
    return {
      success: false,
      jobSheetId,
      ocrResult,
      processingStages: stages,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Combine all page text
  const extractedText = ocrResult.pages
    .map(page => `--- Page ${page.pageNumber} ---\n${page.markdown}`)
    .join('\n\n');

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
  
  // SSOT: Ensure templates are ready before processing
  try {
    ensureTemplatesReady();
  } catch (error) {
    // SSOT violation - no templates available
    const errorMsg = error instanceof Error ? error.message : 'SSOT validation failed';
    console.error(`[DocumentProcessor] SSOT violation: ${errorMsg}`);
    
    try {
      await db.updateJobSheetStatus(jobSheetId, 'failed');
    } catch (dbError) {
      console.warn('[DocumentProcessor] Could not update job sheet status:', dbError);
    }
    
    stages.push({
      stage: 'Template Selection',
      status: 'failed',
      durationMs: Date.now() - selectionStartTime,
      error: errorMsg,
    });
    
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
      '[DocumentProcessor] DEPRECATED: goldSpecId/useLegacyPath options are ignored. ' +
      'Use templateVersionId instead. Pipeline will use template selection.'
    );
  }
  
  if (options.templateVersionId) {
    // Explicit template version provided - use directly
    const version = getTemplateVersion(options.templateVersionId);
    if (version) {
      spec = convertSpecJsonToGoldSpec(version.specJson);
      usedTemplateVersionId = version.id;
      stages.push({
        stage: 'Template Selection',
        status: 'success',
        durationMs: Date.now() - selectionStartTime,
      });
    } else {
      // Template version not found - fail explicitly (no fallback)
      const errorMsg = `Template version ${options.templateVersionId} not found`;
      console.error(`[DocumentProcessor] ${errorMsg}`);
      
      try {
        await db.updateJobSheetStatus(jobSheetId, 'failed');
      } catch (dbError) {
        console.warn('[DocumentProcessor] Could not update job sheet status:', dbError);
      }
      
      stages.push({
        stage: 'Template Selection',
        status: 'failed',
        durationMs: Date.now() - selectionStartTime,
        error: errorMsg,
      });
      
      return {
        success: false,
        jobSheetId,
        ocrResult,
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    }
  } else {
    // Auto-select template from extracted text
    selectionResult = selectTemplate(extractedText);
    
    if (!selectionResult.autoProcessingAllowed) {
      // CRITICAL: LOW or ambiguous MEDIUM confidence - STOP and send to REVIEW_QUEUE
      console.log(`[DocumentProcessor] Template selection blocked: ${selectionResult.blockReason}`);
      
      try {
        await db.updateJobSheetStatus(jobSheetId, 'review_queue');
      } catch (error) {
        console.warn('[DocumentProcessor] Could not update job sheet status:', error);
      }
      
      stages.push({
        stage: 'Template Selection',
        status: 'failed',
        durationMs: Date.now() - selectionStartTime,
        error: selectionResult.blockReason,
      });
      
      // Create selection trace for audit
      const trace = createSelectionTraceArtifact(jobSheetId, selectionResult);
      
      // Return early - DO NOT auto-process on LOW/ambiguous confidence
      return {
        success: false,
        jobSheetId,
        ocrResult,
        selectionResult,
        processingStages: stages,
        totalDurationMs: Date.now() - startTime,
      };
    }
    
    // HIGH or clear MEDIUM confidence - proceed with selected template
    const version = getTemplateVersion(selectionResult.versionId!);
    if (version) {
      spec = convertSpecJsonToGoldSpec(version.specJson);
      usedTemplateVersionId = version.id;
      stages.push({
        stage: 'Template Selection',
        status: 'success',
        durationMs: Date.now() - selectionStartTime,
      });
    } else {
      // Template version should exist at this point - fail explicitly
      const errorMsg = `Selected template version ${selectionResult.versionId} not found`;
      console.error(`[DocumentProcessor] ${errorMsg}`);
      
      try {
        await db.updateJobSheetStatus(jobSheetId, 'failed');
      } catch (dbError) {
        console.warn('[DocumentProcessor] Could not update job sheet status:', dbError);
      }
      
      stages.push({
        stage: 'Template Selection',
        status: 'failed',
        durationMs: Date.now() - selectionStartTime,
        error: errorMsg,
      });
      
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

  // Stage 2: AI Analysis
  const analysisStartTime = Date.now();
  let analysisResult: AnalysisResult;

  try {
    analysisResult = await analyzeJobSheet(extractedText, spec, ocrResult.totalPages);
    stages.push({
      stage: 'AI Analysis',
      status: analysisResult.success ? 'success' : 'failed',
      durationMs: Date.now() - analysisStartTime,
      error: analysisResult.error,
    });
  } catch (error) {
    analysisResult = {
      success: false,
      overallResult: 'REVIEW_QUEUE',
      score: 0,
      findings: [],
      extractedFields: {},
      summary: 'Analysis failed',
      processingTimeMs: Date.now() - analysisStartTime,
      model: 'gemini-2.5-flash',
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
    stages.push({
      stage: 'AI Analysis',
      status: 'failed',
      durationMs: Date.now() - analysisStartTime,
      error: analysisResult.error,
    });
  }

  // Stage 3: Store Results
  const storageStartTime = Date.now();
  let auditResultId: number | undefined;

  try {
    // Determine final status
    const finalStatus = analysisResult.overallResult === 'PASS' 
      ? 'completed' 
      : analysisResult.overallResult === 'REVIEW_QUEUE'
        ? 'review_queue'
        : 'completed';

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
      result: analysisResult.overallResult.toLowerCase() as 'pass' | 'fail' | 'review_queue',
      confidenceScore: String(analysisResult.score),
      documentStrategy: 'ocr', // We used OCR
      ocrEngineVersion: ocrResult.model,
      pipelineVersion: PIPELINE_VERSION,
      reportJson: {
        summary: analysisResult.summary,
        extractedText,
        extractedFields: analysisResult.extractedFields,
        pageCount: ocrResult.totalPages,
        processingStages: stages,
      },
      processingTimeMs: Date.now() - startTime,
    });

    auditResultId = auditResult.id;

    // Create audit findings
    if (analysisResult.findings.length > 0) {
      const findingsToInsert = analysisResult.findings.map(finding => ({
        auditResultId: auditResult.id,
        severity: finding.severity as 'S0' | 'S1' | 'S2' | 'S3',
        reasonCode: finding.reasonCode as any,
        fieldName: finding.fieldName,
        pageNumber: finding.pageNumber,
        boundingBox: finding.boundingBox || null,
        rawSnippet: finding.rawSnippet || '',
        normalisedSnippet: finding.normalisedSnippet || '',
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
        action: 'PROCESS_JOB_SHEET',
        entityType: 'job_sheet',
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

    stages.push({
      stage: 'Store Results',
      status: 'success',
      durationMs: Date.now() - storageStartTime,
    });
  } catch (error) {
    console.error('[DocumentProcessor] Failed to store results:', error);
    stages.push({
      stage: 'Store Results',
      status: 'failed',
      durationMs: Date.now() - storageStartTime,
      error: error instanceof Error ? error.message : 'Storage failed',
    });
  }

  return {
    success: analysisResult.success,
    jobSheetId,
    auditResultId,
    ocrResult,
    analysisResult,
    selectionResult,
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
  // Get the job sheet
  const jobSheet = await db.getJobSheetById(jobSheetId);
  if (!jobSheet) {
    throw new Error(`Job sheet ${jobSheetId} not found`);
  }

  return processJobSheet(jobSheetId, jobSheet.fileUrl, goldSpecId, userId);
}

/**
 * Reprocess a job sheet with a specific template version
 */
export async function reprocessWithTemplate(
  jobSheetId: number,
  templateVersionId: number,
  userId?: number
): Promise<ProcessingResult> {
  const jobSheet = await db.getJobSheetById(jobSheetId);
  if (!jobSheet) {
    throw new Error(`Job sheet ${jobSheetId} not found`);
  }

  return processJobSheetWithOptions(jobSheetId, jobSheet.fileUrl, {
    templateVersionId,
    userId,
  });
}

/**
 * Convert template specJson to GoldSpec format for analyzer
 */
function convertSpecJsonToGoldSpec(specJson: any): GoldSpec {
  return {
    name: specJson.name || 'Template Spec',
    version: specJson.version || '1.0.0',
    rules: (specJson.rules || []).map((rule: any) => ({
      id: rule.ruleId,
      field: rule.field,
      type: rule.type === 'required' ? 'presence' : rule.type,
      required: rule.type === 'required',
      description: rule.description || '',
      pattern: rule.pattern,
      format: rule.pattern,
    })),
  };
}
