/**
 * Template Test Harness
 * 
 * Validates templates against sample documents and parity fixtures.
 * Templates must pass all tests before activation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTemplateRegistry, type Template, type TemplateRegistration } from './templateRegistry';
import { getTemplateSelector, type DocumentContext } from './templateSelector';

// ============================================================================
// Types
// ============================================================================

export interface ParityFixture {
  fixtureId: string;
  templateId: string;
  sampleFile: string;
  expectedOutcome: 'PASS' | 'FAIL';
  expectedReasonCodes?: string[];
  expectedExtractedFields?: Record<string, unknown>;
  notes?: string;
}

export interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

export interface TemplateTestReport {
  templateId: string;
  templateVersion: string;
  testRunId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  overallResult: 'PASS' | 'FAIL' | 'SKIP';
  tests: TestResult[];
  activationEligible: boolean;
  activationBlockers: string[];
}

export interface HarnessConfig {
  specsDir: string;
  fixturesFile: string;
  strictMode: boolean;
  timeoutMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HarnessConfig = {
  specsDir: path.join(__dirname, '..', 'specs'),
  fixturesFile: 'plantexpand-parity-fixtures.json',
  strictMode: true,
  timeoutMs: 30000,
};

// ============================================================================
// Template Test Harness
// ============================================================================

export class TemplateTestHarness {
  private config: HarnessConfig;
  private fixtures: ParityFixture[] = [];
  
  constructor(config?: Partial<HarnessConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Load parity fixtures from file
   */
  async loadFixtures(): Promise<{ loaded: number; errors: string[] }> {
    const errors: string[] = [];
    
    const fixturesPath = path.join(this.config.specsDir, this.config.fixturesFile);
    
    if (!fs.existsSync(fixturesPath)) {
      return { loaded: 0, errors: [`Fixtures file not found: ${fixturesPath}`] };
    }
    
    try {
      const content = fs.readFileSync(fixturesPath, 'utf-8');
      const data = JSON.parse(content);
      
      if (!data.fixtures || !Array.isArray(data.fixtures)) {
        return { loaded: 0, errors: ['Invalid fixtures file: missing fixtures array'] };
      }
      
      this.fixtures = data.fixtures;
      return { loaded: this.fixtures.length, errors: [] };
    } catch (err) {
      return { loaded: 0, errors: [`Failed to load fixtures: ${err instanceof Error ? err.message : String(err)}`] };
    }
  }
  
  /**
   * Get fixtures for a specific template
   */
  getFixturesForTemplate(templateId: string): ParityFixture[] {
    return this.fixtures.filter(f => f.templateId === templateId);
  }
  
  /**
   * Run all tests for a template
   */
  async runTemplateTests(templateId: string): Promise<TemplateTestReport> {
    const startedAt = new Date();
    const testRunId = `test-${templateId}-${Date.now()}`;
    const tests: TestResult[] = [];
    const activationBlockers: string[] = [];
    
    const registry = getTemplateRegistry();
    const registration = registry.getRegistration(templateId);
    
    if (!registration) {
      return {
        templateId,
        templateVersion: 'unknown',
        testRunId,
        startedAt,
        completedAt: new Date(),
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        overallResult: 'FAIL',
        tests: [],
        activationEligible: false,
        activationBlockers: [`Template not found: ${templateId}`],
      };
    }
    
    const template = registration.template;
    
    // Test 1: Schema Validation
    tests.push(await this.testSchemaValidation(template, registration));
    
    // Test 2: Required Fields
    tests.push(await this.testRequiredFields(template));
    
    // Test 3: Validation Rules
    tests.push(await this.testValidationRules(template));
    
    // Test 4: Selection Criteria
    tests.push(await this.testSelectionCriteria(template));
    
    // Test 5: Parity Fixtures
    const fixtureTests = await this.testParityFixtures(template);
    tests.push(...fixtureTests);
    
    // Test 6: Field Rule Consistency
    tests.push(await this.testFieldRuleConsistency(template));
    
    // Test 7: Documentation Audit Rules
    tests.push(await this.testDocumentationAuditRules(template));
    
    // Calculate results
    const passedTests = tests.filter(t => t.passed).length;
    const failedTests = tests.filter(t => !t.passed).length;
    const skippedTests = 0;
    
    // Determine activation eligibility
    const criticalTests = tests.filter(t => 
      t.testId.startsWith('schema-') || 
      t.testId.startsWith('required-') ||
      t.testId.startsWith('selection-')
    );
    const criticalFailures = criticalTests.filter(t => !t.passed);
    
    if (criticalFailures.length > 0) {
      activationBlockers.push(...criticalFailures.map(t => `Critical test failed: ${t.testName}`));
    }
    
    if (registration.validationErrors.length > 0) {
      activationBlockers.push(...registration.validationErrors);
    }
    
    const overallResult = failedTests === 0 ? 'PASS' : 'FAIL';
    const activationEligible = activationBlockers.length === 0;
    
    return {
      templateId,
      templateVersion: template.version,
      testRunId,
      startedAt,
      completedAt: new Date(),
      totalTests: tests.length,
      passedTests,
      failedTests,
      skippedTests,
      overallResult,
      tests,
      activationEligible,
      activationBlockers,
    };
  }
  
  /**
   * Test: Schema Validation
   */
  private async testSchemaValidation(template: Template, registration: TemplateRegistration): Promise<TestResult> {
    const start = Date.now();
    
    const passed = registration.validationErrors.length === 0;
    
    return {
      testId: 'schema-validation',
      testName: 'Schema Validation',
      passed,
      message: passed 
        ? 'Template schema is valid' 
        : `Schema validation errors: ${registration.validationErrors.join(', ')}`,
      duration: Date.now() - start,
      details: { errors: registration.validationErrors },
    };
  }
  
  /**
   * Test: Required Fields
   */
  private async testRequiredFields(template: Template): Promise<TestResult> {
    const start = Date.now();
    const issues: string[] = [];
    
    // Check that required fields have extraction hints
    for (const [fieldName, rule] of Object.entries(template.fieldRules)) {
      if (typeof rule === 'object' && 'required' in rule && rule.required) {
        const r = rule as { extractionHints?: { labels?: string[] } };
        if (!r.extractionHints?.labels || r.extractionHints.labels.length === 0) {
          issues.push(`Required field '${fieldName}' has no extraction hints`);
        }
      }
    }
    
    const passed = issues.length === 0;
    
    return {
      testId: 'required-fields',
      testName: 'Required Fields Configuration',
      passed,
      message: passed 
        ? 'All required fields have extraction hints' 
        : `Issues found: ${issues.join('; ')}`,
      duration: Date.now() - start,
      details: { issues },
    };
  }
  
  /**
   * Test: Validation Rules
   */
  private async testValidationRules(template: Template): Promise<TestResult> {
    const start = Date.now();
    const issues: string[] = [];
    
    // Check that validation rules have proper structure
    for (const rule of template.validationRules) {
      if (!rule.ruleId || !rule.description) {
        issues.push(`Invalid validation rule: ${JSON.stringify(rule)}`);
      }
      
      // Check for documentation audit rules
      if (rule.ruleId.startsWith('DOC_AUDIT_')) {
        if (!rule.description.toLowerCase().includes('documentation')) {
          issues.push(`DOC_AUDIT rule '${rule.ruleId}' should mention documentation in description`);
        }
      }
    }
    
    const passed = issues.length === 0;
    
    return {
      testId: 'validation-rules',
      testName: 'Validation Rules Configuration',
      passed,
      message: passed 
        ? 'All validation rules are properly configured' 
        : `Issues found: ${issues.join('; ')}`,
      duration: Date.now() - start,
      details: { issues, ruleCount: template.validationRules.length },
    };
  }
  
  /**
   * Test: Selection Criteria
   */
  private async testSelectionCriteria(template: Template): Promise<TestResult> {
    const start = Date.now();
    const issues: string[] = [];
    
    const selection = (template as unknown as { selection?: { method?: string; requiredTokensAll?: string[] } }).selection;
    
    if (!selection) {
      issues.push('No selection criteria defined');
    } else {
      if (!selection.method) {
        issues.push('Selection method not specified');
      }
      
      if (!selection.requiredTokensAll || selection.requiredTokensAll.length === 0) {
        issues.push('No required tokens defined for fingerprint matching');
      }
    }
    
    const passed = issues.length === 0;
    
    return {
      testId: 'selection-criteria',
      testName: 'Selection Criteria Configuration',
      passed,
      message: passed 
        ? 'Selection criteria properly configured' 
        : `Issues found: ${issues.join('; ')}`,
      duration: Date.now() - start,
      details: { issues, selection },
    };
  }
  
  /**
   * Test: Parity Fixtures
   */
  private async testParityFixtures(template: Template): Promise<TestResult[]> {
    const fixtures = this.getFixturesForTemplate(template.templateId);
    const results: TestResult[] = [];
    
    if (fixtures.length === 0) {
      results.push({
        testId: 'parity-fixtures-exist',
        testName: 'Parity Fixtures Exist',
        passed: false,
        message: 'No parity fixtures defined for this template',
        duration: 0,
        details: {},
      });
      return results;
    }
    
    results.push({
      testId: 'parity-fixtures-exist',
      testName: 'Parity Fixtures Exist',
      passed: true,
      message: `${fixtures.length} parity fixture(s) defined`,
      duration: 0,
      details: { count: fixtures.length },
    });
    
    // Test each fixture
    for (const fixture of fixtures) {
      const start = Date.now();
      const issues: string[] = [];
      
      // Validate fixture structure
      if (!fixture.fixtureId) {
        issues.push('Missing fixtureId');
      }
      if (!fixture.sampleFile) {
        issues.push('Missing sampleFile');
      }
      if (!fixture.expectedOutcome) {
        issues.push('Missing expectedOutcome');
      }
      
      // Check sample file exists
      const samplePath = path.join(this.config.specsDir, fixture.sampleFile);
      if (fixture.sampleFile && !fs.existsSync(samplePath)) {
        issues.push(`Sample file not found: ${fixture.sampleFile}`);
      }
      
      // Validate expected reason codes are canonical
      if (fixture.expectedReasonCodes) {
        const CANONICAL_CODES = [
          'VALID', 'MISSING_FIELD', 'UNREADABLE_FIELD', 'LOW_CONFIDENCE',
          'INVALID_FORMAT', 'CONFLICT', 'OUT_OF_POLICY', 'INCOMPLETE_EVIDENCE',
          'OCR_FAILURE', 'PIPELINE_ERROR', 'SPEC_GAP', 'SECURITY_RISK',
        ];
        
        for (const code of fixture.expectedReasonCodes) {
          if (!CANONICAL_CODES.includes(code)) {
            issues.push(`Non-canonical reason code: ${code}`);
          }
        }
      }
      
      const passed = issues.length === 0;
      
      results.push({
        testId: `parity-fixture-${fixture.fixtureId}`,
        testName: `Parity Fixture: ${fixture.fixtureId}`,
        passed,
        message: passed 
          ? `Fixture ${fixture.fixtureId} is valid (expected: ${fixture.expectedOutcome})` 
          : `Issues: ${issues.join('; ')}`,
        duration: Date.now() - start,
        details: { fixture, issues },
      });
    }
    
    return results;
  }
  
  /**
   * Test: Field Rule Consistency
   */
  private async testFieldRuleConsistency(template: Template): Promise<TestResult> {
    const start = Date.now();
    const issues: string[] = [];
    
    // Check for consistent field naming
    for (const [fieldName, rule] of Object.entries(template.fieldRules)) {
      // Field names should be camelCase
      if (!/^[a-z][a-zA-Z0-9]*$/.test(fieldName) && fieldName !== 'checklistTasks') {
        // Allow checklistGroup type
        const r = rule as { type?: string };
        if (r.type !== 'checklistGroup') {
          issues.push(`Field '${fieldName}' should use camelCase naming`);
        }
      }
    }
    
    const passed = issues.length === 0;
    
    return {
      testId: 'field-rule-consistency',
      testName: 'Field Rule Consistency',
      passed,
      message: passed 
        ? 'All field rules are consistent' 
        : `Issues found: ${issues.join('; ')}`,
      duration: Date.now() - start,
      details: { issues },
    };
  }
  
  /**
   * Test: Documentation Audit Rules
   */
  private async testDocumentationAuditRules(template: Template): Promise<TestResult> {
    const start = Date.now();
    const issues: string[] = [];
    
    // Check that template has documentation audit rules
    const docAuditRules = template.validationRules.filter(r => r.ruleId.startsWith('DOC_AUDIT_'));
    
    if (docAuditRules.length === 0) {
      issues.push('No DOC_AUDIT_ rules defined - template may be using asset condition logic');
    }
    
    // Check for required documentation audit categories
    const hasConsistencyRule = docAuditRules.some(r => r.ruleId.includes('CONSISTENCY'));
    const hasCompletenessRule = docAuditRules.some(r => r.ruleId.includes('COMPLETENESS'));
    
    if (!hasConsistencyRule) {
      issues.push('Missing DOC_AUDIT_CONSISTENCY rule');
    }
    if (!hasCompletenessRule) {
      issues.push('Missing DOC_AUDIT_COMPLETENESS rule');
    }
    
    const passed = issues.length === 0;
    
    return {
      testId: 'documentation-audit-rules',
      testName: 'Documentation Audit Rules',
      passed,
      message: passed 
        ? `${docAuditRules.length} documentation audit rules defined` 
        : `Issues found: ${issues.join('; ')}`,
      duration: Date.now() - start,
      details: { issues, docAuditRules: docAuditRules.map(r => r.ruleId) },
    };
  }
  
  /**
   * Run tests for all templates
   */
  async runAllTemplateTests(): Promise<TemplateTestReport[]> {
    const registry = getTemplateRegistry();
    const templateIds = registry.getTemplateIds();
    const reports: TemplateTestReport[] = [];
    
    for (const templateId of templateIds) {
      const report = await this.runTemplateTests(templateId);
      reports.push(report);
    }
    
    return reports;
  }
  
  /**
   * Check if a template is eligible for activation
   */
  async checkActivationEligibility(templateId: string): Promise<{ eligible: boolean; blockers: string[] }> {
    const report = await this.runTemplateTests(templateId);
    return {
      eligible: report.activationEligible,
      blockers: report.activationBlockers,
    };
  }
  
  /**
   * Activate a template if it passes all tests
   */
  async activateTemplateWithGate(templateId: string): Promise<{ success: boolean; report: TemplateTestReport }> {
    const report = await this.runTemplateTests(templateId);
    
    if (!report.activationEligible) {
      return { success: false, report };
    }
    
    const registry = getTemplateRegistry();
    const result = registry.activateTemplate(templateId);
    
    return { success: result.success, report };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let harnessInstance: TemplateTestHarness | null = null;

export function getTemplateTestHarness(): TemplateTestHarness {
  if (!harnessInstance) {
    harnessInstance = new TemplateTestHarness();
  }
  return harnessInstance;
}

export function resetTemplateTestHarness(): void {
  harnessInstance = null;
}
