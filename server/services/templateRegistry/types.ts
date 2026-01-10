/**
 * Template Registry Types
 * 
 * Type definitions for the template registry system.
 * Provides deterministic template management with versioning.
 */

/**
 * Template status values
 */
export type TemplateStatus = 'draft' | 'active' | 'deprecated' | 'archived';

/**
 * Confidence band for template selection
 */
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Selection configuration for template matching
 */
export interface SelectionConfig {
  /** Tokens that must ALL be present for a match */
  requiredTokensAll: string[];
  /** Tokens where at least ONE must be present */
  requiredTokensAny: string[];
  /** Form code regex pattern (optional) */
  formCodeRegex?: string;
  /** Optional tokens that boost score if present */
  optionalTokens: string[];
  /** Token weights for scoring (optional, defaults to 1.0) */
  tokenWeights?: Record<string, number>;
}

/**
 * Specification JSON structure (compatible with specResolver)
 */
export interface SpecJson {
  /** Spec name */
  name: string;
  /** Spec version */
  version: string;
  /** Field definitions */
  fields: FieldSpec[];
  /** Validation rules */
  rules: RuleSpec[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Field specification
 */
export interface FieldSpec {
  /** Canonical field ID */
  field: string;
  /** Human-readable label */
  label: string;
  /** Field data type */
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'list';
  /** Whether field is required */
  required: boolean;
  /** Extraction hints for OCR */
  extractionHints?: string[];
  /** Alternative field names */
  aliases?: string[];
}

/**
 * Rule specification
 */
export interface RuleSpec {
  /** Unique rule ID (e.g., 'R001') */
  ruleId: string;
  /** Field this rule validates */
  field: string;
  /** Rule description */
  description: string;
  /** Rule severity */
  severity: 'critical' | 'major' | 'minor' | 'info';
  /** Validation type */
  type: 'required' | 'format' | 'range' | 'pattern' | 'custom';
  /** Pattern for format/pattern rules */
  pattern?: string;
  /** Range for range rules */
  range?: { min?: number | string; max?: number | string };
  /** Whether rule is enabled */
  enabled: boolean;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * ROI (Region of Interest) configuration
 */
export interface RoiConfig {
  /** Named regions for document zones */
  regions: RoiRegion[];
}

/**
 * Single ROI region
 */
export interface RoiRegion {
  /** Region name */
  name: string;
  /** Page number (1-indexed) */
  page: number;
  /** Bounding box (normalized 0-1) */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Fields expected in this region */
  fields?: string[];
}

/**
 * Template creation input
 */
export interface CreateTemplateInput {
  templateId: string;
  name: string;
  client?: string;
  assetType?: string;
  workType?: string;
  description?: string;
  /** Template category (e.g., 'maintenance', 'inspection') */
  category?: string;
  /** Tags for search/filtering */
  tags?: string[];
  createdBy: number;
}

/**
 * Template version creation input
 */
export interface CreateVersionInput {
  templateId: number;
  version: string;
  specJson: SpecJson;
  selectionConfigJson: SelectionConfig;
  roiJson?: RoiConfig;
  changeNotes?: string;
  createdBy: number;
}

/**
 * Template with active version info
 */
export interface TemplateWithVersion {
  id: number;
  templateId: string;
  name: string;
  client: string | null;
  assetType: string | null;
  workType: string | null;
  status: TemplateStatus;
  description: string | null;
  activeVersionId: number | null;
  activeVersion: string | null;
  versionCount: number;
}

/**
 * Selection score for a template candidate
 */
export interface SelectionScore {
  templateId: number;
  versionId: number;
  templateSlug: string;
  score: number;
  matchedTokens: string[];
  missingRequired: string[];
  confidence: ConfidenceBand;
}

/**
 * Selection result from template selector
 */
export interface SelectionResult {
  /** Whether a template was confidently selected */
  selected: boolean;
  /** Selected template ID (if selected) */
  templateId?: number;
  /** Selected version ID (if selected) */
  versionId?: number;
  /** Confidence band */
  confidenceBand: ConfidenceBand;
  /** Top score */
  topScore: number;
  /** Runner-up score */
  runnerUpScore: number;
  /** Score gap */
  scoreGap: number;
  /** All candidates with scores (sorted by score desc, then templateId) */
  candidates: SelectionScore[];
  /** Matched tokens for selected template */
  matchedTokens: string[];
  /** Whether auto-processing is allowed */
  autoProcessingAllowed: boolean;
  /** Block reason if not allowed */
  blockReason?: string;
}
