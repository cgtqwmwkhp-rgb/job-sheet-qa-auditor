/**
 * Template Selection Engine
 * 
 * Selects the most appropriate template for a document based on:
 * - Fingerprint matching (required/optional tokens)
 * - Form code regex matching
 * - Client context
 * - ROI (Region of Interest) support
 */

import { getTemplateRegistry, type Template } from './templateRegistry';

// ============================================================================
// Types
// ============================================================================

export interface SelectionCriteria {
  method: 'fingerprint' | 'formCode' | 'manual';
  requiredTokensAll?: string[];
  requiredTokensAny?: string[];
  optionalTokens?: string[];
  excludeTokens?: string[];
  formCodeRegex?: string;
}

export interface SelectionScore {
  templateId: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  matchedRequiredAll: string[];
  matchedRequiredAny: string[];
  matchedOptional: string[];
  matchedExclude: string[];
  formCodeMatch: boolean;
  reasons: string[];
}

export interface SelectionResult {
  selectedTemplate: Template | null;
  selectedScore: SelectionScore | null;
  allScores: SelectionScore[];
  selectionMethod: 'fingerprint' | 'formCode' | 'manual' | 'fallback' | 'none';
  confidence: 'high' | 'medium' | 'low' | 'none';
  warnings: string[];
}

export interface ROIRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ROIDefinition {
  pageIndex0Based: number;
  regions: ROIRegion[];
}

export interface DocumentContext {
  extractedText: string;
  client?: string;
  assetType?: string;
  workType?: string;
  formCode?: string;
  pageCount?: number;
}

// ============================================================================
// Tokenization
// ============================================================================

/**
 * Normalize text for token matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains a token (case-insensitive, partial match)
 */
function containsToken(text: string, token: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedToken = normalizeText(token);
  return normalizedText.includes(normalizedToken);
}

/**
 * Extract form code from text using regex
 */
function extractFormCode(text: string, regex: string): string | null {
  try {
    const pattern = new RegExp(regex, 'i');
    const match = text.match(pattern);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Scoring
// ============================================================================

const SCORE_WEIGHTS = {
  requiredAllMatch: 30,      // Each required token (all must match)
  requiredAnyMatch: 20,      // Each required token (any must match)
  optionalMatch: 5,          // Each optional token
  excludeMatch: -50,         // Each exclude token (penalty)
  formCodeMatch: 25,         // Form code regex match
  clientMatch: 15,           // Client context match
  assetTypeMatch: 10,        // Asset type match
  workTypeMatch: 10,         // Work type match
};

const CONFIDENCE_THRESHOLDS = {
  high: 80,
  medium: 50,
  low: 20,
};

/**
 * Score a template against document context
 */
function scoreTemplate(template: Template, context: DocumentContext): SelectionScore {
  const selection = (template as unknown as { selection?: SelectionCriteria }).selection;
  
  if (!selection) {
    return {
      templateId: template.templateId,
      score: 0,
      confidence: 'low',
      matchedRequiredAll: [],
      matchedRequiredAny: [],
      matchedOptional: [],
      matchedExclude: [],
      formCodeMatch: false,
      reasons: ['No selection criteria defined'],
    };
  }
  
  let score = 0;
  const reasons: string[] = [];
  const matchedRequiredAll: string[] = [];
  const matchedRequiredAny: string[] = [];
  const matchedOptional: string[] = [];
  const matchedExclude: string[] = [];
  let formCodeMatch = false;
  
  const text = context.extractedText;
  
  // Check required tokens (all must match)
  if (selection.requiredTokensAll) {
    let allMatched = true;
    for (const token of selection.requiredTokensAll) {
      if (containsToken(text, token)) {
        matchedRequiredAll.push(token);
        score += SCORE_WEIGHTS.requiredAllMatch;
      } else {
        allMatched = false;
        reasons.push(`Missing required token: "${token}"`);
      }
    }
    if (!allMatched) {
      // If not all required tokens match, this template is not a candidate
      return {
        templateId: template.templateId,
        score: -1000,
        confidence: 'low',
        matchedRequiredAll,
        matchedRequiredAny,
        matchedOptional,
        matchedExclude,
        formCodeMatch,
        reasons: [`Not all required tokens matched (${matchedRequiredAll.length}/${selection.requiredTokensAll.length})`],
      };
    }
  }
  
  // Check required tokens (any must match)
  if (selection.requiredTokensAny && selection.requiredTokensAny.length > 0) {
    let anyMatched = false;
    for (const token of selection.requiredTokensAny) {
      if (containsToken(text, token)) {
        matchedRequiredAny.push(token);
        score += SCORE_WEIGHTS.requiredAnyMatch;
        anyMatched = true;
      }
    }
    if (!anyMatched) {
      return {
        templateId: template.templateId,
        score: -1000,
        confidence: 'low',
        matchedRequiredAll,
        matchedRequiredAny,
        matchedOptional,
        matchedExclude,
        formCodeMatch,
        reasons: [`None of the required-any tokens matched`],
      };
    }
  }
  
  // Check exclude tokens (disqualify if any match)
  if (selection.excludeTokens) {
    for (const token of selection.excludeTokens) {
      if (containsToken(text, token)) {
        matchedExclude.push(token);
        score += SCORE_WEIGHTS.excludeMatch;
        reasons.push(`Exclude token matched: "${token}"`);
      }
    }
    if (matchedExclude.length > 0) {
      return {
        templateId: template.templateId,
        score: -1000,
        confidence: 'low',
        matchedRequiredAll,
        matchedRequiredAny,
        matchedOptional,
        matchedExclude,
        formCodeMatch,
        reasons: [`Exclude tokens matched: ${matchedExclude.join(', ')}`],
      };
    }
  }
  
  // Check optional tokens
  if (selection.optionalTokens) {
    for (const token of selection.optionalTokens) {
      if (containsToken(text, token)) {
        matchedOptional.push(token);
        score += SCORE_WEIGHTS.optionalMatch;
      }
    }
  }
  
  // Check form code regex
  if (selection.formCodeRegex) {
    const extracted = extractFormCode(text, selection.formCodeRegex);
    if (extracted) {
      formCodeMatch = true;
      score += SCORE_WEIGHTS.formCodeMatch;
      reasons.push(`Form code matched: ${extracted}`);
    }
  }
  
  // Check client context
  if (context.client && template.client === context.client) {
    score += SCORE_WEIGHTS.clientMatch;
    reasons.push(`Client matched: ${context.client}`);
  }
  
  // Check asset type
  const assetTypes = (template as unknown as { assetTypes?: string[] }).assetTypes;
  if (context.assetType && assetTypes?.includes(context.assetType)) {
    score += SCORE_WEIGHTS.assetTypeMatch;
    reasons.push(`Asset type matched: ${context.assetType}`);
  }
  
  // Check work type
  const workTypes = (template as unknown as { workTypes?: string[] }).workTypes;
  if (context.workType && workTypes?.includes(context.workType)) {
    score += SCORE_WEIGHTS.workTypeMatch;
    reasons.push(`Work type matched: ${context.workType}`);
  }
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (score >= CONFIDENCE_THRESHOLDS.high) {
    confidence = 'high';
  } else if (score >= CONFIDENCE_THRESHOLDS.medium) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    templateId: template.templateId,
    score,
    confidence,
    matchedRequiredAll,
    matchedRequiredAny,
    matchedOptional,
    matchedExclude,
    formCodeMatch,
    reasons,
  };
}

// ============================================================================
// Template Selection Engine
// ============================================================================

export class TemplateSelector {
  /**
   * Select the best template for a document
   */
  selectTemplate(context: DocumentContext): SelectionResult {
    const registry = getTemplateRegistry();
    const warnings: string[] = [];
    
    // Get all active templates
    let templates = registry.getActiveTemplates();
    
    // Filter by client if specified
    if (context.client) {
      const clientTemplates = templates.filter(t => t.client === context.client);
      if (clientTemplates.length > 0) {
        templates = clientTemplates;
      } else {
        warnings.push(`No templates found for client: ${context.client}`);
      }
    }
    
    if (templates.length === 0) {
      return {
        selectedTemplate: null,
        selectedScore: null,
        allScores: [],
        selectionMethod: 'none',
        confidence: 'none',
        warnings: ['No active templates available'],
      };
    }
    
    // Score all templates
    const allScores = templates
      .map(t => scoreTemplate(t, context))
      .sort((a, b) => b.score - a.score);
    
    // Filter out disqualified templates (negative scores)
    const validScores = allScores.filter(s => s.score >= 0);
    
    if (validScores.length === 0) {
      return {
        selectedTemplate: null,
        selectedScore: null,
        allScores,
        selectionMethod: 'none',
        confidence: 'none',
        warnings: ['No templates matched the document fingerprint'],
      };
    }
    
    // Select the highest scoring template
    const selectedScore = validScores[0];
    const selectedTemplate = registry.getTemplate(selectedScore.templateId);
    
    // Check for ambiguous selection (multiple templates with similar scores)
    if (validScores.length > 1) {
      const scoreDiff = validScores[0].score - validScores[1].score;
      if (scoreDiff < 10) {
        warnings.push(`Ambiguous selection: ${validScores[0].templateId} and ${validScores[1].templateId} have similar scores`);
      }
    }
    
    return {
      selectedTemplate,
      selectedScore,
      allScores,
      selectionMethod: 'fingerprint',
      confidence: selectedScore.confidence,
      warnings,
    };
  }
  
  /**
   * Select template by ID (manual selection)
   */
  selectTemplateById(templateId: string): SelectionResult {
    const registry = getTemplateRegistry();
    const template = registry.getTemplate(templateId);
    
    if (!template) {
      return {
        selectedTemplate: null,
        selectedScore: null,
        allScores: [],
        selectionMethod: 'manual',
        confidence: 'none',
        warnings: [`Template not found: ${templateId}`],
      };
    }
    
    return {
      selectedTemplate: template,
      selectedScore: {
        templateId,
        score: 100,
        confidence: 'high',
        matchedRequiredAll: [],
        matchedRequiredAny: [],
        matchedOptional: [],
        matchedExclude: [],
        formCodeMatch: false,
        reasons: ['Manual selection'],
      },
      allScores: [],
      selectionMethod: 'manual',
      confidence: 'high',
      warnings: [],
    };
  }
  
  /**
   * Get ROI definition for a template
   */
  getROI(templateId: string): ROIDefinition | null {
    const registry = getTemplateRegistry();
    const template = registry.getTemplate(templateId);
    
    if (!template) {
      return null;
    }
    
    const roiOptional = (template as unknown as { roiOptional?: ROIDefinition }).roiOptional;
    return roiOptional || null;
  }
  
  /**
   * Get ROI regions for a specific page
   */
  getROIRegionsForPage(templateId: string, pageIndex: number): ROIRegion[] {
    const roi = this.getROI(templateId);
    if (!roi || roi.pageIndex0Based !== pageIndex) {
      return [];
    }
    return roi.regions;
  }
  
  /**
   * Check if a point is within any ROI region
   */
  isPointInROI(templateId: string, pageIndex: number, x: number, y: number): ROIRegion | null {
    const regions = this.getROIRegionsForPage(templateId, pageIndex);
    
    for (const region of regions) {
      if (
        x >= region.x &&
        x <= region.x + region.width &&
        y >= region.y &&
        y <= region.y + region.height
      ) {
        return region;
      }
    }
    
    return null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let selectorInstance: TemplateSelector | null = null;

export function getTemplateSelector(): TemplateSelector {
  if (!selectorInstance) {
    selectorInstance = new TemplateSelector();
  }
  return selectorInstance;
}

export function resetTemplateSelector(): void {
  selectorInstance = null;
}
