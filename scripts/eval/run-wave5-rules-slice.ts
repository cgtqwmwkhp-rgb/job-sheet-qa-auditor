#!/usr/bin/env npx tsx
/**
 * Wave-5/6 deterministic rule slice CLI (FAULT, PARTS L1, ATTR, fitment).
 *
 * Evaluates fixture-backed rule metrics for FAULT-C010, PARTS-C010/011/013,
 * ATTR-C010, and PARTS-C030/031 (when partsAssetFitment module is merged).
 *
 * Exit codes:
 *   0 — pass (all runnable cases match expected rule IDs)
 *   2 — unavailable (fitment module not merged; honest, not a greenwash fail)
 *   1 — fail (rule mismatch) or fixture/IO error
 *
 * Usage:
 *   npx tsx scripts/eval/run-wave5-rules-slice.ts [--manifest path] [--report path]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  exitCodeForReport,
  runWave5RulesSlice,
  type Wave5RulesSliceReport,
} from "./wave5RulesSlice";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MANIFEST = path.join(
  __dirname,
  "../../parity/fixtures/wave5-rules/manifest.json"
);

const DEFAULT_REPORT = path.join(__dirname, "reports/wave5-rules-latest.json");

function parseArgs(argv: string[]): {
  manifestPath: string;
  reportPath: string;
} {
  let manifestPath = DEFAULT_MANIFEST;
  let reportPath = DEFAULT_REPORT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest" && argv[i + 1]) {
      manifestPath = path.resolve(argv[++i]);
    } else if (arg === "--report" && argv[i + 1]) {
      reportPath = path.resolve(argv[++i]);
    }
  }
  return { manifestPath, reportPath };
}

function printSummary(
  report: Wave5RulesSliceReport,
  manifestPath: string
): void {
  console.log("Wave-5/6 rules slice");
  console.log("====================");
  console.log(`Manifest:    ${manifestPath}`);
  console.log(`Run ID:      ${report.runId}`);
  console.log(`Status:      ${report.status}`);
  console.log(
    `Cases:       ${report.summary.passed}/${report.summary.total} passed` +
      (report.summary.unavailable > 0
        ? ` (${report.summary.unavailable} unavailable)`
        : "") +
      (report.summary.failed > 0 ? ` (${report.summary.failed} failed)` : "")
  );
  console.log(
    `Fitment:     ${report.fitmentModuleAvailable ? "module available" : "module unavailable (PARTS-C030/031 skipped)"}`
  );

  for (const c of report.cases) {
    const icon =
      c.status === "pass" ? "✓" : c.status === "unavailable" ? "○" : "✗";
    console.log(
      `  ${icon} ${c.id}: expected [${c.expectedRuleIds.join(", ")}]` +
        (c.actualRuleIds.length > 0
          ? ` → [${c.actualRuleIds.join(", ")}]`
          : "") +
        (c.note ? ` — ${c.note}` : "")
    );
  }

  if (report.blockers.length > 0) {
    console.log("Blockers:");
    for (const b of report.blockers) console.log(`  - ${b}`);
  }
}

async function main(): Promise<void> {
  const { manifestPath, reportPath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Wave-5 rules manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const report = await runWave5RulesSlice({ manifestPath });

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  printSummary(report, manifestPath);

  const code = exitCodeForReport(report);
  if (code === 0) {
    console.log("✅ Wave-5/6 rules slice PASS");
    process.exit(0);
  }
  if (code === 2) {
    console.log(
      "⚠️ Wave-5/6 rules slice UNAVAILABLE (fitment module not merged)"
    );
    process.exit(2);
  }
  console.log("❌ Wave-5/6 rules slice FAIL");
  process.exit(1);
}

main().catch(error => {
  console.error("❌ Wave-5/6 rules slice error:", error);
  process.exit(1);
});
