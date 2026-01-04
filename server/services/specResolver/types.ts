/**
 * Spec Resolver Types
 * 
 * Defines the specification pack system with layering support.
 * Packs can be layered: base → customer → document-type
 */

/**
 * Rule severity levels
 */
export type RuleSeverity = 'critical' | 'major' | 'minor' | 'info';

/**
 * Rule status after validation
 */
export type RuleStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Field data types for extraction
 */
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'list';

/**
 * Validation rule definition
 */
export interface ValidationRule {
  /**
   * Unique rule identifier (e.g., 'R001', 'R002')
   */
  ruleId: string;
  
  /**
   * Canonical field name being validated
   */
  field: string;
  
  /**
   * Human-readable rule description
   */
  description: string;
  
  /**
   * Rule severity
   */
  severity: RuleSeverity;
  
  /**
   * Validation type
   */
  type: 'required' | 'format' | 'range' | 'pattern' | 'custom';
  
  /**
   * Expected format/pattern (for format/pattern rules)
   */
  pattern?: string;
  
  /**
   * Min/max values (for range rules)
   */
  range?: {
    min?: number | string;
    max?: number | string;
  };
  
  /**
   * Custom validation function name (for custom rules)
   */
  customValidator?: string;
  
  /**
   * Whether rule is enabled
   */
  enabled: boolean;
  
  /**
   * Rule tags for filtering
   */
  tags?: string[];
}

/**
 * Field extraction definition
 */
export interface FieldDefinition {
  /**
   * Canonical field name
   */
  field: string;
  
  /**
   * Human-readable label
   */
  label: string;
  
  /**
   * Field data type
   */
  type: FieldType;
  
  /**
   * Whether field is required
   */
  required: boolean;
  
  /**
   * Extraction hints for OCR
   */
  extractionHints?: string[];
  
  /**
   * Alternative field names (for legacy compatibility)
   */
  aliases?: string[];
  
  /**
   * Default value if not found
   */
  defaultValue?: string | number | boolean;
  
  /**
   * Page number hint (1-indexed)
   */
  pageHint?: number;
}

/**
 * Specification pack definition
 */
export interface SpecPack {
  /**
   * Pack identifier (e.g., 'base', 'customer-acme', 'job-sheet-v2')
   */
  id: string;
  
  /**
   * Pack version (semver)
   */
  version: string;
  
  /**
   * Human-readable name
   */
  name: string;
  
  /**
   * Pack description
   */
  description?: string;
  
  /**
   * Parent pack ID for layering (null for base pack)
   */
  extends?: string;
  
  /**
   * Field definitions
   */
  fields: FieldDefinition[];
  
  /**
   * Validation rules
   */
  rules: ValidationRule[];
  
  /**
   * Pack metadata
   */
  metadata?: {
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
  };
}

/**
 * Resolved specification (after layering)
 */
export interface ResolvedSpec {
  /**
   * Resolved spec identifier
   */
  id: string;
  
  /**
   * Effective version (from top-most pack)
   */
  version: string;
  
  /**
   * Pack chain (base to top)
   */
  packChain: string[];
  
  /**
   * Merged field definitions
   */
  fields: Map<string, FieldDefinition>;
  
  /**
   * Merged validation rules (ordered by ruleId)
   */
  rules: ValidationRule[];
  
  /**
   * Resolution timestamp
   */
  resolvedAt: string;
}

/**
 * Spec resolver options
 */
export interface ResolverOptions {
  /**
   * Enable strict mode (fail on missing parent packs)
   */
  strict?: boolean;
  
  /**
   * Filter rules by tags
   */
  filterTags?: string[];
  
  /**
   * Exclude disabled rules
   */
  excludeDisabled?: boolean;
}

/**
 * Spec resolver interface
 */
export interface SpecResolver {
  /**
   * Register a spec pack
   */
  registerPack(pack: SpecPack): void;
  
  /**
   * Get a registered pack by ID
   */
  getPack(packId: string): SpecPack | undefined;
  
  /**
   * List all registered packs
   */
  listPacks(): SpecPack[];
  
  /**
   * Resolve a pack with its inheritance chain
   */
  resolve(packId: string, options?: ResolverOptions): ResolvedSpec;
  
  /**
   * Get all rules from resolved spec (deterministic order)
   */
  getRules(resolved: ResolvedSpec): ValidationRule[];
  
  /**
   * Get all fields from resolved spec
   */
  getFields(resolved: ResolvedSpec): FieldDefinition[];
}
