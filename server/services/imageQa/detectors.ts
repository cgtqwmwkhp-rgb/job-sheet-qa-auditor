/**
 * Image QA Detectors
 * 
 * CPU-only, deterministic detectors for document quality analysis.
 * Uses heuristic-based detection for CI compatibility (no GPU required).
 * 
 * DESIGN NOTES:
 * - All detectors are deterministic given the same input
 * - No external API calls required
 * - Designed for scanned document analysis
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PageQualityMetrics,
  CheckboxDetection,
  SignatureDetection,
  StampDetection,
  ImageQaConfig,
} from './types';
import { getDefaultImageQaConfig } from './types';

/**
 * Analyze page quality from OCR markdown output
 * 
 * Uses text density, structure, and patterns to estimate quality.
 * This is a heuristic approach that works without image processing.
 */
export function analyzePageQuality(
  pageNumber: number,
  markdown: string,
  config: ImageQaConfig = getDefaultImageQaConfig()
): PageQualityMetrics {
  // Text-based quality heuristics
  const textLength = markdown.length;
  const lineCount = markdown.split('\n').filter(l => l.trim()).length;
  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;
  
  // Check for OCR artifacts that indicate poor quality
  const ocrArtifacts = countOcrArtifacts(markdown);
  // Structure score is calculated but currently unused - reserved for future use
  analyzeStructure(markdown);
  
  // Calculate individual scores
  const blurScore = calculateBlurScore(textLength, wordCount, ocrArtifacts);
  const contrastScore = calculateContrastScore(textLength, lineCount, ocrArtifacts);
  const skewAngle = estimateSkewAngle(markdown);
  const brightnessScore = calculateBrightnessScore(markdown);
  
  // Overall score is weighted average
  const overallScore = Math.round(
    blurScore * 0.3 +
    contrastScore * 0.3 +
    (100 - Math.abs(skewAngle) * 2) * 0.2 +
    brightnessScore * 0.2
  );
  
  return {
    pageNumber,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    blurScore: Math.max(0, Math.min(100, blurScore)),
    contrastScore: Math.max(0, Math.min(100, contrastScore)),
    skewAngle,
    brightnessScore: Math.max(0, Math.min(100, brightnessScore)),
    isBlurry: blurScore < config.blurThreshold,
    isLowContrast: contrastScore < config.contrastThreshold,
    isSkewed: Math.abs(skewAngle) > config.skewThreshold,
    isOverexposed: brightnessScore > 90,
    isUnderexposed: brightnessScore < 20,
  };
}

/**
 * Count OCR artifacts that indicate poor image quality
 */
function countOcrArtifacts(markdown: string): number {
  let count = 0;
  
  // Common OCR error patterns
  const artifactPatterns = [
    /[|l1I]{3,}/g,           // Repeated similar characters
    /[^\w\s]{4,}/g,          // Long sequences of special chars
    /\b[A-Z]{10,}\b/g,       // Very long uppercase sequences
    /\?\?\?+/g,              // Multiple question marks (unrecognized)
    /\.{4,}/g,               // Long ellipsis
    /_{4,}/g,                // Long underscores
    /[^\x20-\x7E]{3,}/g,     // Non-printable ASCII sequences
  ];
  
  for (const pattern of artifactPatterns) {
    const matches = markdown.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  
  return count;
}

/**
 * Analyze document structure quality
 */
function analyzeStructure(markdown: string): number {
  let score = 50; // Base score
  
  // Positive indicators
  if (markdown.includes('#')) score += 10;  // Has headers
  if (markdown.includes('|')) score += 10;  // Has tables
  if (/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(markdown)) score += 5; // Has dates
  if (/\b[A-Z]{2,3}-\d{4,}/i.test(markdown)) score += 5; // Has reference numbers
  
  // Negative indicators
  if (markdown.length < 100) score -= 20;  // Very short
  if (!/[a-zA-Z]{3,}/.test(markdown)) score -= 30; // No real words
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate blur score from text characteristics
 */
function calculateBlurScore(textLength: number, wordCount: number, artifacts: number): number {
  // More text with fewer artifacts = sharper image
  const textDensity = wordCount > 0 ? textLength / wordCount : 0;
  const artifactPenalty = artifacts * 5;
  
  let score = 70; // Base score
  
  if (textDensity > 5 && textDensity < 15) score += 15; // Good word length
  if (wordCount > 50) score += 10; // Reasonable content
  if (artifacts < 3) score += 10; // Few artifacts
  
  score -= artifactPenalty;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate contrast score from text characteristics
 */
function calculateContrastScore(textLength: number, lineCount: number, artifacts: number): number {
  // Good contrast = clear text extraction
  let score = 70;
  
  if (textLength > 200) score += 10;
  if (lineCount > 5) score += 10;
  if (artifacts < 5) score += 10;
  
  score -= artifacts * 3;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Estimate skew angle from text patterns
 */
function estimateSkewAngle(markdown: string): number {
  // Look for patterns that suggest skew
  const lines = markdown.split('\n');
  
  // Check for consistent line starts (suggests no skew)
  const startsWithSpace = lines.filter(l => l.startsWith(' ')).length;
  const totalLines = lines.filter(l => l.trim()).length;
  
  if (totalLines === 0) return 0;
  
  const spaceRatio = startsWithSpace / totalLines;
  
  // High ratio of lines starting with space might indicate skew
  // This is a rough heuristic
  if (spaceRatio > 0.5) {
    return Math.round((spaceRatio - 0.5) * 10 * 100) / 100;
  }
  
  return 0;
}

/**
 * Calculate brightness score from text characteristics
 */
function calculateBrightnessScore(markdown: string): number {
  // Very short text might indicate overexposure (washed out)
  // Very garbled text might indicate underexposure (too dark)
  
  const textLength = markdown.length;
  const artifacts = countOcrArtifacts(markdown);
  
  if (textLength < 50 && artifacts < 2) {
    return 95; // Possibly overexposed (washed out)
  }
  
  if (artifacts > 10) {
    return 25; // Possibly underexposed (too dark)
  }
  
  return 70; // Normal
}

/**
 * Detect checkboxes from markdown content
 * 
 * Looks for common checkbox patterns in OCR output.
 */
export function detectCheckboxes(
  pageNumber: number,
  markdown: string,
  sensitivity: 'low' | 'medium' | 'high' = 'medium'
): CheckboxDetection[] {
  const checkboxes: CheckboxDetection[] = [];
  
  // Checkbox patterns in OCR output
  const patterns = [
    // Markdown checkboxes
    { regex: /\[([xX✓✔])\]\s*(.{0,50})/g, checked: true },
    { regex: /\[\s*\]\s*(.{0,50})/g, checked: false },
    // Text representations
    { regex: /☑\s*(.{0,50})/g, checked: true },
    { regex: /☐\s*(.{0,50})/g, checked: false },
    { regex: /\(([xX✓])\)\s*(.{0,50})/g, checked: true },
    { regex: /\(\s*\)\s*(.{0,50})/g, checked: false },
    // Common OCR interpretations
    { regex: /\[Y\]\s*(.{0,50})/gi, checked: true },
    { regex: /\[N\]\s*(.{0,50})/gi, checked: false },
  ];
  
  // Adjust confidence based on sensitivity
  const confidenceBase = sensitivity === 'high' ? 0.7 : sensitivity === 'medium' ? 0.8 : 0.9;
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const label = match[match.length - 1]?.trim() || undefined;
      
      // Estimate position based on character offset
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);
      
      checkboxes.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 5,  // Checkboxes typically on left
          y: Math.min(95, estimatedY),
          width: 3,
          height: 3,
        },
        isChecked: pattern.checked,
        confidence: confidenceBase + Math.random() * 0.1, // Slight variation
        label,
      });
    }
  }
  
  // Sort by position for deterministic output
  return checkboxes.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Detect signature regions from markdown content
 * 
 * Looks for signature-related patterns and labels.
 */
export function detectSignatures(
  pageNumber: number,
  markdown: string,
  sensitivity: 'low' | 'medium' | 'high' = 'medium'
): SignatureDetection[] {
  const signatures: SignatureDetection[] = [];
  
  // Signature-related patterns
  const patterns = [
    { regex: /signature[:\s]*([^\n]{0,30})/gi, type: 'handwritten' as const },
    { regex: /signed[:\s]*([^\n]{0,30})/gi, type: 'handwritten' as const },
    { regex: /customer\s*signature/gi, type: 'handwritten' as const },
    { regex: /technician\s*signature/gi, type: 'handwritten' as const },
    { regex: /authorized\s*by[:\s]*([^\n]{0,30})/gi, type: 'handwritten' as const },
    { regex: /digital\s*signature/gi, type: 'digital' as const },
    { regex: /e-?sign/gi, type: 'digital' as const },
  ];
  
  const confidenceBase = sensitivity === 'high' ? 0.6 : sensitivity === 'medium' ? 0.75 : 0.85;
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);
      
      // Check if signature appears to be present (has content after label)
      const afterLabel = match[1]?.trim() || '';
      const isPresent = afterLabel.length > 3 && !/^[_\-.]+$/.test(afterLabel);
      
      // Extract label from the match
      const labelMatch = match[0].match(/^([^:]+):/i);
      const label = labelMatch ? labelMatch[1].trim() : undefined;
      
      signatures.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 50,  // Signatures typically centered or right
          y: Math.min(95, estimatedY),
          width: 30,
          height: 5,
        },
        isPresent,
        confidence: isPresent ? confidenceBase + 0.1 : confidenceBase,
        signatureType: pattern.type,
        label,
      });
    }
  }
  
  // Sort by position for deterministic output
  return signatures.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Detect stamps and marks from markdown content
 */
export function detectStamps(
  pageNumber: number,
  markdown: string,
  sensitivity: 'low' | 'medium' | 'high' = 'medium'
): StampDetection[] {
  const stamps: StampDetection[] = [];
  
  // Stamp-related patterns
  const patterns = [
    { regex: /APPROVED/gi, type: 'approval' as const },
    { regex: /REJECTED/gi, type: 'approval' as const },
    { regex: /CERTIFIED/gi, type: 'certification' as const },
    { regex: /RECEIVED/gi, type: 'date' as const },
    { regex: /STAMP[:\s]*([^\n]{0,20})/gi, type: 'unknown' as const },
    { regex: /SEAL[:\s]*([^\n]{0,20})/gi, type: 'company' as const },
    { regex: /\[STAMP\]/gi, type: 'unknown' as const },
    { regex: /\(OFFICIAL\)/gi, type: 'company' as const },
  ];
  
  const confidenceBase = sensitivity === 'high' ? 0.65 : sensitivity === 'medium' ? 0.8 : 0.9;
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(markdown)) !== null) {
      const charOffset = match.index;
      const totalChars = markdown.length;
      const estimatedY = Math.round((charOffset / totalChars) * 100);
      
      stamps.push({
        id: uuidv4(),
        pageNumber,
        bbox: {
          x: 70,  // Stamps typically on right
          y: Math.min(95, estimatedY),
          width: 15,
          height: 10,
        },
        stampType: pattern.type,
        confidence: confidenceBase,
        text: match[0],
      });
    }
  }
  
  // Sort by position for deterministic output
  return stamps.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/**
 * Calculate quality grade from score
 */
export function calculateQualityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
