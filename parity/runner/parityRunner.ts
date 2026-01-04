/**
 * Parity Runner - Stage 8
 * 
 * Runs parity tests against golden dataset and generates reports.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type {
  GoldenDataset,
  GoldenDocument,
  GoldenValidatedField,
  ParityReport,
  DocumentComparison,
  FieldComparison,
  ParityStatus,
  ParityThresholds,
} from './types';
import { DEFAULT_THRESHOLDS } from './types';

/**
 * Parity Runner class
 */
export class ParityRunner {
  private goldenDataset: GoldenDataset | null = null;
  private thresholds: ParityThresholds;

  constructor(thresholds?: Partial<ParityThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Load golden dataset from file
   */
  loadGoldenDataset(path: string): void {
    const content = readFileSync(path, 'utf-8');
    this.goldenDataset = JSON.parse(content);
  }

  /**
   * Run parity test with actual results
   */
  runParity(actualResults: GoldenDocument[]): ParityReport {
    if (!this.goldenDataset) {
      throw new Error('Golden dataset not loaded');
    }

    const runId = this.generateRunId();
    const documentComparisons: DocumentComparison[] = [];

    // Compare each golden document with actual
    for (const goldenDoc of this.goldenDataset.documents) {
      const actualDoc = actualResults.find(d => d.id === goldenDoc.id);
      const comparison = this.compareDocument(goldenDoc, actualDoc);
      documentComparisons.push(comparison);
    }

    // Check for extra documents in actual
    for (const actualDoc of actualResults) {
      if (!this.goldenDataset.documents.find(d => d.id === actualDoc.id)) {
        documentComparisons.push({
          documentId: actualDoc.id,
          documentName: actualDoc.name,
          status: 'new',
          expectedResult: 'pass', // Unknown expected
          actualResult: actualDoc.expectedResult,
          fieldComparisons: [],
          findingsComparison: {
            expected: 0,
            actual: actualDoc.findings.length,
            matched: 0,
            missing: 0,
            extra: actualDoc.findings.length,
          },
          summary: { same: 0, improved: 0, worse: 0, new: actualDoc.validatedFields.length, missing: 0 },
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(documentComparisons);
    const violations = this.checkThresholds(summary, documentComparisons);

    const report: ParityReport = {
      version: '1.0.0',
      runId,
      timestamp: new Date().toISOString(),
      goldenVersion: this.goldenDataset.version,
      status: violations.length === 0 ? 'pass' : 'fail',
      summary,
      documents: documentComparisons,
      thresholds: this.thresholds,
      violations,
    };

    return report;
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

    // Determine overall document status
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

    // Compare each golden field
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

    // Check for new fields in actual
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

    // Check status change
    if (golden.status !== actual.status) {
      diff.statusChanged = true;
    }

    // Check value change
    if (JSON.stringify(golden.value) !== JSON.stringify(actual.value)) {
      diff.valueChanged = true;
    }

    // Check confidence change
    if (golden.confidence !== actual.confidence) {
      diff.confidenceChanged = actual.confidence - golden.confidence;
    }

    // Check severity change
    if (golden.severity !== actual.severity) {
      diff.severityChanged = true;
    }

    // Determine status
    let status: ParityStatus = 'same';
    
    if (Object.keys(diff).length > 0) {
      // Improved: status changed from failed to passed, or confidence increased
      if (
        (golden.status === 'failed' && actual.status === 'passed') ||
        (diff.confidenceChanged && diff.confidenceChanged > 0)
      ) {
        status = 'improved';
      }
      // Worse: status changed from passed to failed, or confidence decreased
      else if (
        (golden.status === 'passed' && actual.status === 'failed') ||
        (diff.confidenceChanged && diff.confidenceChanged < 0)
      ) {
        status = 'worse';
      }
      // Other changes are considered same (neutral)
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
    const matchedActual = new Set<number>();

    for (const gf of goldenFindings) {
      const match = actualFindings.find(
        af => af.ruleId === gf.ruleId && af.field === gf.field && !matchedActual.has(af.id)
      );
      if (match) {
        matched++;
        matchedActual.add(match.id);
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
  ): ParityReport['summary'] {
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
    summary: ParityReport['summary'],
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
  saveReport(report: ParityReport, outputDir: string): string {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = `parity-report-${report.runId}.json`;
    const filepath = join(outputDir, filename);
    
    writeFileSync(filepath, JSON.stringify(report, null, 2));
    
    return filepath;
  }

  /**
   * Generate summary markdown
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
