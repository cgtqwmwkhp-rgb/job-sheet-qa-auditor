/**
 * Conditional Rules Engine
 * 
 * Evaluates field dependencies, conditional formatting, and documentation audit rules.
 * Supports the documentation audit perspective where we check documentation quality,
 * not asset condition.
 */

import { getTemplateRegistry, type Template, type FieldRule, type ChecklistGroup, type ChecklistTask } from './templateRegistry';

// ============================================================================
// Types
// ============================================================================

export type ChecklistStatus = 'green' | 'orange' | 'red' | 'yellow' | 'yes' | 'no' | 'na' | 'unknown';

export interface ExtractedField {
  field: string;
  value: unknown;
  confidence: number;
  pageNumber?: number;
  source?: string;
}

export interface ValidationResult {
  ruleId: string;
  field: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  value: unknown;
  confidence: number;
  pageNumber?: number;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  reasonCode: string;
}

export interface ConditionalFormatting {
  field: string;
  status: ChecklistStatus;
  displayColor: string;
  displayLabel: string;
  impact: string;
}

export interface DocumentationAuditResult {
  templateId: string;
  documentOutcome: 'PASS' | 'FAIL';
  documentationQuality: 'complete' | 'incomplete' | 'inconsistent';
  validatedFields: ValidationResult[];
  findings: ValidationResult[];
  conditionalFormatting: ConditionalFormatting[];
  summary: {
    totalFields: number;
    passedFields: number;
    failedFields: number;
    warningFields: number;
    skippedFields: number;
    consistencyScore: number;
    completenessScore: number;
  };
  nextSteps: string[];
  reasonCodes: string[];
}

export interface RuleContext {
  extractedFields: Map<string, ExtractedField>;
  template: Template;
  checklistResults?: Map<string, ChecklistStatus>;
}

// ============================================================================
// Status Legend (from spec pack)
// ============================================================================

const STATUS_LEGEND: Record<ChecklistStatus, { displayColor: string; displayLabel: string; impact: string }> = {
  green: { displayColor: '#22c55e', displayLabel: 'Completed', impact: 'Task completed satisfactorily' },
  orange: { displayColor: '#f97316', displayLabel: 'Requires Attention', impact: 'Task requires follow-up or additional work' },
  red: { displayColor: '#ef4444', displayLabel: 'Failed/Critical', impact: 'Critical failure requiring immediate attention' },
  yellow: { displayColor: '#eab308', displayLabel: 'N/A', impact: 'Task not applicable for this asset type' },
  yes: { displayColor: '#22c55e', displayLabel: 'Yes', impact: 'Affirmative response' },
  no: { displayColor: '#ef4444', displayLabel: 'No', impact: 'Negative response' },
  na: { displayColor: '#9ca3af', displayLabel: 'N/A', impact: 'Not applicable' },
  unknown: { displayColor: '#6b7280', displayLabel: 'Unknown', impact: 'Status could not be determined' },
};

// ============================================================================
// Utility Functions
// ============================================================================

function normalizeStatus(value: unknown): ChecklistStatus {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  
  const str = String(value).toLowerCase().trim();
  
  if (['green', 'completed', 'pass', 'passed', 'ok'].includes(str)) {
    return 'green';
  }
  if (['orange', 'attention', 'warning', 'warn'].includes(str)) {
    return 'orange';
  }
  if (['red', 'failed', 'fail', 'critical', 'error'].includes(str)) {
    return 'red';
  }
  if (['yellow', 'n/a', 'na', 'not applicable'].includes(str)) {
    return 'yellow';
  }
  if (['yes', 'y', 'true', '1'].includes(str)) {
    return 'yes';
  }
  if (['no', 'n', 'false', '0'].includes(str)) {
    return 'no';
  }
  
  return 'unknown';
}

function getReasonCode(status: ChecklistStatus, context: string): string {
  switch (status) {
    case 'red':
      return 'OUT_OF_POLICY';
    case 'orange':
      return 'INCOMPLETE_EVIDENCE';
    case 'unknown':
      return 'UNREADABLE_FIELD';
    case 'no':
      // For documentation audit, 'no' is not automatically a failure
      // It depends on context
      return context.includes('killer') ? 'OUT_OF_POLICY' : 'VALID';
    default:
      return 'VALID';
  }
}

// ============================================================================
// Conditional Rules Engine
// ============================================================================

export class ConditionalRulesEngine {
  /**
   * Evaluate all rules for a document
   */
  evaluateDocument(
    templateId: string,
    extractedFields: ExtractedField[]
  ): DocumentationAuditResult {
    const registry = getTemplateRegistry();
    const template = registry.getTemplate(templateId);
    
    if (!template) {
      return this.createFailureResult(templateId, 'Template not found');
    }
    
    // Build context
    const fieldMap = new Map<string, ExtractedField>();
    for (const field of extractedFields) {
      fieldMap.set(field.field, field);
    }
    
    const context: RuleContext = {
      extractedFields: fieldMap,
      template,
      checklistResults: new Map(),
    };
    
    // Evaluate all field rules
    const validatedFields: ValidationResult[] = [];
    const conditionalFormatting: ConditionalFormatting[] = [];
    
    for (const [fieldName, rule] of Object.entries(template.fieldRules)) {
      if (typeof rule === 'object' && 'type' in rule && rule.type === 'checklistGroup') {
        // Handle checklist group
        const group = rule as ChecklistGroup;
        const groupResults = this.evaluateChecklistGroup(fieldName, group, context);
        validatedFields.push(...groupResults.validatedFields);
        conditionalFormatting.push(...groupResults.conditionalFormatting);
      } else {
        // Handle regular field
        const fieldRule = rule as FieldRule;
        const result = this.evaluateFieldRule(fieldName, fieldRule, context);
        validatedFields.push(result);
      }
    }
    
    // Evaluate documentation audit rules
    const docAuditResults = this.evaluateDocumentationAuditRules(template, context, validatedFields);
    validatedFields.push(...docAuditResults);
    
    // Calculate summary
    const findings = validatedFields.filter(v => v.status === 'failed');
    const summary = this.calculateSummary(validatedFields);
    
    // Determine overall outcome
    const documentOutcome = this.determineOutcome(validatedFields, template);
    const documentationQuality = this.determineQuality(summary);
    
    // Generate next steps
    const nextSteps = this.generateNextSteps(findings, template);
    
    // Collect reason codes
    const reasonCodes = [...new Set(findings.map(f => f.reasonCode))];
    
    return {
      templateId,
      documentOutcome,
      documentationQuality,
      validatedFields,
      findings,
      conditionalFormatting,
      summary,
      nextSteps,
      reasonCodes,
    };
  }
  
  /**
   * Evaluate a single field rule
   */
  private evaluateFieldRule(
    fieldName: string,
    rule: FieldRule,
    context: RuleContext
  ): ValidationResult {
    const extracted = context.extractedFields.get(fieldName);
    
    // Check if field is present
    if (!extracted) {
      if (rule.required) {
        return {
          ruleId: `FIELD_${fieldName.toUpperCase()}`,
          field: fieldName,
          status: 'failed',
          value: null,
          confidence: 0,
          severity: 'major',
          message: `Required field '${fieldName}' is missing`,
          reasonCode: 'MISSING_FIELD',
        };
      }
      return {
        ruleId: `FIELD_${fieldName.toUpperCase()}`,
        field: fieldName,
        status: 'skipped',
        value: null,
        confidence: 0,
        severity: 'info',
        message: `Optional field '${fieldName}' not present`,
        reasonCode: 'VALID',
      };
    }
    
    // Check confidence
    if (extracted.confidence < 0.7) {
      return {
        ruleId: `FIELD_${fieldName.toUpperCase()}`,
        field: fieldName,
        status: 'warning',
        value: extracted.value,
        confidence: extracted.confidence,
        pageNumber: extracted.pageNumber,
        severity: 'minor',
        message: `Field '${fieldName}' has low confidence (${(extracted.confidence * 100).toFixed(0)}%)`,
        reasonCode: 'LOW_CONFIDENCE',
      };
    }
    
    // Check validators
    if (rule.validators) {
      for (const validator of rule.validators) {
        const validationResult = this.runValidator(fieldName, extracted.value, validator);
        if (!validationResult.passed) {
          return {
            ruleId: `FIELD_${fieldName.toUpperCase()}`,
            field: fieldName,
            status: 'failed',
            value: extracted.value,
            confidence: extracted.confidence,
            pageNumber: extracted.pageNumber,
            severity: 'major',
            message: validationResult.message,
            reasonCode: 'INVALID_FORMAT',
          };
        }
      }
    }
    
    // Check documentation rules (conditional logic)
    if (rule.documentationRule?.ifYes) {
      const docRule = rule.documentationRule.ifYes;
      const status = normalizeStatus(extracted.value);
      
      if (status === 'yes') {
        // Check if follow-up is required
        if (docRule.requiresFollowUp) {
          const followUpField = context.extractedFields.get('returnVisitNeeded');
          if (!followUpField || normalizeStatus(followUpField.value) !== 'yes') {
            return {
              ruleId: `DOC_AUDIT_${fieldName.toUpperCase()}_FOLLOWUP`,
              field: fieldName,
              status: 'failed',
              value: extracted.value,
              confidence: extracted.confidence,
              pageNumber: extracted.pageNumber,
              severity: 'major',
              message: docRule.description || `Field '${fieldName}' = Yes requires follow-up to be documented`,
              reasonCode: 'INCOMPLETE_EVIDENCE',
            };
          }
        }
        
        // Check if comments are required
        if (docRule.requiresComments) {
          const commentsField = context.extractedFields.get('engineerComments');
          if (!commentsField || !commentsField.value || String(commentsField.value).trim().length < 10) {
            return {
              ruleId: `DOC_AUDIT_${fieldName.toUpperCase()}_COMMENTS`,
              field: fieldName,
              status: 'failed',
              value: extracted.value,
              confidence: extracted.confidence,
              pageNumber: extracted.pageNumber,
              severity: 'major',
              message: docRule.description || `Field '${fieldName}' = Yes requires engineer comments`,
              reasonCode: 'INCOMPLETE_EVIDENCE',
            };
          }
        }
      }
    }
    
    // Field passed
    return {
      ruleId: `FIELD_${fieldName.toUpperCase()}`,
      field: fieldName,
      status: 'passed',
      value: extracted.value,
      confidence: extracted.confidence,
      pageNumber: extracted.pageNumber,
      severity: 'info',
      message: `Field '${fieldName}' validated successfully`,
      reasonCode: 'VALID',
    };
  }
  
  /**
   * Evaluate a checklist group
   */
  private evaluateChecklistGroup(
    groupName: string,
    group: ChecklistGroup,
    context: RuleContext
  ): { validatedFields: ValidationResult[]; conditionalFormatting: ConditionalFormatting[] } {
    const validatedFields: ValidationResult[] = [];
    const conditionalFormatting: ConditionalFormatting[] = [];
    
    for (const task of group.items) {
      const extracted = context.extractedFields.get(task.taskId);
      const status = extracted ? normalizeStatus(extracted.value) : 'unknown';
      
      // Store in context for cross-referencing
      context.checklistResults?.set(task.taskId, status);
      
      // Add conditional formatting
      const legend = STATUS_LEGEND[status];
      conditionalFormatting.push({
        field: task.taskId,
        status,
        displayColor: legend.displayColor,
        displayLabel: legend.displayLabel,
        impact: legend.impact,
      });
      
      // Evaluate the task
      const result = this.evaluateChecklistTask(task, status, extracted, context);
      validatedFields.push(result);
    }
    
    return { validatedFields, conditionalFormatting };
  }
  
  /**
   * Evaluate a single checklist task
   */
  private evaluateChecklistTask(
    task: ChecklistTask,
    status: ChecklistStatus,
    extracted: ExtractedField | undefined,
    context: RuleContext
  ): ValidationResult {
    // Check if task is required but missing
    if (task.required && status === 'unknown') {
      return {
        ruleId: `TASK_${task.taskId.toUpperCase()}`,
        field: task.taskId,
        status: 'failed',
        value: null,
        confidence: 0,
        severity: 'major',
        message: `Required task '${task.task}' is not completed`,
        reasonCode: 'MISSING_FIELD',
      };
    }
    
    // Check killer questions (for documentation audit)
    if (task.killerQuestion && (status === 'no' || status === 'red')) {
      // For documentation audit: check if engineer documented the issue properly
      const commentsField = context.extractedFields.get('engineerComments');
      const hasComments = commentsField && String(commentsField.value).trim().length >= 10;
      
      if (!hasComments) {
        return {
          ruleId: `TASK_${task.taskId.toUpperCase()}_KILLER`,
          field: task.taskId,
          status: 'failed',
          value: extracted?.value,
          confidence: extracted?.confidence || 0,
          pageNumber: extracted?.pageNumber,
          severity: 'critical',
          message: `Killer question '${task.task}' failed but engineer did not document the reason`,
          reasonCode: 'INCOMPLETE_EVIDENCE',
        };
      }
      
      // Engineer documented the issue - documentation is complete
      return {
        ruleId: `TASK_${task.taskId.toUpperCase()}_KILLER`,
        field: task.taskId,
        status: 'passed',
        value: extracted?.value,
        confidence: extracted?.confidence || 0,
        pageNumber: extracted?.pageNumber,
        severity: 'info',
        message: `Killer question '${task.task}' failed but engineer properly documented the issue`,
        reasonCode: 'VALID',
      };
    }
    
    // Check summary questions
    if (task.summaryQuestion) {
      // Summary question should be consistent with other findings
      const killerResults = Array.from(context.checklistResults?.entries() || [])
        .filter(([id, s]) => {
          const t = context.template.fieldRules[id];
          return t && typeof t === 'object' && 'killerQuestion' in t && t.killerQuestion;
        });
      
      const hasKillerFailures = killerResults.some(([, s]) => s === 'no' || s === 'red');
      
      if (hasKillerFailures && (status === 'yes' || status === 'green')) {
        return {
          ruleId: `TASK_${task.taskId.toUpperCase()}_SUMMARY`,
          field: task.taskId,
          status: 'failed',
          value: extracted?.value,
          confidence: extracted?.confidence || 0,
          pageNumber: extracted?.pageNumber,
          severity: 'critical',
          message: `Summary question '${task.task}' is inconsistent with killer question failures`,
          reasonCode: 'CONFLICT',
        };
      }
    }
    
    // Check documentation rules
    if (task.documentationRule?.ifYes) {
      const docRule = task.documentationRule.ifYes;
      
      if (status === 'yes') {
        if (docRule.requiresFollowUp) {
          const followUpField = context.extractedFields.get('returnVisitNeeded');
          if (!followUpField || normalizeStatus(followUpField.value) !== 'yes') {
            return {
              ruleId: `TASK_${task.taskId.toUpperCase()}_FOLLOWUP`,
              field: task.taskId,
              status: 'failed',
              value: extracted?.value,
              confidence: extracted?.confidence || 0,
              pageNumber: extracted?.pageNumber,
              severity: 'major',
              message: docRule.description || `Task '${task.task}' = Yes requires follow-up`,
              reasonCode: 'INCOMPLETE_EVIDENCE',
            };
          }
        }
        
        if (docRule.requiresComments) {
          const commentsField = context.extractedFields.get('engineerComments');
          if (!commentsField || String(commentsField.value).trim().length < 10) {
            return {
              ruleId: `TASK_${task.taskId.toUpperCase()}_COMMENTS`,
              field: task.taskId,
              status: 'failed',
              value: extracted?.value,
              confidence: extracted?.confidence || 0,
              pageNumber: extracted?.pageNumber,
              severity: 'major',
              message: docRule.description || `Task '${task.task}' = Yes requires comments`,
              reasonCode: 'INCOMPLETE_EVIDENCE',
            };
          }
        }
      }
    }
    
    // Task passed
    return {
      ruleId: `TASK_${task.taskId.toUpperCase()}`,
      field: task.taskId,
      status: 'passed',
      value: extracted?.value,
      confidence: extracted?.confidence || 0,
      pageNumber: extracted?.pageNumber,
      severity: 'info',
      message: `Task '${task.task}' validated successfully`,
      reasonCode: 'VALID',
    };
  }
  
  /**
   * Evaluate documentation audit rules from template
   */
  private evaluateDocumentationAuditRules(
    template: Template,
    context: RuleContext,
    existingResults: ValidationResult[]
  ): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    for (const rule of template.validationRules) {
      if (!rule.ruleId.startsWith('DOC_AUDIT_')) {
        continue;
      }
      
      // Check consistency rules
      if (rule.ruleId.includes('CONSISTENCY')) {
        const consistencyResult = this.evaluateConsistencyRule(rule, context, existingResults);
        results.push(consistencyResult);
      }
      
      // Check completeness rules
      if (rule.ruleId.includes('COMPLETENESS')) {
        const completenessResult = this.evaluateCompletenessRule(rule, context);
        results.push(completenessResult);
      }
    }
    
    return results;
  }
  
  /**
   * Evaluate a consistency rule
   */
  private evaluateConsistencyRule(
    rule: { ruleId: string; description: string },
    context: RuleContext,
    existingResults: ValidationResult[]
  ): ValidationResult {
    // Check for conflicts in existing results
    const conflicts = existingResults.filter(r => r.reasonCode === 'CONFLICT');
    
    if (conflicts.length > 0) {
      return {
        ruleId: rule.ruleId,
        field: 'consistency',
        status: 'failed',
        value: null,
        confidence: 1,
        severity: 'critical',
        message: `${rule.description} - Found ${conflicts.length} consistency issue(s)`,
        reasonCode: 'CONFLICT',
      };
    }
    
    return {
      ruleId: rule.ruleId,
      field: 'consistency',
      status: 'passed',
      value: null,
      confidence: 1,
      severity: 'info',
      message: rule.description,
      reasonCode: 'VALID',
    };
  }
  
  /**
   * Evaluate a completeness rule
   */
  private evaluateCompletenessRule(
    rule: { ruleId: string; description: string },
    context: RuleContext
  ): ValidationResult {
    // Check for required fields
    const missingRequired: string[] = [];
    
    for (const [fieldName, fieldRule] of Object.entries(context.template.fieldRules)) {
      if (typeof fieldRule === 'object' && 'required' in fieldRule && fieldRule.required) {
        if (!context.extractedFields.has(fieldName)) {
          missingRequired.push(fieldName);
        }
      }
    }
    
    // Check for signature
    const hasSignature = context.extractedFields.has('technicianSignature') || 
                         context.extractedFields.has('engineerSignature');
    
    // Check for images
    const imageCount = context.extractedFields.get('imageCount');
    const hasImages = imageCount && Number(imageCount.value) >= 2;
    
    if (missingRequired.length > 0 || !hasSignature) {
      return {
        ruleId: rule.ruleId,
        field: 'completeness',
        status: 'failed',
        value: null,
        confidence: 1,
        severity: 'major',
        message: `${rule.description} - Missing: ${missingRequired.join(', ')}${!hasSignature ? ', signature' : ''}`,
        reasonCode: 'INCOMPLETE_EVIDENCE',
      };
    }
    
    return {
      ruleId: rule.ruleId,
      field: 'completeness',
      status: 'passed',
      value: null,
      confidence: 1,
      severity: 'info',
      message: rule.description,
      reasonCode: 'VALID',
    };
  }
  
  /**
   * Run a validator
   */
  private runValidator(
    fieldName: string,
    value: unknown,
    validator: { type: string; [key: string]: unknown }
  ): { passed: boolean; message: string } {
    switch (validator.type) {
      case 'regex': {
        const pattern = new RegExp(validator.pattern as string);
        const passed = pattern.test(String(value));
        return {
          passed,
          message: passed ? 'Regex validation passed' : `Value does not match pattern: ${validator.pattern}`,
        };
      }
      case 'required': {
        const passed = value !== null && value !== undefined && String(value).trim().length > 0;
        return {
          passed,
          message: passed ? 'Required validation passed' : 'Field is required but empty',
        };
      }
      case 'minLength': {
        const passed = String(value).length >= (validator.min as number);
        return {
          passed,
          message: passed ? 'Min length validation passed' : `Value must be at least ${validator.min} characters`,
        };
      }
      default:
        return { passed: true, message: 'Unknown validator type' };
    }
  }
  
  /**
   * Calculate summary statistics
   */
  private calculateSummary(validatedFields: ValidationResult[]): DocumentationAuditResult['summary'] {
    const passed = validatedFields.filter(v => v.status === 'passed').length;
    const failed = validatedFields.filter(v => v.status === 'failed').length;
    const warning = validatedFields.filter(v => v.status === 'warning').length;
    const skipped = validatedFields.filter(v => v.status === 'skipped').length;
    
    const total = validatedFields.length;
    const consistencyScore = total > 0 ? (total - validatedFields.filter(v => v.reasonCode === 'CONFLICT').length) / total : 1;
    const completenessScore = total > 0 ? passed / total : 0;
    
    return {
      totalFields: total,
      passedFields: passed,
      failedFields: failed,
      warningFields: warning,
      skippedFields: skipped,
      consistencyScore: Math.round(consistencyScore * 100) / 100,
      completenessScore: Math.round(completenessScore * 100) / 100,
    };
  }
  
  /**
   * Determine overall document outcome
   */
  private determineOutcome(validatedFields: ValidationResult[], template: Template): 'PASS' | 'FAIL' {
    // Critical failures always fail
    const criticalFailures = validatedFields.filter(v => v.status === 'failed' && v.severity === 'critical');
    if (criticalFailures.length > 0) {
      return 'FAIL';
    }
    
    // Major failures fail unless there are mitigating factors
    const majorFailures = validatedFields.filter(v => v.status === 'failed' && v.severity === 'major');
    if (majorFailures.length > 0) {
      return 'FAIL';
    }
    
    return 'PASS';
  }
  
  /**
   * Determine documentation quality
   */
  private determineQuality(summary: DocumentationAuditResult['summary']): 'complete' | 'incomplete' | 'inconsistent' {
    if (summary.consistencyScore < 0.9) {
      return 'inconsistent';
    }
    if (summary.completenessScore < 0.8) {
      return 'incomplete';
    }
    return 'complete';
  }
  
  /**
   * Generate next steps based on findings
   */
  private generateNextSteps(findings: ValidationResult[], template: Template): string[] {
    const steps: string[] = [];
    
    // Group findings by reason code
    const byReasonCode = new Map<string, ValidationResult[]>();
    for (const finding of findings) {
      const existing = byReasonCode.get(finding.reasonCode) || [];
      existing.push(finding);
      byReasonCode.set(finding.reasonCode, existing);
    }
    
    // Generate steps for each reason code
    if (byReasonCode.has('MISSING_FIELD')) {
      const fields = byReasonCode.get('MISSING_FIELD')!.map(f => f.field);
      steps.push(`Complete missing required fields: ${fields.join(', ')}`);
    }
    
    if (byReasonCode.has('INCOMPLETE_EVIDENCE')) {
      steps.push('Add supporting documentation (comments, photos, follow-up actions)');
    }
    
    if (byReasonCode.has('CONFLICT')) {
      steps.push('Review and resolve inconsistencies between fields');
    }
    
    if (byReasonCode.has('LOW_CONFIDENCE')) {
      steps.push('Re-scan document for better OCR quality');
    }
    
    if (byReasonCode.has('INVALID_FORMAT')) {
      steps.push('Correct field values to match expected format');
    }
    
    // Sort steps by priority (deterministic order)
    steps.sort();
    
    return steps;
  }
  
  /**
   * Create a failure result for error cases
   */
  private createFailureResult(templateId: string, message: string): DocumentationAuditResult {
    return {
      templateId,
      documentOutcome: 'FAIL',
      documentationQuality: 'incomplete',
      validatedFields: [],
      findings: [{
        ruleId: 'SYSTEM_ERROR',
        field: 'system',
        status: 'failed',
        value: null,
        confidence: 0,
        severity: 'critical',
        message,
        reasonCode: 'PIPELINE_ERROR',
      }],
      conditionalFormatting: [],
      summary: {
        totalFields: 0,
        passedFields: 0,
        failedFields: 1,
        warningFields: 0,
        skippedFields: 0,
        consistencyScore: 0,
        completenessScore: 0,
      },
      nextSteps: ['Resolve system error and retry'],
      reasonCodes: ['PIPELINE_ERROR'],
    };
  }
  
  /**
   * Get conditional formatting for a status
   */
  getConditionalFormatting(status: ChecklistStatus): ConditionalFormatting {
    const legend = STATUS_LEGEND[status];
    return {
      field: '',
      status,
      displayColor: legend.displayColor,
      displayLabel: legend.displayLabel,
      impact: legend.impact,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let engineInstance: ConditionalRulesEngine | null = null;

export function getConditionalRulesEngine(): ConditionalRulesEngine {
  if (!engineInstance) {
    engineInstance = new ConditionalRulesEngine();
  }
  return engineInstance;
}

export function resetConditionalRulesEngine(): void {
  engineInstance = null;
}
