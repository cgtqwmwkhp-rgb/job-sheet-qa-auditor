/**
 * Signal Extractors for Multi-Signal Template Recognition
 * 
 * PR-2: Implements multiple signal types for template matching:
 * 1. Token signals - keyword matching (existing)
 * 2. Layout signals - page count, dimensions, structure
 * 3. ROI signals - expected regions present in document
 * 4. Plausibility signals - field patterns found in expected locations
 * 
 * Each signal produces a score (0-100) and evidence for traceability.
 */

import type { SelectionConfig, RoiConfig, RoiRegion } from '../templateRegistry/types';

/**
 * Signal types for multi-signal recognition
 */
export type SignalType = 'token' | 'layout' | 'roi' | 'plausibility';

/**
 * Individual signal result
 */
export interface SignalResult {
  type: SignalType;
  score: number; // 0-100
  weight: number; // Contribution weight (0-1)
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: SignalEvidence;
}

/**
 * Evidence for a signal result
 */
export interface SignalEvidence {
  /** What was matched */
  matched: string[];
  /** What was expected but missing */
  missing: string[];
  /** Additional details */
  details: Record<string, unknown>;
}

/**
 * Document metadata for layout analysis
 */
export interface DocumentMetadata {
  pageCount: number;
  /** Page dimensions in normalized format (if available) */
  pageDimensions?: { width: number; height: number };
  /** Detected sections/headers */
  detectedSections?: string[];
  /** Estimated form type (handwritten, printed, hybrid) */
  formType?: 'handwritten' | 'printed' | 'hybrid';
  /** File size in bytes */
  fileSizeBytes?: number;
}

/**
 * Multi-signal configuration
 */
export interface MultiSignalConfig {
  /** Weight for token matching (default: 0.4) */
  tokenWeight: number;
  /** Weight for layout matching (default: 0.2) */
  layoutWeight: number;
  /** Weight for ROI matching (default: 0.25) */
  roiWeight: number;
  /** Weight for plausibility (default: 0.15) */
  plausibilityWeight: number;
}

/**
 * Signal weights version - increment when weights change
 * This enables tracking weight changes across deployments
 */
export const SIGNAL_WEIGHTS_VERSION = '1.0.0';

/**
 * Default signal weights
 */
export const DEFAULT_SIGNAL_WEIGHTS: MultiSignalConfig = {
  tokenWeight: 0.40,
  layoutWeight: 0.20,
  roiWeight: 0.25,
  plausibilityWeight: 0.15,
};

/**
 * Versioned signal weights for traceability
 */
export interface VersionedSignalWeights extends MultiSignalConfig {
  version: string;
  effectiveAt: string;
}

/**
 * Get versioned signal weights for audit trail
 */
export function getVersionedWeights(
  customWeights?: Partial<MultiSignalConfig>
): VersionedSignalWeights {
  return {
    ...DEFAULT_SIGNAL_WEIGHTS,
    ...customWeights,
    version: SIGNAL_WEIGHTS_VERSION,
    effectiveAt: new Date().toISOString(),
  };
}

/**
 * Combined multi-signal result
 */
export interface MultiSignalResult {
  /** Combined weighted score (0-100) */
  combinedScore: number;
  /** Individual signal results */
  signals: SignalResult[];
  /** Overall confidence band */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Total evidence for audit trail */
  combinedEvidence: {
    signalCount: number;
    highConfidenceSignals: number;
    weakSignals: string[];
  };
  /** Versioned weights used for this result (Phase B) */
  weightsUsed: VersionedSignalWeights;
}

// ============================================================================
// SIGNAL EXTRACTORS
// ============================================================================

/**
 * Extract token-based signal (existing logic, wrapped)
 */
export function extractTokenSignal(
  documentTokens: Set<string>,
  config: SelectionConfig,
  weights: Record<string, number> = {}
): SignalResult {
  const matched: string[] = [];
  const missing: string[] = [];
  let score = 0;
  
  // Check requiredTokensAll
  let allRequiredPresent = true;
  for (const token of config.requiredTokensAll) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      matched.push(token);
      score += (weights[token] ?? 10);
    } else {
      allRequiredPresent = false;
      missing.push(token);
    }
  }
  
  if (!allRequiredPresent) {
    score = Math.max(0, score - 50);
  }
  
  // Check requiredTokensAny
  let anyRequiredPresent = config.requiredTokensAny.length === 0;
  for (const token of config.requiredTokensAny) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      anyRequiredPresent = true;
      matched.push(token);
      score += (weights[token] ?? 5);
    }
  }
  
  if (!anyRequiredPresent && config.requiredTokensAny.length > 0) {
    score = Math.max(0, score - 30);
    missing.push(`ANY(${config.requiredTokensAny.join(', ')})`);
  }
  
  // Check formCodeRegex
  if (config.formCodeRegex) {
    const regex = new RegExp(config.formCodeRegex, 'i');
    const fullText = Array.from(documentTokens).join(' ');
    if (regex.test(fullText)) {
      score += 15;
      matched.push(`REGEX:${config.formCodeRegex}`);
    } else {
      missing.push(`REGEX:${config.formCodeRegex}`);
    }
  }
  
  // Check optional tokens
  for (const token of config.optionalTokens) {
    const normalizedToken = token.toLowerCase();
    if (documentTokens.has(normalizedToken)) {
      matched.push(`optional:${token}`);
      score += (weights[token] ?? 2);
    }
  }
  
  // Normalize score
  const maxPossibleScore = 
    config.requiredTokensAll.length * 10 +
    Math.min(config.requiredTokensAny.length, 1) * 5 +
    (config.formCodeRegex ? 15 : 0) +
    config.optionalTokens.length * 2;
  
  const normalizedScore = maxPossibleScore > 0 
    ? Math.min(100, Math.round((score / maxPossibleScore) * 100))
    : 0;
  
  return {
    type: 'token',
    score: normalizedScore,
    weight: DEFAULT_SIGNAL_WEIGHTS.tokenWeight,
    confidence: getConfidenceFromScore(normalizedScore),
    evidence: {
      matched,
      missing,
      details: {
        requiredAllCount: config.requiredTokensAll.length,
        requiredAnyCount: config.requiredTokensAny.length,
        optionalCount: config.optionalTokens.length,
        matchedCount: matched.length,
      },
    },
  };
}

/**
 * Extract layout-based signal
 */
export function extractLayoutSignal(
  metadata: DocumentMetadata,
  expectedLayout?: {
    minPages?: number;
    maxPages?: number;
    expectedSections?: string[];
    formType?: 'handwritten' | 'printed' | 'hybrid';
  }
): SignalResult {
  let score = 50; // Start neutral
  const matched: string[] = [];
  const missing: string[] = [];
  
  if (!expectedLayout) {
    // No layout expectations - return neutral score
    return {
      type: 'layout',
      score: 50,
      weight: DEFAULT_SIGNAL_WEIGHTS.layoutWeight,
      confidence: 'MEDIUM',
      evidence: {
        matched: [],
        missing: [],
        details: { reason: 'No layout expectations defined' },
      },
    };
  }
  
  // Check page count
  if (expectedLayout.minPages !== undefined || expectedLayout.maxPages !== undefined) {
    const minPages = expectedLayout.minPages ?? 1;
    const maxPages = expectedLayout.maxPages ?? 10;
    
    if (metadata.pageCount >= minPages && metadata.pageCount <= maxPages) {
      score += 20;
      matched.push(`pageCount:${metadata.pageCount} (within ${minPages}-${maxPages})`);
    } else {
      score -= 20;
      missing.push(`pageCount:${metadata.pageCount} (expected ${minPages}-${maxPages})`);
    }
  }
  
  // Check expected sections
  if (expectedLayout.expectedSections && metadata.detectedSections) {
    const detectedSet = new Set(metadata.detectedSections.map(s => s.toLowerCase()));
    let sectionsMatched = 0;
    
    for (const section of expectedLayout.expectedSections) {
      if (detectedSet.has(section.toLowerCase())) {
        sectionsMatched++;
        matched.push(`section:${section}`);
      } else {
        missing.push(`section:${section}`);
      }
    }
    
    const sectionScore = expectedLayout.expectedSections.length > 0
      ? (sectionsMatched / expectedLayout.expectedSections.length) * 30
      : 0;
    score += sectionScore;
  }
  
  // Check form type
  if (expectedLayout.formType && metadata.formType) {
    if (metadata.formType === expectedLayout.formType) {
      score += 10;
      matched.push(`formType:${metadata.formType}`);
    } else {
      score -= 10;
      missing.push(`formType:${metadata.formType} (expected ${expectedLayout.formType})`);
    }
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  return {
    type: 'layout',
    score,
    weight: DEFAULT_SIGNAL_WEIGHTS.layoutWeight,
    confidence: getConfidenceFromScore(score),
    evidence: {
      matched,
      missing,
      details: {
        pageCount: metadata.pageCount,
        formType: metadata.formType,
        detectedSections: metadata.detectedSections,
      },
    },
  };
}

/**
 * Extract ROI-based signal
 * Checks if expected ROI regions have content in the document
 */
export function extractRoiSignal(
  documentText: string,
  pageTexts: string[],
  roiConfig?: RoiConfig
): SignalResult {
  if (!roiConfig || roiConfig.regions.length === 0) {
    // No ROI defined - return neutral score
    return {
      type: 'roi',
      score: 50,
      weight: DEFAULT_SIGNAL_WEIGHTS.roiWeight,
      confidence: 'MEDIUM',
      evidence: {
        matched: [],
        missing: [],
        details: { reason: 'No ROI configuration defined' },
      },
    };
  }
  
  const matched: string[] = [];
  const missing: string[] = [];
  let regionsWithContent = 0;
  
  for (const region of roiConfig.regions) {
    // Get the page text for this region
    const pageIndex = region.page - 1;
    const pageText = pageTexts[pageIndex] ?? '';
    
    // Check if expected fields are mentioned in the page
    let hasContent = false;
    const fieldMatches: string[] = [];
    
    if (region.fields && region.fields.length > 0) {
      for (const field of region.fields) {
        // Look for field-related keywords in the page
        const fieldPatterns = getFieldPatterns(field);
        for (const pattern of fieldPatterns) {
          if (pageText.toLowerCase().includes(pattern.toLowerCase())) {
            hasContent = true;
            fieldMatches.push(field);
            break;
          }
        }
      }
    } else {
      // No specific fields - just check if region has any text
      // This is a weak signal, so we mark it as present
      hasContent = pageText.length > 50;
    }
    
    if (hasContent) {
      regionsWithContent++;
      matched.push(`roi:${region.name} (fields: ${fieldMatches.join(', ') || 'content present'})`);
    } else {
      missing.push(`roi:${region.name} (page ${region.page})`);
    }
  }
  
  // Calculate score based on regions matched
  const score = roiConfig.regions.length > 0
    ? Math.round((regionsWithContent / roiConfig.regions.length) * 100)
    : 50;
  
  return {
    type: 'roi',
    score,
    weight: DEFAULT_SIGNAL_WEIGHTS.roiWeight,
    confidence: getConfidenceFromScore(score),
    evidence: {
      matched,
      missing,
      details: {
        totalRegions: roiConfig.regions.length,
        matchedRegions: regionsWithContent,
        regionNames: roiConfig.regions.map(r => r.name),
      },
    },
  };
}

/**
 * Extract plausibility signal
 * Checks if field patterns (dates, signatures, job numbers) are present
 */
export function extractPlausibilitySignal(
  documentText: string,
  expectedFields: Array<{ field: string; type: string; pattern?: string }>
): SignalResult {
  const matched: string[] = [];
  const missing: string[] = [];
  let plausibleFields = 0;
  
  for (const field of expectedFields) {
    let found = false;
    
    // Check for field-specific patterns
    switch (field.type) {
      case 'date':
        // Look for date patterns
        const datePattern = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
        if (datePattern.test(documentText)) {
          found = true;
        }
        break;
        
      case 'pattern':
      case 'regex':
        // Use the specified pattern
        if (field.pattern) {
          try {
            const regex = new RegExp(field.pattern, 'i');
            if (regex.test(documentText)) {
              found = true;
            }
          } catch {
            // Invalid regex - skip
          }
        }
        break;
        
      case 'string':
      case 'required':
        // Look for field name mentions
        const fieldPatterns = getFieldPatterns(field.field);
        for (const pattern of fieldPatterns) {
          if (documentText.toLowerCase().includes(pattern.toLowerCase())) {
            found = true;
            break;
          }
        }
        break;
    }
    
    if (found) {
      plausibleFields++;
      matched.push(`field:${field.field}`);
    } else {
      missing.push(`field:${field.field}`);
    }
  }
  
  // Calculate score
  const score = expectedFields.length > 0
    ? Math.round((plausibleFields / expectedFields.length) * 100)
    : 50;
  
  return {
    type: 'plausibility',
    score,
    weight: DEFAULT_SIGNAL_WEIGHTS.plausibilityWeight,
    confidence: getConfidenceFromScore(score),
    evidence: {
      matched,
      missing,
      details: {
        totalFields: expectedFields.length,
        plausibleFields,
      },
    },
  };
}

// ============================================================================
// MULTI-SIGNAL COMBINATION
// ============================================================================

/**
 * Combine multiple signals into a single result
 */
export function combineSignals(
  signals: SignalResult[],
  customWeights?: Partial<MultiSignalConfig>
): MultiSignalResult {
  // Get versioned weights for traceability
  const versionedWeights = getVersionedWeights(customWeights);
  
  if (signals.length === 0) {
    return {
      combinedScore: 0,
      signals: [],
      confidence: 'LOW',
      combinedEvidence: {
        signalCount: 0,
        highConfidenceSignals: 0,
        weakSignals: [],
      },
      weightsUsed: versionedWeights,
    };
  }
  
  // Apply custom weights if provided
  const weights = { ...DEFAULT_SIGNAL_WEIGHTS, ...customWeights };
  
  // Update signal weights based on type
  const weightedSignals = signals.map(signal => {
    let weight = signal.weight;
    switch (signal.type) {
      case 'token':
        weight = weights.tokenWeight;
        break;
      case 'layout':
        weight = weights.layoutWeight;
        break;
      case 'roi':
        weight = weights.roiWeight;
        break;
      case 'plausibility':
        weight = weights.plausibilityWeight;
        break;
    }
    return { ...signal, weight };
  });
  
  // Calculate weighted average
  let totalWeight = 0;
  let weightedScore = 0;
  
  for (const signal of weightedSignals) {
    weightedScore += signal.score * signal.weight;
    totalWeight += signal.weight;
  }
  
  const combinedScore = totalWeight > 0
    ? Math.round(weightedScore / totalWeight)
    : 0;
  
  // Count high confidence signals
  const highConfidenceSignals = signals.filter(s => s.confidence === 'HIGH').length;
  const weakSignals = signals
    .filter(s => s.confidence === 'LOW')
    .map(s => s.type);
  
  return {
    combinedScore,
    signals: weightedSignals,
    confidence: getConfidenceFromScore(combinedScore),
    combinedEvidence: {
      signalCount: signals.length,
      highConfidenceSignals,
      weakSignals,
    },
    weightsUsed: versionedWeights,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get confidence band from score
 */
function getConfidenceFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 80) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

/**
 * Get field-related patterns to search for
 */
function getFieldPatterns(field: string): string[] {
  // Convert camelCase to words
  const words = field.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
  
  // Common variations
  const patterns: string[] = [
    field,
    words.join(' '),
    words.join(''),
  ];
  
  // Add common field name mappings
  const fieldMappings: Record<string, string[]> = {
    customerSignature: ['signature', 'sign here', 'customer sign', 'authorized by'],
    dateOfService: ['date', 'service date', 'date of service'],
    serialNumber: ['serial', 'serial no', 's/n', 'sn'],
    technicianName: ['technician', 'engineer', 'tech name'],
    workDescription: ['work performed', 'description', 'work done'],
    partsUsed: ['parts', 'materials', 'components'],
    timeIn: ['time in', 'start time', 'arrival'],
    timeOut: ['time out', 'end time', 'departure'],
    customerName: ['customer', 'client', 'company'],
    jobNumber: ['job no', 'job number', 'reference'],
  };
  
  if (fieldMappings[field]) {
    patterns.push(...fieldMappings[field]);
  }
  
  return patterns;
}
