/**
 * Parity Runner - Stage 8 v2
 * 
 * Runs parity tests against positive and negative golden datasets.
 * - Positive suite: Documents expected to pass (strict thresholds)
 * - Negative suite: Documents expected to fail with specific reason codes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type {
  GoldenDataset,
  GoldenDocument,
  GoldenValidatedField,
  ParityReport,
  PositiveParityReport,
  NegativeParityReport,
  CombinedParityReport,
  DocumentComparison,
  NegativeDocumentResult,
  FieldComparison,
  ParityStatus,
  ParityThresholds,
  ExpectedFailure,
  CanonicalReasonCode,
} from './types';
import { DEFAULT_THRESHOLDS, isCanonicalReasonCode, mapToCanonicalReasonCode } from './types';

/**
 * Parity Runner class with positive/negative suite support
 */
export class ParityRunner {
  private positiveDataset: GoldenDataset | null = null;
  private negativeDataset: GoldenDataset | null = null;
  private thresholds: ParityThresholds;

  constructor(thresholds?: Partial<ParityThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Load positive golden dataset from file
   */
  loadPositiveDataset(path: string): void {
    const content = readFileSync(path, 'utf-8');
    this.positiveDataset = JSON.parse(content);
    this.validateDataset(this.positiveDataset!, 'positive');
  }

  /**
   * Load negative golden dataset from file
   */
  loadNegativeDataset(path: string): void {
    const content = readFileSync(path, 'utf-8');
    this.negativeDataset = JSON.parse(content);
    this.validateDataset(this.negativeDataset!, 'negative');
  }

  /**
   * Load legacy golden dataset (for backwards compatibility)
   */
  loadGoldenDataset(path: string): void {
    const content = readFileSync(path, 'utf-8');
    const dataset: GoldenDataset = JSON.parse(content);
    
    // Split into positive and negative
    this.positiveDataset = {
      ...dataset,
      documents: dataset.documents.filter(d => d.expectedResult === 'pass'),
    };
    
    this.negativeDataset = {
      ...dataset,
      documents: dataset.documents.filter(d => d.expectedResult === 'fail'),
    };
  }

  /**
   * Validate dataset for canonical reason codes
   */
  private validateDataset(dataset: GoldenDataset, suiteType: string): void {
    const errors: string[] = [];
    
    for (const doc of dataset.documents) {
      for (const field of doc.validatedFields) {
        if (field.reasonCode && !isCanonicalReasonCode(field.reasonCode)) {
          errors.push(
            `${suiteType}/${doc.id}/${field.ruleId}: Non-canonical reason code '${field.reasonCode}'`
          );
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Dataset validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Run positive suite parity test
   */
  runPositiveSuite(actualResults: GoldenDocument[]): PositiveParityReport {
    if (!this.positiveDataset) {
      throw new Error('Positive dataset not loaded');
    }

    const runId = this.generateRunId();
    const documentComparisons: DocumentComparison[] = [];

    // Compare each golden document with actual
    for (const goldenDoc of this.positiveDataset.documents) {
      const actualDoc = actualResults.find(d => d.id === goldenDoc.id);
      const comparison = this.compareDocument(goldenDoc, actualDoc);
      documentComparisons.push(comparison);
    }

    // Calculate summary
    const summary = this.calculateSummary(documentComparisons);
    const violations = this.checkThresholds(summary, documentComparisons);

    return {
      version: '2.0.0',
      runId,
      timestamp: new Date().toISOString(),
      goldenVersion: this.positiveDataset.version,
      suiteType: 'positive',
      status: violations.length === 0 ? 'pass' : 'fail',
      summary,
      documents: documentComparisons,
      thresholds: this.thresholds,
      violations,
    };
  }

  /**
   * Run negative suite parity test
   */
  runNegativeSuite(actualResults: GoldenDocument[]): NegativeParityReport {
    if (!this.negativeDataset) {
      throw new Error('Negative dataset not loaded');
    }

    const runId = this.generateRunId();
    const documentResults: NegativeDocumentResult[] = [];
    const violations: string[] = [];

    let totalExpectedFailures = 0;
    let matchedFailures = 0;
    let missedFailures = 0;
    let unexpectedFailures = 0;

    for (const goldenDoc of this.negativeDataset.documents) {
      const actualDoc = actualResults.find(d => d.id === goldenDoc.id);
      const result = this.compareNegativeDocument(goldenDoc, actualDoc);
      documentResults.push(result);

      totalExpectedFailures += result.expectedFailures.length;
      matchedFailures += result.matchedFailures.length;
      missedFailures += result.missedFailures.length;
      unexpectedFailures += result.unexpectedFailures.length;

      if (result.status === 'fail') {
        violations.push(
          `Document ${goldenDoc.id}: Expected failures not detected - ${result.missedFailures.map(f => f.ruleId).join(', ')}`
        );
      }
    }

    return {
      version: '2.0.0',
      runId,
      timestamp: new Date().toISOString(),
      goldenVersion: this.negativeDataset.version,
      suiteType: 'negative',
      status: violations.length === 0 ? 'pass' : 'fail',
      summary: {
        totalDocuments: documentResults.length,
        passed: documentResults.filter(d => d.status === 'pass').length,
        failed: documentResults.filter(d => d.status === 'fail').length,
        totalExpectedFailures,
        matchedFailures,
        missedFailures,
        unexpectedFailures,
      },
      documents: documentResults,
      violations,
    };
  }

  /**
   * Run combined parity test (both suites)
   */
  runCombinedParity(actualResults: GoldenDocument[]): CombinedParityReport {
    const positiveReport = this.runPositiveSuite(actualResults);
    const negativeReport = this.runNegativeSuite(actualResults);

    const allViolations = [
      ...positiveReport.violations.map(v => `[POSITIVE] ${v}`),
      ...negativeReport.violations.map(v => `[NEGATIVE] ${v}`),
    ];

    return {
      version: '2.0.0',
      runId: this.generateRunId(),
      timestamp: new Date().toISOString(),
      status: allViolations.length === 0 ? 'pass' : 'fail',
      positive: positiveReport,
      negative: negativeReport,
      violations: allViolations,
    };
  }

  /**
   * Legacy run parity (for backwards compatibility)
   */
  runParity(actualResults: GoldenDocument[]): ParityReport {
    if (!this.positiveDataset) {
      throw new Error('Golden dataset not loaded');
    }

    const runId = this.generateRunId();
    const documentComparisons: DocumentComparison[] = [];

    // Combine positive and negative datasets
    const allGoldenDocs = [
      ...(this.positiveDataset?.documents || []),
      ...(this.negativeDataset?.documents || []),
    ];

    for (const goldenDoc of allGoldenDocs) {
      const actualDoc = actualResults.find(d => d.id === goldenDoc.id);
      const comparison = this.compareDocument(goldenDoc, actualDoc);
      documentComparisons.push(comparison);
    }

    const summary = this.calculateSummary(documentComparisons);
    const violations = this.checkThresholds(summary, documentComparisons);

    return {
      version: '1.0.0',
      runId,
      timestamp: new Date().toISOString(),
      goldenVersion: this.positiveDataset.version,
      status: violations.length === 0 ? 'pass' : 'fail',
      summary,
      documents: documentComparisons,
      thresholds: this.thresholds,
      violations,
    };
  }

  /**
   * Compare a negative document (check expected failures are detected)
   */
  private compareNegativeDocument(
    golden: GoldenDocument,
    actual: GoldenDocument | undefined
  ): NegativeDocumentResult {
    const expectedFailures = golden.expectedFailures || [];
    
    if (!actual) {
      return {
        documentId: golden.id,
        documentName: golden.name,
        status: 'fail',
        expectedFailures,
        detectedFailures: [],
        matchedFailures: [],
        missedFailures: expectedFailures,
        unexpectedFailures: [],
      };
    }

    // Extract detected failures from actual results
    const detectedFailures: ExpectedFailure[] = actual.validatedFields
      .filter(f => f.status === 'failed')
      .map(f => ({
        ruleId: f.ruleId,
        field: f.field,
        reasonCode: mapToCanonicalReasonCode(f.reasonCode || 'OUT_OF_POLICY'),
        severity: f.severity,
      }));

    // Match expected vs detected
    const matchedFailures: ExpectedFailure[] = [];
    const missedFailures: ExpectedFailure[] = [];
    const unexpectedFailures: ExpectedFailure[] = [];

    for (const expected of expectedFailures) {
      const match = detectedFailures.find(
        d => d.ruleId === expected.ruleId && 
             d.field === expected.field &&
             d.reasonCode === expected.reasonCode
      );
      
      if (match) {
        matchedFailures.push(expected);
      } else {
        missedFailures.push(expected);
      }
    }

    for (const detected of detectedFailures) {
      const isExpected = expectedFailures.some(
        e => e.ruleId === detected.ruleId && e.field === detected.field
      );
      
      if (!isExpected) {
        unexpectedFailures.push(detected);
      }
    }

    return {
      documentId: golden.id,
      documentName: golden.name,
      status: missedFailures.length === 0 ? 'pass' : 'fail',
      expectedFailures,
      detectedFailures,
      matchedFailures,
      missedFailures,
      unexpectedFailures,
    };
  }

  /**
   * Compare a single document
   */
  private compareDocument(
    golden: GoldenDocument,
    actual: GoldenDocument | undefined
  ): DocumentComparison {
    if (!actual) {
      return {
        documentId: golden.id,
        documentName: golden.name,
        status: 'missing',
        expectedResult: golden.expectedResult,
        actualResult: null,
        fieldComparisons: golden.validatedFields.map(f => ({
          ruleId: f.ruleId,
          field: f.field,
          status: 'missing' as ParityStatus,
          expected: f,
          actual: null,
        })),
        findingsComparison: {
          expected: golden.findings.length,
          actual: 0,
          matched: 0,
          missing: golden.findings.length,
          extra: 0,
        },
        summary: {
          same: 0,
          improved: 0,
          worse: 0,
          new: 0,
          missing: golden.validatedFields.length,
        },
      };
    }

    const fieldComparisons = this.compareFields(
      golden.validatedFields,
      actual.validatedFields
    );

    const findingsComparison = this.compareFindings(golden, actual);

    const summary = {
      same: fieldComparisons.filter(f => f.status === 'same').length,
      improved: fieldComparisons.filter(f => f.status === 'improved').length,
      worse: fieldComparisons.filter(f => f.status === 'worse').length,
      new: fieldComparisons.filter(f => f.status === 'new').length,
      missing: fieldComparisons.filter(f => f.status === 'missing').length,
    };

    let status: ParityStatus = 'same';
    if (summary.worse > 0 || summary.missing > 0) {
      status = 'worse';
    } else if (summary.improved > 0) {
      status = 'improved';
    }

    return {
      documentId: golden.id,
      documentName: golden.name,
      status,
      expectedResult: golden.expectedResult,
      actualResult: actual.expectedResult,
      fieldComparisons,
      findingsComparison,
      summary,
    };
  }

  /**
   * Compare validated fields
   */
  private compareFields(
    golden: GoldenValidatedField[],
    actual: GoldenValidatedField[]
  ): FieldComparison[] {
    const comparisons: FieldComparison[] = [];

    for (const goldenField of golden) {
      const actualField = actual.find(f => f.ruleId === goldenField.ruleId);
      
      if (!actualField) {
        comparisons.push({
          ruleId: goldenField.ruleId,
          field: goldenField.field,
          status: 'missing',
          expected: goldenField,
          actual: null,
        });
        continue;
      }

      const comparison = this.compareField(goldenField, actualField);
      comparisons.push(comparison);
    }

    for (const actualField of actual) {
      if (!golden.find(f => f.ruleId === actualField.ruleId)) {
        comparisons.push({
          ruleId: actualField.ruleId,
          field: actualField.field,
          status: 'new',
          expected: null,
          actual: actualField,
        });
      }
    }

    // Sort by ruleId for deterministic ordering
    comparisons.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

    return comparisons;
  }

  /**
   * Compare a single field
   */
  private compareField(
    golden: GoldenValidatedField,
    actual: GoldenValidatedField
  ): FieldComparison {
    const diff: FieldComparison['diff'] = {};

    if (golden.status !== actual.status) {
      diff.statusChanged = true;
    }

    if (JSON.stringify(golden.value) !== JSON.stringify(actual.value)) {
      diff.valueChanged = true;
    }

    if (golden.confidence !== actual.confidence) {
      diff.confidenceChanged = actual.confidence - golden.confidence;
    }

    if (golden.severity !== actual.severity) {
      diff.severityChanged = true;
    }

    if (golden.reasonCode !== actual.reasonCode) {
      diff.reasonCodeChanged = true;
    }

    let status: ParityStatus = 'same';
    
    if (Object.keys(diff).length > 0) {
      if (
        (golden.status === 'failed' && actual.status === 'passed') ||
        (diff.confidenceChanged && diff.confidenceChanged > 0)
      ) {
        status = 'improved';
      } else if (
        (golden.status === 'passed' && actual.status === 'failed') ||
        (diff.confidenceChanged && diff.confidenceChanged < 0)
      ) {
        status = 'worse';
      }
    }

    return {
      ruleId: golden.ruleId,
      field: golden.field,
      status,
      expected: golden,
      actual,
      diff: Object.keys(diff).length > 0 ? diff : undefined,
    };
  }

  /**
   * Compare findings
   */
  private compareFindings(
    golden: GoldenDocument,
    actual: GoldenDocument
  ): DocumentComparison['findingsComparison'] {
    const goldenFindings = golden.findings;
    const actualFindings = actual.findings;

    let matched = 0;
    const matchedIds = new Set<string | number>();

    for (const gf of goldenFindings) {
      const match = actualFindings.find(
        af => af.ruleId === gf.ruleId && af.field === gf.field && !matchedIds.has(af.id)
      );
      if (match) {
        matched++;
        matchedIds.add(match.id);
      }
    }

    return {
      expected: goldenFindings.length,
      actual: actualFindings.length,
      matched,
      missing: goldenFindings.length - matched,
      extra: actualFindings.length - matched,
    };
  }

  /**
   * Calculate overall summary
   */
  private calculateSummary(
    comparisons: DocumentComparison[]
  ): PositiveParityReport['summary'] {
    let totalFields = 0;
    let fieldsSame = 0;
    let fieldsImproved = 0;
    let fieldsWorse = 0;

    for (const doc of comparisons) {
      totalFields += doc.fieldComparisons.length;
      fieldsSame += doc.summary.same;
      fieldsImproved += doc.summary.improved;
      fieldsWorse += doc.summary.worse + doc.summary.missing;
    }

    return {
      totalDocuments: comparisons.length,
      same: comparisons.filter(d => d.status === 'same').length,
      improved: comparisons.filter(d => d.status === 'improved').length,
      worse: comparisons.filter(d => d.status === 'worse' || d.status === 'missing').length,
      totalFields,
      fieldsSame,
      fieldsImproved,
      fieldsWorse,
    };
  }

  /**
   * Check thresholds and return violations
   */
  private checkThresholds(
    summary: PositiveParityReport['summary'],
    _comparisons: DocumentComparison[]
  ): string[] {
    const violations: string[] = [];

    if (summary.worse > this.thresholds.maxWorseDocuments) {
      violations.push(
        `Worse documents (${summary.worse}) exceeds threshold (${this.thresholds.maxWorseDocuments})`
      );
    }

    if (summary.fieldsWorse > this.thresholds.maxWorseFields) {
      violations.push(
        `Worse fields (${summary.fieldsWorse}) exceeds threshold (${this.thresholds.maxWorseFields})`
      );
    }

    const samePercentage = summary.totalFields > 0
      ? (summary.fieldsSame / summary.totalFields) * 100
      : 100;

    if (samePercentage < this.thresholds.minSamePercentage) {
      violations.push(
        `Same percentage (${samePercentage.toFixed(1)}%) below threshold (${this.thresholds.minSamePercentage}%)`
      );
    }

    return violations;
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 12);
  }

  /**
   * Save report to file
   */
  saveReport(report: ParityReport | CombinedParityReport, outputDir: string): string {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = `parity-report-${report.runId}.json`;
    const filepath = join(outputDir, filename);
    
    writeFileSync(filepath, JSON.stringify(report, null, 2));
    
    return filepath;
  }

  /**
   * Generate summary markdown for combined report
   */
  generateCombinedSummaryMarkdown(report: CombinedParityReport): string {
    const lines: string[] = [
      '# Parity Report (v2)',
      '',
      `**Run ID:** ${report.runId}`,
      `**Timestamp:** ${report.timestamp}`,
      `**Status:** ${report.status.toUpperCase()}`,
      '',
      '---',
      '',
      '## Positive Suite',
      '',
      `**Status:** ${report.positive.status.toUpperCase()}`,
      `**Golden Version:** ${report.positive.goldenVersion}`,
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Documents | ${report.positive.summary.totalDocuments} |`,
      `| Same | ${report.positive.summary.same} |`,
      `| Improved | ${report.positive.summary.improved} |`,
      `| Worse | ${report.positive.summary.worse} |`,
      `| Total Fields | ${report.positive.summary.totalFields} |`,
      `| Fields Same | ${report.positive.summary.fieldsSame} |`,
      '',
      '---',
      '',
      '## Negative Suite',
      '',
      `**Status:** ${report.negative.status.toUpperCase()}`,
      `**Golden Version:** ${report.negative.goldenVersion}`,
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Documents | ${report.negative.summary.totalDocuments} |`,
      `| Passed | ${report.negative.summary.passed} |`,
      `| Failed | ${report.negative.summary.failed} |`,
      `| Expected Failures | ${report.negative.summary.totalExpectedFailures} |`,
      `| Matched Failures | ${report.negative.summary.matchedFailures} |`,
      `| Missed Failures | ${report.negative.summary.missedFailures} |`,
      '',
    ];

    if (report.violations.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## Violations');
      lines.push('');
      for (const violation of report.violations) {
        lines.push(`- ❌ ${violation}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate summary markdown (legacy)
   */
  generateSummaryMarkdown(report: ParityReport): string {
    const lines: string[] = [
      '# Parity Report',
      '',
      `**Run ID:** ${report.runId}`,
      `**Timestamp:** ${report.timestamp}`,
      `**Golden Version:** ${report.goldenVersion}`,
      `**Status:** ${report.status.toUpperCase()}`,
      '',
      '## Summary',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Documents | ${report.summary.totalDocuments} |`,
      `| Same | ${report.summary.same} |`,
      `| Improved | ${report.summary.improved} |`,
      `| Worse | ${report.summary.worse} |`,
      `| Total Fields | ${report.summary.totalFields} |`,
      `| Fields Same | ${report.summary.fieldsSame} |`,
      `| Fields Improved | ${report.summary.fieldsImproved} |`,
      `| Fields Worse | ${report.summary.fieldsWorse} |`,
      '',
    ];

    if (report.violations.length > 0) {
      lines.push('## Violations');
      lines.push('');
      for (const violation of report.violations) {
        lines.push(`- ❌ ${violation}`);
      }
      lines.push('');
    }

    lines.push('## Document Details');
    lines.push('');

    for (const doc of report.documents) {
      const statusIcon = doc.status === 'same' ? '✅' : doc.status === 'improved' ? '📈' : '❌';
      lines.push(`### ${statusIcon} ${doc.documentName} (${doc.documentId})`);
      lines.push('');
      lines.push(`- Status: ${doc.status}`);
      lines.push(`- Expected Result: ${doc.expectedResult}`);
      lines.push(`- Actual Result: ${doc.actualResult ?? 'N/A'}`);
      lines.push(`- Fields: ${doc.summary.same} same, ${doc.summary.improved} improved, ${doc.summary.worse} worse`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Create parity runner instance
 */
export function createParityRunner(thresholds?: Partial<ParityThresholds>): ParityRunner {
  return new ParityRunner(thresholds);
}
