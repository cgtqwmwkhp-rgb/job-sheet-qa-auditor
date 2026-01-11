/**
 * Evaluation Metrics Calculator
 * 
 * Calculates OCRBench-style metrics for document processing accuracy.
 */

import type {
  EvalDocument,
  EvalDocumentResult,
  SelectionMetrics,
  CriticalFieldMetrics,
  FusionMetrics,
  Pass2Metrics,
  TrendDelta,
  EvalReport,
  EvalConfig,
} from './types';

/**
 * Calculate selection accuracy metrics
 */
export function calculateSelectionMetrics(results: EvalDocumentResult[]): SelectionMetrics {
  const byTemplateId: Record<string, { total: number; correct: number; accuracy: number }> = {};
  const byAssetType: Record<string, { total: number; correct: number; accuracy: number }> = {};
  
  let correctSelections = 0;
  let incorrectSelections = 0;
  let ambiguousSelections = 0;
  
  for (const result of results) {
    // Overall counts
    if (result.selection.isCorrect) {
      correctSelections++;
    } else {
      incorrectSelections++;
    }
    
    if (result.selection.isAmbiguous) {
      ambiguousSelections++;
    }
    
    // By template
    const templateId = result.selection.expectedTemplateId;
    if (!byTemplateId[templateId]) {
      byTemplateId[templateId] = { total: 0, correct: 0, accuracy: 0 };
    }
    byTemplateId[templateId].total++;
    if (result.selection.isCorrect) {
      byTemplateId[templateId].correct++;
    }
  }
  
  // Calculate accuracies
  for (const templateId of Object.keys(byTemplateId)) {
    const stats = byTemplateId[templateId];
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  const totalDocuments = results.length;
  
  return {
    totalDocuments,
    correctSelections,
    incorrectSelections,
    ambiguousSelections,
    accuracy: totalDocuments > 0 ? correctSelections / totalDocuments : 0,
    ambiguityRate: totalDocuments > 0 ? ambiguousSelections / totalDocuments : 0,
    byTemplateId,
    byAssetType,
  };
}

/**
 * Calculate critical field accuracy metrics
 */
export function calculateCriticalFieldMetrics(results: EvalDocumentResult[]): CriticalFieldMetrics {
  const bySeverity: Record<'S0' | 'S1' | 'S2' | 'S3', { total: number; correct: number; accuracy: number }> = {
    S0: { total: 0, correct: 0, accuracy: 0 },
    S1: { total: 0, correct: 0, accuracy: 0 },
    S2: { total: 0, correct: 0, accuracy: 0 },
    S3: { total: 0, correct: 0, accuracy: 0 },
  };
  
  const byField: Record<string, { total: number; correct: number; accuracy: number }> = {};
  
  let totalFields = 0;
  let correctFields = 0;
  let incorrectFields = 0;
  let missingFields = 0;
  let criticalTotal = 0;
  let criticalCorrect = 0;
  
  for (const result of results) {
    for (const field of result.fields) {
      totalFields++;
      
      // By severity
      bySeverity[field.severity].total++;
      
      // By field name
      if (!byField[field.fieldName]) {
        byField[field.fieldName] = { total: 0, correct: 0, accuracy: 0 };
      }
      byField[field.fieldName].total++;
      
      if (field.isCorrect) {
        correctFields++;
        bySeverity[field.severity].correct++;
        byField[field.fieldName].correct++;
      } else if (field.actualValue === null || field.actualValue === undefined) {
        missingFields++;
        incorrectFields++;
      } else {
        incorrectFields++;
      }
      
      // Critical fields are S0 and S1
      if (field.severity === 'S0' || field.severity === 'S1') {
        criticalTotal++;
        if (field.isCorrect) {
          criticalCorrect++;
        }
      }
    }
  }
  
  // Calculate accuracies
  for (const severity of ['S0', 'S1', 'S2', 'S3'] as const) {
    const stats = bySeverity[severity];
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  for (const fieldName of Object.keys(byField)) {
    const stats = byField[fieldName];
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }
  
  return {
    totalFields,
    correctFields,
    incorrectFields,
    missingFields,
    accuracy: totalFields > 0 ? correctFields / totalFields : 0,
    bySeverity,
    byField,
    criticalOnlyAccuracy: criticalTotal > 0 ? criticalCorrect / criticalTotal : 0,
  };
}

/**
 * Calculate OCR + Image QA fusion metrics
 */
export function calculateFusionMetrics(results: EvalDocumentResult[]): FusionMetrics {
  const byField: Record<string, { total: number; agreements: number; agreementRate: number }> = {};
  
  let totalComparisons = 0;
  let agreements = 0;
  let disagreements = 0;
  let ocrPreferred = 0;
  let imageQaPreferred = 0;
  let mergedDecisions = 0;
  let conflictResolutions = 0;
  
  for (const result of results) {
    for (const fusion of result.fusionResults) {
      totalComparisons++;
      
      // By field
      if (!byField[fusion.fieldId]) {
        byField[fusion.fieldId] = { total: 0, agreements: 0, agreementRate: 0 };
      }
      byField[fusion.fieldId].total++;
      
      if (fusion.agreed) {
        agreements++;
        byField[fusion.fieldId].agreements++;
      } else {
        disagreements++;
      }
      
      // Decision tracking
      switch (fusion.decision) {
        case 'ocr':
          ocrPreferred++;
          break;
        case 'image_qa':
          imageQaPreferred++;
          break;
        case 'merged':
          mergedDecisions++;
          break;
        case 'conflict':
          conflictResolutions++;
          break;
      }
    }
  }
  
  // Calculate agreement rates
  for (const fieldId of Object.keys(byField)) {
    const stats = byField[fieldId];
    stats.agreementRate = stats.total > 0 ? stats.agreements / stats.total : 0;
  }
  
  return {
    totalComparisons,
    agreements,
    disagreements,
    agreementRate: totalComparisons > 0 ? agreements / totalComparisons : 0,
    ocrPreferred,
    imageQaPreferred,
    mergedDecisions,
    conflictResolutions,
    byField,
  };
}

/**
 * Calculate Pass-2 (escalation) metrics
 */
export function calculatePass2Metrics(results: EvalDocumentResult[]): Pass2Metrics {
  const byTemplateId: Record<string, { total: number; triggered: number; rate: number }> = {};
  const triggerReasons: Record<string, number> = {};
  
  let pass2Triggered = 0;
  let geminiUsage = 0;
  let claudeUsage = 0;
  let escalatedToClaude = 0;
  
  for (const result of results) {
    // By template
    const templateId = result.selection.expectedTemplateId;
    if (!byTemplateId[templateId]) {
      byTemplateId[templateId] = { total: 0, triggered: 0, rate: 0 };
    }
    byTemplateId[templateId].total++;
    
    if (result.pass2.triggered) {
      pass2Triggered++;
      byTemplateId[templateId].triggered++;
      
      // Track reason
      const reason = result.pass2.reason || 'unknown';
      triggerReasons[reason] = (triggerReasons[reason] || 0) + 1;
      
      // Track interpreter usage
      if (result.pass2.interpreter === 'gemini') {
        geminiUsage++;
      } else if (result.pass2.interpreter === 'claude') {
        claudeUsage++;
      }
      
      if (result.pass2.escalated) {
        escalatedToClaude++;
      }
    }
  }
  
  // Calculate rates
  for (const templateId of Object.keys(byTemplateId)) {
    const stats = byTemplateId[templateId];
    stats.rate = stats.total > 0 ? stats.triggered / stats.total : 0;
  }
  
  const totalDocuments = results.length;
  
  return {
    totalDocuments,
    pass2Triggered,
    pass2Rate: totalDocuments > 0 ? pass2Triggered / totalDocuments : 0,
    triggerReasons,
    byTemplateId,
    interpreterUsage: {
      gemini: geminiUsage,
      claude: claudeUsage,
      escalatedToClaude,
    },
  };
}

/**
 * Calculate trend deltas between runs
 */
export function calculateTrends(current: EvalReport, previous: EvalReport | null): TrendDelta[] {
  if (!previous) {
    return [];
  }
  
  const metrics: Array<{ name: string; current: number; previous: number }> = [
    { name: 'selection_accuracy', current: current.selectionMetrics.accuracy, previous: previous.selectionMetrics.accuracy },
    { name: 'critical_field_accuracy', current: current.criticalFieldMetrics.accuracy, previous: previous.criticalFieldMetrics.accuracy },
    { name: 'fusion_agreement_rate', current: current.fusionMetrics.agreementRate, previous: previous.fusionMetrics.agreementRate },
    { name: 'pass2_rate', current: current.pass2Metrics.pass2Rate, previous: previous.pass2Metrics.pass2Rate },
    { name: 'overall_score', current: current.overallScore, previous: previous.overallScore },
  ];
  
  return metrics.map(({ name, current: curr, previous: prev }) => {
    const delta = curr - prev;
    const deltaPercent = prev > 0 ? (delta / prev) * 100 : 0;
    
    let trend: 'improving' | 'stable' | 'degrading';
    // For pass2_rate, lower is better
    if (name === 'pass2_rate') {
      if (delta < -0.01) trend = 'improving';
      else if (delta > 0.01) trend = 'degrading';
      else trend = 'stable';
    } else {
      if (delta > 0.01) trend = 'improving';
      else if (delta < -0.01) trend = 'degrading';
      else trend = 'stable';
    }
    
    return {
      metric: name,
      previous: prev,
      current: curr,
      delta,
      deltaPercent,
      trend,
    };
  });
}

/**
 * Calculate overall weighted score
 */
export function calculateOverallScore(
  selection: SelectionMetrics,
  criticalField: CriticalFieldMetrics,
  fusion: FusionMetrics,
  pass2: Pass2Metrics,
  weights: EvalConfig['weights']
): number {
  // Invert pass2 rate (lower is better, so 1 - rate for scoring)
  const pass2Score = 1 - pass2.pass2Rate;
  
  return (
    selection.accuracy * weights.selectionAccuracy +
    criticalField.criticalOnlyAccuracy * weights.criticalFieldAccuracy +
    fusion.agreementRate * weights.fusionAgreement +
    pass2Score * weights.pass2Rate
  );
}

/**
 * Generate unique run ID
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `eval-${timestamp}-${random}`;
}

/**
 * Sort document results deterministically
 */
export function sortDocumentResults(results: EvalDocumentResult[]): EvalDocumentResult[] {
  return [...results].sort((a, b) => a.documentId.localeCompare(b.documentId));
}

/**
 * Sort fields deterministically within each document
 */
export function sortFieldResults(results: EvalDocumentResult[]): EvalDocumentResult[] {
  return results.map(result => ({
    ...result,
    fields: [...result.fields].sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
    fusionResults: [...result.fusionResults].sort((a, b) => a.fieldId.localeCompare(b.fieldId)),
  }));
}
