/**
 * Document Processor Service
 * Orchestrates the full document processing pipeline:
 * 1. Mistral OCR for text extraction
 * 2. Gemini 2.5 for analysis against Gold Standard
 * 3. Result storage and audit trail
 */

import { extractTextFromDocument, OCRResult } from './ocr';
import { analyzeJobSheet, AnalysisResult, GoldSpec, getDefaultGoldSpec } from './analyzer';
import * as db from '../db';
import { v4 as uuidv4 } from 'uuid';
import { createSafeLogger } from '../utils/safeLogger';

const processorLogger = createSafeLogger('DocumentProcessor');

export interface ProcessingResult {
  success: boolean;
  jobSheetId: number;
  auditResultId?: number;
  ocrResult: OCRResult;
  analysisResult?: AnalysisResult;
  processingStages: {
    stage: string;
    status: 'success' | 'failed' | 'skipped';
    durationMs: number;
    error?: string;
  }[];
  totalDurationMs: number;
}

const PIPELINE_VERSION = '1.0.0';

/**
 * Process a job sheet document through the full pipeline
 */
export async function processJobSheet(
  jobSheetId: number,
  documentUrl: string,
  goldSpecId?: number,
  userId?: number
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const stages: ProcessingResult['processingStages'] = [];
  const runId = uuidv4();
  
  // Update job sheet status to processing
  try {
    await db.updateJobSheetStatus(jobSheetId, 'processing');
  } catch (error) {
    processorLogger.warn('Could not update job sheet status', { error: String(error) });
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
      processorLogger.warn('Could not update job sheet status', { error: String(error) });
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

  // Get the Gold Standard spec
  const spec = getDefaultGoldSpec();

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

    // Update job sheet status
    await db.updateJobSheetStatus(jobSheetId, finalStatus);

    // Create audit result with correct schema fields
    const auditResult = await db.createAuditResult({
      jobSheetId,
      goldSpecId: goldSpecId || 1, // Default to spec ID 1 if not provided
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
    if (userId) {
      await db.logAction({
        userId,
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
    processorLogger.error('Failed to store results', { error: String(error) });
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
