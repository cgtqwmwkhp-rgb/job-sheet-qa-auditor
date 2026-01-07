/**
 * Template Registry Service
 * 
 * Manages document specification templates with:
 * - Loading and caching of spec packs
 * - Version tracking and schema validation
 * - Activation gate (templates must pass validation before use)
 * - Template lookup by ID or client
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface FieldRule {
  required: boolean;
  validators?: Array<{ type: string; [key: string]: unknown }>;
  constraints?: Array<{ type: string; [key: string]: unknown }>;
  extractionHints?: { labels?: string[]; section?: string };
  visualRule?: { type: string; [key: string]: unknown };
  llmRule?: { persona: string; prompt: string };
  documentationRule?: { ifYes?: { requiresFollowUp?: boolean; requiresComments?: boolean; description?: string } };
  notes?: string;
}

export interface ChecklistTask {
  taskId: string;
  task: string;
  resultType: 'green' | 'orange' | 'red' | 'yellow' | 'yesNo' | 'yesNoNa' | 'string' | 'number';
  required: boolean;
  killerQuestion?: boolean;
  expectedValue?: unknown;
  documentationRule?: { ifYes?: { requiresFollowUp?: boolean; requiresComments?: boolean; description?: string } };
  summaryQuestion?: boolean;
  notes?: string;
}

export interface ChecklistGroup {
  type: 'checklistGroup';
  items: ChecklistTask[];
  notes?: string;
}

export interface ValidationRule {
  ruleId: string;
  description: string;
}

export interface ROIDefinition {
  pageIndex0Based: number;
  regions: Array<{
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface Template {
  templateId: string;
  displayName: string;
  version: string;
  client: string;
  documentType: string;
  description: string;
  sampleFiles?: string[];
  fieldRules: Record<string, FieldRule | ChecklistGroup>;
  validationRules: ValidationRule[];
  roiOptional?: ROIDefinition;
}

export interface SpecPackDefaults {
  dateFormat: string;
  timezone: string;
  reviewQueueTriggers: string[];
  reviewQueueTriggerMappings?: Record<string, string>;
  criticalFields: string[];
  llmPersonas?: Record<string, { description: string; promptPrefix: string }>;
  checklistStatusLegend?: Record<string, { label: string; meaning: string; impact: string }>;
}

export interface AuditPerspective {
  description: string;
  passConditions: string[];
  failConditions: string[];
}

export interface SpecPack {
  packVersion: string;
  packId: string;
  displayName: string;
  client: string;
  createdAt: string;
  auditPerspective?: AuditPerspective;
  defaults: SpecPackDefaults;
  templates: Template[];
}

export interface TemplateRegistration {
  template: Template;
  packId: string;
  packVersion: string;
  registeredAt: Date;
  hash: string;
  status: 'active' | 'inactive' | 'deprecated';
  validationErrors: string[];
}

export interface RegistryStats {
  totalPacks: number;
  totalTemplates: number;
  activeTemplates: number;
  inactiveTemplates: number;
  deprecatedTemplates: number;
  lastUpdated: Date;
}

// ============================================================================
// Schema Validation
// ============================================================================

const REQUIRED_TEMPLATE_FIELDS = ['templateId', 'displayName', 'version', 'client', 'documentType', 'fieldRules', 'validationRules'];
const REQUIRED_PACK_FIELDS = ['packVersion', 'packId', 'displayName', 'client', 'defaults', 'templates'];

function validateTemplate(template: unknown): string[] {
  const errors: string[] = [];
  
  if (!template || typeof template !== 'object') {
    return ['Template must be an object'];
  }
  
  const t = template as Record<string, unknown>;
  
  // Check required fields
  for (const field of REQUIRED_TEMPLATE_FIELDS) {
    if (!(field in t)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate templateId format
  if (t.templateId && typeof t.templateId === 'string') {
    if (!/^[A-Z][A-Z0-9_]+_V\d+$/.test(t.templateId)) {
      errors.push(`Invalid templateId format: ${t.templateId}. Expected format: PREFIX_NAME_V1`);
    }
  }
  
  // Validate version format
  if (t.version && typeof t.version === 'string') {
    if (!/^\d+\.\d+\.\d+$/.test(t.version)) {
      errors.push(`Invalid version format: ${t.version}. Expected semver format: X.Y.Z`);
    }
  }
  
  // Validate fieldRules
  if (t.fieldRules && typeof t.fieldRules === 'object') {
    const fieldRules = t.fieldRules as Record<string, unknown>;
    for (const [fieldName, rule] of Object.entries(fieldRules)) {
      if (!rule || typeof rule !== 'object') {
        errors.push(`Invalid field rule for ${fieldName}`);
        continue;
      }
      
      const r = rule as Record<string, unknown>;
      
      // Check for required property (unless it's a checklistGroup)
      if (r.type !== 'checklistGroup' && !('required' in r)) {
        errors.push(`Field ${fieldName} missing 'required' property`);
      }
    }
  }
  
  // Validate validationRules
  if (t.validationRules && Array.isArray(t.validationRules)) {
    for (const rule of t.validationRules) {
      if (!rule || typeof rule !== 'object') {
        errors.push('Invalid validation rule');
        continue;
      }
      
      const r = rule as Record<string, unknown>;
      if (!r.ruleId || typeof r.ruleId !== 'string') {
        errors.push('Validation rule missing ruleId');
      }
      if (!r.description || typeof r.description !== 'string') {
        errors.push(`Validation rule ${r.ruleId || 'unknown'} missing description`);
      }
    }
  }
  
  return errors;
}

function validateSpecPack(pack: unknown): string[] {
  const errors: string[] = [];
  
  if (!pack || typeof pack !== 'object') {
    return ['Spec pack must be an object'];
  }
  
  const p = pack as Record<string, unknown>;
  
  // Check required fields
  for (const field of REQUIRED_PACK_FIELDS) {
    if (!(field in p)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate packVersion format
  if (p.packVersion && typeof p.packVersion === 'string') {
    if (!/^\d+\.\d+\.\d+$/.test(p.packVersion)) {
      errors.push(`Invalid packVersion format: ${p.packVersion}. Expected semver format: X.Y.Z`);
    }
  }
  
  // Validate templates
  if (p.templates && Array.isArray(p.templates)) {
    for (let i = 0; i < p.templates.length; i++) {
      const templateErrors = validateTemplate(p.templates[i]);
      errors.push(...templateErrors.map(e => `templates[${i}]: ${e}`));
    }
  }
  
  return errors;
}

// ============================================================================
// Template Registry Class
// ============================================================================

export class TemplateRegistry {
  private registrations: Map<string, TemplateRegistration> = new Map();
  private packs: Map<string, SpecPack> = new Map();
  private specsDir: string;
  private lastUpdated: Date = new Date();
  
  constructor(specsDir?: string) {
    this.specsDir = specsDir || path.join(__dirname, '..', 'specs');
  }
  
  /**
   * Load all spec packs from the specs directory
   */
  async loadAllPacks(): Promise<{ loaded: number; errors: string[] }> {
    const errors: string[] = [];
    let loaded = 0;
    
    if (!fs.existsSync(this.specsDir)) {
      return { loaded: 0, errors: [`Specs directory not found: ${this.specsDir}`] };
    }
    
    const files = fs.readdirSync(this.specsDir).filter(f => f.endsWith('-spec-pack.json'));
    
    for (const file of files) {
      try {
        const result = await this.loadPack(path.join(this.specsDir, file));
        if (result.errors.length > 0) {
          errors.push(...result.errors.map(e => `${file}: ${e}`));
        } else {
          loaded++;
        }
      } catch (err) {
        errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    this.lastUpdated = new Date();
    return { loaded, errors };
  }
  
  /**
   * Load a single spec pack from a file
   */
  async loadPack(filePath: string): Promise<{ pack: SpecPack | null; errors: string[] }> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content) as SpecPack;
    
    const errors = validateSpecPack(pack);
    if (errors.length > 0) {
      return { pack: null, errors };
    }
    
    // Register the pack
    this.packs.set(pack.packId, pack);
    
    // Register each template
    for (const template of pack.templates) {
      const hash = this.computeTemplateHash(template);
      const registration: TemplateRegistration = {
        template,
        packId: pack.packId,
        packVersion: pack.packVersion,
        registeredAt: new Date(),
        hash,
        status: 'active',
        validationErrors: validateTemplate(template),
      };
      
      // If there are validation errors, mark as inactive
      if (registration.validationErrors.length > 0) {
        registration.status = 'inactive';
      }
      
      this.registrations.set(template.templateId, registration);
    }
    
    this.lastUpdated = new Date();
    return { pack, errors: [] };
  }
  
  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): Template | null {
    const registration = this.registrations.get(templateId);
    if (!registration || registration.status !== 'active') {
      return null;
    }
    return registration.template;
  }
  
  /**
   * Get a template registration by ID (includes status and metadata)
   */
  getRegistration(templateId: string): TemplateRegistration | null {
    return this.registrations.get(templateId) || null;
  }
  
  /**
   * Get all templates for a client
   */
  getTemplatesByClient(client: string): Template[] {
    const templates: Template[] = [];
    for (const registration of this.registrations.values()) {
      if (registration.template.client === client && registration.status === 'active') {
        templates.push(registration.template);
      }
    }
    return templates;
  }
  
  /**
   * Get all active templates
   */
  getActiveTemplates(): Template[] {
    const templates: Template[] = [];
    for (const registration of this.registrations.values()) {
      if (registration.status === 'active') {
        templates.push(registration.template);
      }
    }
    return templates;
  }
  
  /**
   * Get all template IDs
   */
  getTemplateIds(): string[] {
    return Array.from(this.registrations.keys());
  }
  
  /**
   * Get a spec pack by ID
   */
  getPack(packId: string): SpecPack | null {
    return this.packs.get(packId) || null;
  }
  
  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    let active = 0;
    let inactive = 0;
    let deprecated = 0;
    
    for (const registration of this.registrations.values()) {
      switch (registration.status) {
        case 'active': active++; break;
        case 'inactive': inactive++; break;
        case 'deprecated': deprecated++; break;
      }
    }
    
    return {
      totalPacks: this.packs.size,
      totalTemplates: this.registrations.size,
      activeTemplates: active,
      inactiveTemplates: inactive,
      deprecatedTemplates: deprecated,
      lastUpdated: this.lastUpdated,
    };
  }
  
  /**
   * Activate a template (if it passes validation)
   */
  activateTemplate(templateId: string): { success: boolean; errors: string[] } {
    const registration = this.registrations.get(templateId);
    if (!registration) {
      return { success: false, errors: [`Template not found: ${templateId}`] };
    }
    
    // Re-validate
    const errors = validateTemplate(registration.template);
    if (errors.length > 0) {
      registration.validationErrors = errors;
      return { success: false, errors };
    }
    
    registration.status = 'active';
    registration.validationErrors = [];
    return { success: true, errors: [] };
  }
  
  /**
   * Deactivate a template
   */
  deactivateTemplate(templateId: string): boolean {
    const registration = this.registrations.get(templateId);
    if (!registration) {
      return false;
    }
    registration.status = 'inactive';
    return true;
  }
  
  /**
   * Deprecate a template
   */
  deprecateTemplate(templateId: string): boolean {
    const registration = this.registrations.get(templateId);
    if (!registration) {
      return false;
    }
    registration.status = 'deprecated';
    return true;
  }
  
  /**
   * Compute a hash for a template (for change detection)
   */
  private computeTemplateHash(template: Template): string {
    const content = JSON.stringify(template);
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
  
  /**
   * Check if a template has changed since registration
   */
  hasTemplateChanged(templateId: string, template: Template): boolean {
    const registration = this.registrations.get(templateId);
    if (!registration) {
      return true;
    }
    const newHash = this.computeTemplateHash(template);
    return newHash !== registration.hash;
  }
  
  /**
   * Clear all registrations
   */
  clear(): void {
    this.registrations.clear();
    this.packs.clear();
    this.lastUpdated = new Date();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: TemplateRegistry | null = null;

export function getTemplateRegistry(): TemplateRegistry {
  if (!registryInstance) {
    registryInstance = new TemplateRegistry();
  }
  return registryInstance;
}

export function resetTemplateRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export { validateTemplate, validateSpecPack };
