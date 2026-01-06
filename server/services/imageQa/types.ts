/**
 * Image QA Types
 * 
 * Defines types for document image quality analysis.
 * All detectors are deterministic and CPU-only for CI compatibility.
 */

/**
 * Bounding box for detected regions
 */
export interface BoundingBox {
  x: number;      // 0-100 percentage from left
  y: number;      // 0-100 percentage from top
  width: number;  // 0-100 percentage
  height: number; // 0-100 percentage
}

/**
 * Quality metrics for a single page
 */
export interface PageQualityMetrics {
  pageNumber: number;
  
  // Overall quality score (0-100)
  overallScore: number;
  
  // Individual quality dimensions (0-100)
  blurScore: number;        // Higher = sharper
  contrastScore: number;    // Higher = better contrast
  skewAngle: number;        // Degrees of rotation (-45 to 45)
  brightnessScore: number;  // Higher = better brightness
  
  // Quality flags
  isBlurry: boolean;
  isLowContrast: boolean;
  isSkewed: boolean;
  isOverexposed: boolean;
  isUnderexposed: boolean;
}

/**
 * Detected checkbox/tick mark
 */
export interface CheckboxDetection {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  isChecked: boolean;
  confidence: number;  // 0-1
  label?: string;      // Associated label text if detected
}

/**
 * Detected signature region
 */
export interface SignatureDetection {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  isPresent: boolean;
  confidence: number;  // 0-1
  signatureType: 'handwritten' | 'digital' | 'stamp' | 'unknown';
  label?: string;      // Associated label text if detected
}

/**
 * Detected stamp/mark
 */
export interface StampDetection {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  stampType: 'approval' | 'date' | 'company' | 'certification' | 'unknown';
  confidence: number;  // 0-1
  text?: string;       // OCR'd text from stamp if readable
}

/**
 * Complete Image QA result for a document
 */
export interface ImageQaResult {
  success: boolean;
  documentId: string;
  processedAt: string;
  processingTimeMs: number;
  
  // Per-page quality metrics
  pageMetrics: PageQualityMetrics[];
  
  // Aggregated document quality
  documentQuality: {
    overallScore: number;
    lowestPageScore: number;
    averagePageScore: number;
    qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    requiresReview: boolean;
    reviewReasons: string[];
  };
  
  // Detected elements
  checkboxes: CheckboxDetection[];
  signatures: SignatureDetection[];
  stamps: StampDetection[];
  
  // Summary counts
  summary: {
    totalPages: number;
    pagesWithIssues: number;
    checkboxesFound: number;
    checkboxesChecked: number;
    signaturesFound: number;
    signaturesPresent: number;
    stampsFound: number;
  };
  
  // Error information if failed
  error?: string;
  errorCode?: string;
}

/**
 * Configuration for Image QA processing
 */
export interface ImageQaConfig {
  // Quality thresholds
  blurThreshold: number;      // Below this = blurry (default: 30)
  contrastThreshold: number;  // Below this = low contrast (default: 20)
  skewThreshold: number;      // Above this = skewed (default: 5 degrees)
  
  // Review routing thresholds
  reviewQualityThreshold: number;  // Below this = route to review (default: 50)
  
  // Detection sensitivity
  checkboxSensitivity: 'low' | 'medium' | 'high';
  signatureSensitivity: 'low' | 'medium' | 'high';
  stampSensitivity: 'low' | 'medium' | 'high';
}

/**
 * Get default Image QA configuration
 */
export function getDefaultImageQaConfig(): ImageQaConfig {
  return {
    blurThreshold: 30,
    contrastThreshold: 20,
    skewThreshold: 5,
    reviewQualityThreshold: 50,
    checkboxSensitivity: 'medium',
    signatureSensitivity: 'medium',
    stampSensitivity: 'medium',
  };
}

/**
 * Review routing decision
 */
export interface ReviewRoutingDecision {
  shouldRoute: boolean;
  reasons: ReviewReason[];
  priority: 'low' | 'medium' | 'high';
}

/**
 * Reason for routing to review
 */
export interface ReviewReason {
  code: 'LOW_QUALITY' | 'MISSING_SIGNATURE' | 'UNCHECKED_REQUIRED' | 'SKEWED_DOCUMENT' | 'LOW_CONFIDENCE';
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  message: string;
  pageNumber?: number;
  affectedField?: string;
}
