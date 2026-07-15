#!/usr/bin/env npx tsx
/**
 * Field exact-match F1 gate CLI (Wave-4 A3)
 *
 * Loads the labelled field-F1 corpus and evaluates the challenge bar.
 * Exit codes:
 *   0 — pass
 *   2 — unavailable (insufficient N; honest, not a greenwash fail)
 *   1 — fail (ready and below F1 floor) or fixture/IO error
 *
 * Usage:
 *   npx tsx scripts/eval/run-field-f1-gate.ts [--fixture path] [--critical-only]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  evaluateFieldF1Gate,
  type FieldObservation,
} from "../../server/services/fieldF1Gate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FIXTURE = path.join(
  __dirname,
  "../../parity/fixtures/field-f1-labelled.json"
);

interface LabelledFixture {
  version: string;
  minSamplesRequired?: number;
  minExactMatchF1?: number;
  observations: FieldObservation[];
}

function parseArgs(argv: string[]): {
  fixturePath: string;
  criticalOnly: boolean;
} {
  let fixturePath = DEFAULT_FIXTURE;
  let criticalOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture" && argv[i + 1]) {
      fixturePath = path.resolve(argv[++i]);
    } else if (arg === "--critical-only") {
      criticalOnly = true;
    }
  }
  return { fixturePath, criticalOnly };
}

function main(): void {
  const { fixturePath, criticalOnly } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ Field-F1 fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const fixture = JSON.parse(
    fs.readFileSync(fixturePath, "utf-8")
  ) as LabelledFixture;

  const result = evaluateFieldF1Gate(fixture.observations ?? [], {
    minSamplesRequired: fixture.minSamplesRequired,
    minExactMatchF1: fixture.minExactMatchF1,
    criticalOnly,
  });

  const f1Display =
    result.metrics.f1 !== null
      ? result.metrics.f1.toFixed(4)
      : result.metrics.provisionalF1 !== undefined
        ? `provisional ${result.metrics.provisionalF1.toFixed(4)}`
        : "null";

  console.log("Field exact-match F1 gate");
  console.log("=========================");
  console.log(`Fixture:     ${fixturePath}`);
  console.log(`Status:      ${result.status}`);
  console.log(
    `Samples:     ${result.metrics.sampleCount}/${result.metrics.minSamplesRequired} (ready=${result.metrics.measurementReady})`
  );
  console.log(`F1:          ${f1Display}`);
  console.log(`Floor:       ${result.minExactMatchF1}`);
  if (result.blockers.length > 0) {
    console.log("Blockers:");
    for (const b of result.blockers) console.log(`  - ${b}`);
  }

  if (result.status === "pass") {
    console.log("✅ Field-F1 gate PASS");
    process.exit(0);
  }
  if (result.status === "unavailable") {
    console.log("⚠️ Field-F1 gate UNAVAILABLE (insufficient labelled N)");
    process.exit(2);
  }
  console.log("❌ Field-F1 gate FAIL");
  process.exit(1);
}

main();
