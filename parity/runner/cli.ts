#!/usr/bin/env npx tsx
/**
 * Parity Runner CLI - Stage 8 v2
 *
 * Usage:
 *   npx tsx parity/runner/cli.ts --mode subset
 *   npx tsx parity/runner/cli.ts --mode full
 *   npx tsx parity/runner/cli.ts --mode positive
 *   npx tsx parity/runner/cli.ts --mode negative
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createParityRunner } from "./parityRunner";
import {
  isParityRunSkippedError,
  resolveActualResults,
  shouldUseMockActualResults,
} from "./actualResults";
import type {
  GoldenDocument,
  GoldenDataset,
  CombinedParityReport,
} from "./types";

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PARITY_ROOT = join(__dirname, "..");
const POSITIVE_FIXTURES_PATH = join(
  PARITY_ROOT,
  "fixtures",
  "golden-positive.json"
);
const NEGATIVE_FIXTURES_PATH = join(
  PARITY_ROOT,
  "fixtures",
  "golden-negative.json"
);
const LEGACY_FIXTURES_PATH = join(
  PARITY_ROOT,
  "fixtures",
  "golden-dataset.json"
);
const THRESHOLDS_PATH = join(PARITY_ROOT, "config", "thresholds.json");
const REPORTS_PATH = join(PARITY_ROOT, "reports");

interface ThresholdsConfig {
  ci: {
    prSubsetDocIds: string[];
  };
}

/**
 * Load thresholds config
 */
function loadThresholds(): ThresholdsConfig {
  const content = readFileSync(THRESHOLDS_PATH, "utf-8");
  return JSON.parse(content);
}

type RunMode = "subset" | "full" | "positive" | "negative";

/**
 * Parse CLI arguments
 */
function parseArgs(): { mode: RunMode; mock: boolean } {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : "full";

  const validModes: RunMode[] = ["subset", "full", "positive", "negative"];
  if (!validModes.includes(mode as RunMode)) {
    console.error(`Invalid mode. Use --mode ${validModes.join(" | ")}`);
    process.exit(1);
  }

  return { mode: mode as RunMode, mock: shouldUseMockActualResults(args) };
}

/**
 * Load dataset from file
 */
function loadDataset(path: string): GoldenDataset {
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { mode, mock } = parseArgs();

  console.log(`🔍 Running parity tests in ${mode} mode...`);
  console.log(
    `🧪 Actual source: ${mock ? "mock fixture clone" : "real pipeline fixtures"}`
  );
  console.log(`📁 Reports: ${REPORTS_PATH}`);

  // Ensure reports directory exists
  if (!existsSync(REPORTS_PATH)) {
    mkdirSync(REPORTS_PATH, { recursive: true });
  }

  // Create runner with strict thresholds for positive suite
  const runner = createParityRunner({
    maxWorseDocuments: 0,
    maxWorseFields: 0,
    minSamePercentage: 100, // Strict: 100% for positive suite
  });

  // Determine which datasets to load based on mode
  let positiveDataset: GoldenDataset | null = null;
  let negativeDataset: GoldenDataset | null = null;

  if (mode === "positive" || mode === "full") {
    if (existsSync(POSITIVE_FIXTURES_PATH)) {
      positiveDataset = loadDataset(POSITIVE_FIXTURES_PATH);
      runner.loadPositiveDataset(POSITIVE_FIXTURES_PATH);
      console.log(
        `✅ Positive dataset loaded: ${positiveDataset.documents.length} documents`
      );
    } else {
      console.warn("⚠️ Positive dataset not found, using legacy dataset");
      const legacy = loadDataset(LEGACY_FIXTURES_PATH);
      positiveDataset = {
        ...legacy,
        documents: legacy.documents.filter(d => d.expectedResult === "pass"),
      };
    }
  }

  if (mode === "negative" || mode === "full") {
    if (existsSync(NEGATIVE_FIXTURES_PATH)) {
      negativeDataset = loadDataset(NEGATIVE_FIXTURES_PATH);
      runner.loadNegativeDataset(NEGATIVE_FIXTURES_PATH);
      console.log(
        `✅ Negative dataset loaded: ${negativeDataset.documents.length} documents`
      );
    } else {
      console.warn("⚠️ Negative dataset not found, using legacy dataset");
      const legacy = loadDataset(LEGACY_FIXTURES_PATH);
      negativeDataset = {
        ...legacy,
        documents: legacy.documents.filter(d => d.expectedResult === "fail"),
      };
    }
  }

  if (mode === "subset") {
    const thresholds = loadThresholds();
    const subsetDocIds = new Set(thresholds.ci.prSubsetDocIds);

    console.log(
      `📋 Subset mode: testing ${subsetDocIds.size} documents: ${Array.from(subsetDocIds).join(", ")}`
    );

    const legacy = loadDataset(LEGACY_FIXTURES_PATH);
    const subsetDocs = legacy.documents.filter(d => subsetDocIds.has(d.id));

    if (subsetDocs.length === 0) {
      console.error("❌ No documents found matching prSubsetDocIds");
      process.exit(1);
    }

    const positiveDocs = subsetDocs.filter(d => d.expectedResult === "pass");
    const negativeDocs = subsetDocs.filter(d => d.expectedResult === "fail");

    console.log(
      `✅ Found ${subsetDocs.length} documents: ${positiveDocs.length} positive, ${negativeDocs.length} negative`
    );

    const actualResults = await resolveActualResultsOrSkip(
      subsetDocs,
      mode,
      mock
    );

    const report = runSubsetParityV2(
      positiveDocs,
      negativeDocs,
      actualResults,
      legacy.version
    );

    const reportPath = join(REPORTS_PATH, `parity-report-${report.runId}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved: ${reportPath}`);

    const latestPath = join(REPORTS_PATH, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));

    const summaryPath = join(REPORTS_PATH, "latest-summary.md");
    writeFileSync(summaryPath, generateSubsetSummaryV2(report));

    printSubsetResults(report);
    return;
  }

  const allDocs = [
    ...(positiveDataset?.documents || []),
    ...(negativeDataset?.documents || []),
  ];
  const actualResults = await resolveActualResultsOrSkip(allDocs, mode, mock);
  console.log(`📊 Testing ${actualResults.length} documents`);

  // Run appropriate suite(s)
  if (mode === "full") {
    const report = runner.runCombinedParity(actualResults);

    const reportPath = runner.saveReport(report, REPORTS_PATH);
    console.log(`📄 Report saved: ${reportPath}`);

    const latestPath = join(REPORTS_PATH, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));

    const summary = runner.generateCombinedSummaryMarkdown(report);
    const summaryPath = join(REPORTS_PATH, "latest-summary.md");
    writeFileSync(summaryPath, summary);
    console.log(`📝 Summary saved: ${summaryPath}`);

    printCombinedResults(report);
  } else if (mode === "positive") {
    const report = runner.runPositiveSuite(actualResults);

    const latestPath = join(REPORTS_PATH, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));

    console.log("");
    console.log("═══════════════════════════════════════════");
    console.log(`POSITIVE SUITE: ${report.status.toUpperCase()}`);
    console.log(
      `Documents: ${report.summary.same} same, ${report.summary.improved} improved, ${report.summary.worse} worse`
    );
    console.log(
      `Fields: ${report.summary.fieldsSame} same, ${report.summary.fieldsImproved} improved, ${report.summary.fieldsWorse} worse`
    );
    console.log("═══════════════════════════════════════════");

    if (report.violations.length > 0) {
      console.log("");
      console.log("❌ Violations:");
      for (const violation of report.violations) {
        console.log(`   - ${violation}`);
      }
      process.exit(1);
    }

    console.log("");
    console.log("✅ Positive suite passed!");
  } else if (mode === "negative") {
    const report = runner.runNegativeSuite(actualResults);

    const latestPath = join(REPORTS_PATH, "latest.json");
    writeFileSync(latestPath, JSON.stringify(report, null, 2));

    console.log("");
    console.log("═══════════════════════════════════════════");
    console.log(`NEGATIVE SUITE: ${report.status.toUpperCase()}`);
    console.log(
      `Documents: ${report.summary.passed} passed, ${report.summary.failed} failed`
    );
    console.log(`Expected Failures: ${report.summary.totalExpectedFailures}`);
    console.log(
      `Matched: ${report.summary.matchedFailures}, Missed: ${report.summary.missedFailures}`
    );
    console.log("═══════════════════════════════════════════");

    if (report.violations.length > 0) {
      console.log("");
      console.log("❌ Violations:");
      for (const violation of report.violations) {
        console.log(`   - ${violation}`);
      }
      process.exit(1);
    }

    console.log("");
    console.log("✅ Negative suite passed!");
  }
}

async function resolveActualResultsOrSkip(
  docs: GoldenDocument[],
  mode: RunMode,
  mock: boolean
): Promise<GoldenDocument[]> {
  try {
    return await resolveActualResults(docs, { mock });
  } catch (error) {
    if (!isParityRunSkippedError(error)) {
      throw error;
    }

    const skippedReport = {
      version: "2.0.0",
      runId: `skipped-${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      status: "skipped",
      mode,
      actualSource: "real-pipeline",
      reasons: error.reasons,
    };

    const latestPath = join(REPORTS_PATH, "latest.json");
    writeFileSync(latestPath, JSON.stringify(skippedReport, null, 2));

    const summaryPath = join(REPORTS_PATH, "latest-summary.md");
    writeFileSync(summaryPath, generateSkippedSummary(mode, error.reasons));

    console.warn("");
    console.warn("SKIP: Real parity pipeline run was skipped.");
    for (const reason of error.reasons) {
      console.warn(` - ${reason}`);
    }
    console.warn("Use --mock or PARITY_MOCK=1 for offline fallback.");
    process.exit(0);
  }
}

function generateSkippedSummary(mode: RunMode, reasons: string[]): string {
  return `# Parity Report Skipped

**Mode**: ${mode}
**Actual Source**: real-pipeline

## Reasons
${reasons.map(reason => `- ${reason}`).join("\n")}
`;
}

interface SubsetReport {
  runId: string;
  timestamp: string;
  goldenVersion: string;
  scope: "subset";
  status: string;
  positive: {
    totalDocuments: number;
    same: number;
    worse: number;
    totalFields: number;
    fieldsSame: number;
    fieldsWorse: number;
    documents: {
      documentId: string;
      documentName: string;
      status: string;
      fieldComparisons: { field: string; status: string }[];
    }[];
  };
  negative: {
    totalDocuments: number;
    passed: number;
    failed: number;
    totalExpectedFailures: number;
    matchedFailures: number;
    missedFailures: number;
    documents: {
      documentId: string;
      documentName: string;
      status: string;
      expectedFailures: string[];
      matchedFailures: string[];
      missedFailures: string[];
    }[];
  };
  violations: string[];
}

function runSubsetParityV2(
  positiveDocs: GoldenDocument[],
  negativeDocs: GoldenDocument[],
  actualDocs: GoldenDocument[],
  goldenVersion: string
): SubsetReport {
  const runId = Math.random().toString(16).slice(2, 14);
  const violations: string[] = [];

  // --- Positive suite: field-level parity (golden vs actual) ---
  let posSame = 0,
    posWorse = 0;
  let posFieldsSame = 0,
    posFieldsWorse = 0;
  const posDocResults: SubsetReport["positive"]["documents"] = [];

  for (const expected of positiveDocs) {
    const actual = actualDocs.find(d => d.id === expected.id);
    if (!actual) {
      posWorse++;
      posFieldsWorse += expected.validatedFields.length;
      posDocResults.push({
        documentId: expected.id,
        documentName: expected.name,
        status: "missing",
        fieldComparisons: expected.validatedFields.map(f => ({
          field: f.field,
          status: "missing",
        })),
      });
      continue;
    }

    let docFieldsSame = 0;
    const fieldComps: { field: string; status: string }[] = [];

    for (const expField of expected.validatedFields) {
      const actField = actual.validatedFields.find(
        f => f.ruleId === expField.ruleId
      );
      if (
        !actField ||
        expField.status !== actField.status ||
        expField.value !== actField.value
      ) {
        posFieldsWorse++;
        fieldComps.push({
          field: expField.field,
          status: actField ? "worse" : "missing",
        });
      } else {
        posFieldsSame++;
        docFieldsSame++;
        fieldComps.push({ field: expField.field, status: "same" });
      }
    }

    const docStatus =
      docFieldsSame === expected.validatedFields.length ? "same" : "worse";
    if (docStatus === "same") posSame++;
    else posWorse++;

    posDocResults.push({
      documentId: expected.id,
      documentName: expected.name,
      status: docStatus,
      fieldComparisons: fieldComps,
    });
  }

  if (posWorse > 0) {
    violations.push(
      `[POSITIVE] ${posWorse} document(s) regressed (${posFieldsWorse} field mismatches)`
    );
  }

  // --- Negative suite: expected-failure detection ---
  let negPassed = 0,
    negFailed = 0;
  let negTotalExpected = 0,
    negMatched = 0,
    negMissed = 0;
  const negDocResults: SubsetReport["negative"]["documents"] = [];

  for (const expected of negativeDocs) {
    const actual = actualDocs.find(d => d.id === expected.id);
    const expectedFailures =
      expected.expectedFailures && expected.expectedFailures.length > 0
        ? expected.expectedFailures
        : expected.validatedFields
            .filter(f => f.status === "failed")
            .map(f => ({
              ruleId: f.ruleId,
              field: f.field,
              reasonCode: f.reasonCode ?? "MISSING_FIELD",
              severity: f.severity,
            }));
    negTotalExpected += expectedFailures.length;

    if (!actual) {
      negFailed++;
      negMissed += expectedFailures.length;
      negDocResults.push({
        documentId: expected.id,
        documentName: expected.name,
        status: "fail",
        expectedFailures: expectedFailures.map(f => `${f.ruleId}/${f.field}`),
        matchedFailures: [],
        missedFailures: expectedFailures.map(f => `${f.ruleId}/${f.field}`),
      });
      continue;
    }

    const detectedFailedRules = actual.validatedFields
      .filter(f => f.status === "failed")
      .map(f => ({
        ruleId: f.ruleId,
        field: f.field,
        reasonCode: f.reasonCode,
      }));

    const matched: string[] = [];
    const missed: string[] = [];

    for (const ef of expectedFailures) {
      const found = detectedFailedRules.some(
        d => d.ruleId === ef.ruleId && d.field === ef.field
      );
      const label = `${ef.ruleId}/${ef.field}`;
      if (found) {
        matched.push(label);
        negMatched++;
      } else {
        missed.push(label);
        negMissed++;
      }
    }

    const docStatus = missed.length === 0 ? "pass" : "fail";
    if (docStatus === "pass") negPassed++;
    else negFailed++;

    negDocResults.push({
      documentId: expected.id,
      documentName: expected.name,
      status: docStatus,
      expectedFailures: expectedFailures.map(f => `${f.ruleId}/${f.field}`),
      matchedFailures: matched,
      missedFailures: missed,
    });
  }

  if (negFailed > 0) {
    violations.push(
      `[NEGATIVE] ${negFailed} document(s) failed expected-failure detection (${negMissed} missed)`
    );
  }

  return {
    runId,
    timestamp: new Date().toISOString(),
    goldenVersion,
    scope: "subset",
    status: violations.length === 0 ? "pass" : "fail",
    positive: {
      totalDocuments: positiveDocs.length,
      same: posSame,
      worse: posWorse,
      totalFields: posFieldsSame + posFieldsWorse,
      fieldsSame: posFieldsSame,
      fieldsWorse: posFieldsWorse,
      documents: posDocResults,
    },
    negative: {
      totalDocuments: negativeDocs.length,
      passed: negPassed,
      failed: negFailed,
      totalExpectedFailures: negTotalExpected,
      matchedFailures: negMatched,
      missedFailures: negMissed,
      documents: negDocResults,
    },
    violations,
  };
}

function generateSubsetSummaryV2(report: SubsetReport): string {
  const lines: string[] = [
    "# Parity Subset Report",
    "",
    `**Status**: ${report.status.toUpperCase()}`,
    `**Scope**: PR subset (${report.positive.totalDocuments} positive, ${report.negative.totalDocuments} negative)`,
    "",
    "## Positive Suite (field-level parity)",
    "",
    `- Documents: ${report.positive.same} same, ${report.positive.worse} regressed`,
    `- Fields: ${report.positive.fieldsSame} same, ${report.positive.fieldsWorse} mismatched`,
    "",
  ];

  if (report.positive.documents.length > 0) {
    for (const doc of report.positive.documents) {
      const icon = doc.status === "same" ? "✅" : "❌";
      lines.push(
        `${icon} **${doc.documentName}** (${doc.documentId}): ${doc.status}`
      );
    }
    lines.push("");
  }

  lines.push("## Negative Suite (expected-failure detection)");
  lines.push("");
  lines.push(
    `- Documents: ${report.negative.passed} passed, ${report.negative.failed} failed`
  );
  lines.push(
    `- Expected failures: ${report.negative.matchedFailures}/${report.negative.totalExpectedFailures} matched`
  );
  lines.push("");

  if (report.negative.documents.length > 0) {
    for (const doc of report.negative.documents) {
      const icon = doc.status === "pass" ? "✅" : "❌";
      const detail =
        doc.missedFailures.length > 0
          ? ` (missed: ${doc.missedFailures.join(", ")})`
          : "";
      lines.push(
        `${icon} **${doc.documentName}** (${doc.documentId})${detail}`
      );
    }
    lines.push("");
  }

  if (report.violations.length > 0) {
    lines.push("## Violations");
    lines.push("");
    for (const v of report.violations) {
      lines.push(`- ❌ ${v}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function printCombinedResults(report: CombinedParityReport): void {
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log(`COMBINED STATUS: ${report.status.toUpperCase()}`);
  console.log("───────────────────────────────────────────");
  console.log(`POSITIVE: ${report.positive.status.toUpperCase()}`);
  console.log(
    `  Documents: ${report.positive.summary.same} same, ${report.positive.summary.improved} improved, ${report.positive.summary.worse} worse`
  );
  console.log(`  Fields: ${report.positive.summary.fieldsSame} same`);
  console.log("───────────────────────────────────────────");
  console.log(`NEGATIVE: ${report.negative.status.toUpperCase()}`);
  console.log(
    `  Documents: ${report.negative.summary.passed} passed, ${report.negative.summary.failed} failed`
  );
  console.log(
    `  Expected Failures: ${report.negative.summary.totalExpectedFailures}`
  );
  console.log(
    `  Matched: ${report.negative.summary.matchedFailures}, Missed: ${report.negative.summary.missedFailures}`
  );
  console.log("═══════════════════════════════════════════");

  if (report.violations.length > 0) {
    console.log("");
    console.log("❌ Violations:");
    for (const violation of report.violations) {
      console.log(`   - ${violation}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("✅ All parity checks passed!");
}

function printSubsetResults(report: SubsetReport): void {
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log(`SUBSET STATUS: ${report.status.toUpperCase()}`);
  console.log("───────────────────────────────────────────");
  console.log(
    `POSITIVE: ${report.positive.same} same, ${report.positive.worse} worse`
  );
  console.log(
    `  Fields: ${report.positive.fieldsSame} same, ${report.positive.fieldsWorse} mismatched`
  );
  console.log("───────────────────────────────────────────");
  console.log(
    `NEGATIVE: ${report.negative.passed} passed, ${report.negative.failed} failed`
  );
  console.log(
    `  Expected failures: ${report.negative.matchedFailures}/${report.negative.totalExpectedFailures} matched`
  );
  console.log("═══════════════════════════════════════════");

  if (report.violations.length > 0) {
    console.log("");
    console.log("❌ Violations:");
    for (const violation of report.violations) {
      console.log(`   - ${violation}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("✅ Parity subset check passed!");
}

main().catch(err => {
  console.error("❌ Parity runner failed:", err);
  process.exit(1);
});
