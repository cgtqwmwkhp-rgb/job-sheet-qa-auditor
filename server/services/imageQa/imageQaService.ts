/**
 * Image QA Service
 * 
 * Main service for document image quality analysis.
 * Orchestrates detectors and produces imageQa.json artifact.
 * 
 * DESIGN NOTES:
 * - Deterministic output given same input
 * - Does not modify canonical findings
 * - Routes low-quality documents to review queue
 */

// Note: uuidv4 is available in detectors.ts for ID generation
import type {
  ImageQaResult,
  ImageQaConfig,
  PageQualityMetrics,
  ReviewRoutingDecision,
  ReviewReason,
} from './types';
import { getDefaultImageQaConfig } from './types';
import {
  analyzePageQuality,
  detectCheckboxes,
  detectSignatures,
  detectStamps,
  calculateQualityGrade,
} from './detectors';

/**
 * OCR page input for Image QA analysis
 */
export interface OcrPageInput {
  pageNumber: number;
  markdown: string;
}

/**
 * Analyze document quality from OCR output
 * 
 * @param documentId - Unique document identifier
 * @param pages - OCR output pages
 * @param config - Optional configuration overrides
 * @returns ImageQaResult with quality metrics and detections
 */
export function analyzeDocumentQuality(
  documentId: string,
  pages: OcrPageInput[],
  config: ImageQaConfig = getDefaultImageQaConfig()
): ImageQaResult {
  const startTime = Date.now();
  
  if (pages.length === 0) {
    return {
      success: false,
      documentId,
      processedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      pageMetrics: [],
      documentQuality: {
        overallScore: 0,
        lowestPageScore: 0,
        averagePageScore: 0,
        qualityGrade: 'F',
        requiresReview: true,
        reviewReasons: ['No pages to analyze'],
      },
      checkboxes: [],
      signatures: [],
      stamps: [],
      summary: {
        totalPages: 0,
        pagesWithIssues: 0,
        checkboxesFound: 0,
        checkboxesChecked: 0,
        signaturesFound: 0,
        signaturesPresent: 0,
        stampsFound: 0,
      },
      error: 'No pages provided',
      errorCode: 'NO_PAGES',
    };
  }
  
  // Analyze each page
  const pageMetrics: PageQualityMetrics[] = [];
  const allCheckboxes: ImageQaResult['checkboxes'] = [];
  const allSignatures: ImageQaResult['signatures'] = [];
  const allStamps: ImageQaResult['stamps'] = [];
  
  for (const page of pages) {
    // Quality metrics
    const metrics = analyzePageQuality(page.pageNumber, page.markdown, config);
    pageMetrics.push(metrics);
    
    // Element detection
    const checkboxes = detectCheckboxes(
      page.pageNumber,
      page.markdown,
      config.checkboxSensitivity
    );
    allCheckboxes.push(...checkboxes);
    
    const signatures = detectSignatures(
      page.pageNumber,
      page.markdown,
      config.signatureSensitivity
    );
    allSignatures.push(...signatures);
    
    const stamps = detectStamps(
      page.pageNumber,
      page.markdown,
      config.stampSensitivity
    );
    allStamps.push(...stamps);
  }
  
  // Calculate document-level quality
  const scores = pageMetrics.map(p => p.overallScore);
  const lowestPageScore = Math.min(...scores);
  const averagePageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const overallScore = Math.round(lowestPageScore * 0.4 + averagePageScore * 0.6);
  
  // Determine review reasons
  const reviewReasons: string[] = [];
  
  for (const metrics of pageMetrics) {
    if (metrics.isBlurry) {
      reviewReasons.push(`Page ${metrics.pageNumber}: Blurry image detected`);
    }
    if (metrics.isLowContrast) {
      reviewReasons.push(`Page ${metrics.pageNumber}: Low contrast detected`);
    }
    if (metrics.isSkewed) {
      reviewReasons.push(`Page ${metrics.pageNumber}: Document skew detected (${metrics.skewAngle}°)`);
    }
  }
  
  // Check for missing signatures
  const missingSignatures = allSignatures.filter(s => !s.isPresent);
  if (missingSignatures.length > 0) {
    reviewReasons.push(`${missingSignatures.length} signature field(s) appear empty`);
  }
  
  const requiresReview = overallScore < config.reviewQualityThreshold || reviewReasons.length > 0;
  
  // Build summary
  const summary = {
    totalPages: pages.length,
    pagesWithIssues: pageMetrics.filter(p => 
      p.isBlurry || p.isLowContrast || p.isSkewed || p.isOverexposed || p.isUnderexposed
    ).length,
    checkboxesFound: allCheckboxes.length,
    checkboxesChecked: allCheckboxes.filter(c => c.isChecked).length,
    signaturesFound: allSignatures.length,
    signaturesPresent: allSignatures.filter(s => s.isPresent).length,
    stampsFound: allStamps.length,
  };
  
  return {
    success: true,
    documentId,
    processedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
    pageMetrics,
    documentQuality: {
      overallScore,
      lowestPageScore,
      averagePageScore,
      qualityGrade: calculateQualityGrade(overallScore),
      requiresReview,
      reviewReasons,
    },
    checkboxes: allCheckboxes,
    signatures: allSignatures,
    stamps: allStamps,
    summary,
  };
}

/**
 * Determine review routing based on Image QA results
 * 
 * @param qaResult - Image QA analysis result
 * @param requiredSignatureFields - Fields that require signatures
 * @param requiredCheckboxFields - Fields that require checked boxes
 * @returns ReviewRoutingDecision
 */
export function determineReviewRouting(
  qaResult: ImageQaResult,
  requiredSignatureFields: string[] = [],
  requiredCheckboxFields: string[] = []
): ReviewRoutingDecision {
  const reasons: ReviewReason[] = [];
  
  // Check document quality
  if (qaResult.documentQuality.overallScore < 50) {
    reasons.push({
      code: 'LOW_QUALITY',
      severity: 'S1',
      message: `Document quality score is ${qaResult.documentQuality.overallScore}/100`,
    });
  }
  
  // Check for skewed pages
  const skewedPages = qaResult.pageMetrics.filter(p => p.isSkewed);
  if (skewedPages.length > 0) {
    reasons.push({
      code: 'SKEWED_DOCUMENT',
      severity: 'S2',
      message: `${skewedPages.length} page(s) have significant skew`,
      pageNumber: skewedPages[0].pageNumber,
    });
  }
  
  // Check for missing required signatures
  const missingSignatures = qaResult.signatures.filter(s => !s.isPresent);
  for (const sig of missingSignatures) {
    if (sig.label && requiredSignatureFields.includes(sig.label)) {
      reasons.push({
        code: 'MISSING_SIGNATURE',
        severity: 'S0',
        message: `Required signature "${sig.label}" appears to be missing`,
        pageNumber: sig.pageNumber,
        affectedField: sig.label,
      });
    }
  }
  
  // Check for unchecked required boxes
  const uncheckedBoxes = qaResult.checkboxes.filter(c => !c.isChecked);
  for (const box of uncheckedBoxes) {
    if (box.label && requiredCheckboxFields.includes(box.label)) {
      reasons.push({
        code: 'UNCHECKED_REQUIRED',
        severity: 'S1',
        message: `Required checkbox "${box.label}" is not checked`,
        pageNumber: box.pageNumber,
        affectedField: box.label,
      });
    }
  }
  
  // Check for low confidence detections
  const lowConfidenceItems = [
    ...qaResult.signatures.filter(s => s.confidence < 0.7),
    ...qaResult.checkboxes.filter(c => c.confidence < 0.7),
  ];
  if (lowConfidenceItems.length > 0) {
    reasons.push({
      code: 'LOW_CONFIDENCE',
      severity: 'S3',
      message: `${lowConfidenceItems.length} detection(s) have low confidence`,
    });
  }
  
  // Sort reasons by severity for stable output
  reasons.sort((a, b) => {
    const severityOrder = { S0: 0, S1: 1, S2: 2, S3: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
  
  // Determine priority
  let priority: 'low' | 'medium' | 'high' = 'low';
  if (reasons.some(r => r.severity === 'S0')) {
    priority = 'high';
  } else if (reasons.some(r => r.severity === 'S1')) {
    priority = 'medium';
  }
  
  return {
    shouldRoute: reasons.length > 0,
    reasons,
    priority,
  };
}

/**
 * Generate imageQa.json artifact content
 * 
 * @param qaResult - Image QA analysis result
 * @returns JSON string for artifact
 */
export function generateImageQaArtifact(qaResult: ImageQaResult): string {
  // Create a clean artifact without internal IDs
  const artifact = {
    schemaVersion: '1.0.0',
    documentId: qaResult.documentId,
    processedAt: qaResult.processedAt,
    processingTimeMs: qaResult.processingTimeMs,
    success: qaResult.success,
    documentQuality: qaResult.documentQuality,
    pageMetrics: qaResult.pageMetrics.map(p => ({
      pageNumber: p.pageNumber,
      overallScore: p.overallScore,
      blurScore: p.blurScore,
      contrastScore: p.contrastScore,
      skewAngle: p.skewAngle,
      brightnessScore: p.brightnessScore,
      issues: [
        p.isBlurry && 'blurry',
        p.isLowContrast && 'low_contrast',
        p.isSkewed && 'skewed',
        p.isOverexposed && 'overexposed',
        p.isUnderexposed && 'underexposed',
      ].filter(Boolean),
    })),
    detections: {
      checkboxes: qaResult.checkboxes.map(c => ({
        pageNumber: c.pageNumber,
        bbox: c.bbox,
        isChecked: c.isChecked,
        confidence: Math.round(c.confidence * 100) / 100,
        label: c.label,
      })),
      signatures: qaResult.signatures.map(s => ({
        pageNumber: s.pageNumber,
        bbox: s.bbox,
        isPresent: s.isPresent,
        confidence: Math.round(s.confidence * 100) / 100,
        signatureType: s.signatureType,
      })),
      stamps: qaResult.stamps.map(st => ({
        pageNumber: st.pageNumber,
        bbox: st.bbox,
        stampType: st.stampType,
        confidence: Math.round(st.confidence * 100) / 100,
        text: st.text,
      })),
    },
    summary: qaResult.summary,
  };
  
  return JSON.stringify(artifact, null, 2);
}
