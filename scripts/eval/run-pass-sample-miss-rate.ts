#!/usr/bin/env npx tsx
/**
 * PASS sample miss-rate gate CLI (Wave-6 P5)
 *
 * Loads labelled PASS sample review rows and evaluates the sampling SLO.
 * Exit codes:
 *   0 — pass
 *   2 — unavailable (insufficient N; honest, not a greenwash fail)
 *   1 — fail (ready and above miss-rate ceiling) or fixture/IO error
 *
 * Usage:
 *   npx tsx scripts/eval/run-pass-sample-miss-rate.ts [--fixture path]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  buildPassSampleMissRateArtifact,
  derivePassSampleOutcomes,
  type PassSampleReviewRow,
} from "../../server/services/samplingPolicy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FIXTURE = path.join(
  __dirname,
  "../../parity/fixtures/pass-sample-labelled.json"
);

interface LabelledFixture {
  version: string;
  maxMissRate?: number;
  minSamplesRequired?: number;
  rows: PassSampleReviewRow[];
}

function parseArgs(argv: string[]): { fixturePath: string } {
  let fixturePath = DEFAULT_FIXTURE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture" && argv[i + 1]) {
      fixturePath = path.resolve(argv[++i]);
    }
  }
  return { fixturePath };
}

function main(): void {
  const { fixturePath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ PASS sample fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  let fixture: LabelledFixture;
  try {
    fixture = JSON.parse(
      fs.readFileSync(fixturePath, "utf-8")
    ) as LabelledFixture;
  } catch (error) {
    console.error(`❌ Failed to parse fixture: ${fixturePath}`, error);
    process.exit(1);
  }

  const outcomes = derivePassSampleOutcomes(fixture.rows ?? []);
  const artifact = buildPassSampleMissRateArtifact(outcomes, {
    maxMissRate: fixture.maxMissRate,
    minSamplesRequired: fixture.minSamplesRequired,
  });

  console.log(
    JSON.stringify(
      {
        fixture: path.basename(fixturePath),
        status: artifact.status,
        metrics: artifact.metrics,
        maxMissRate: artifact.maxMissRate,
        blockers: artifact.blockers,
        asOf: artifact.asOf,
      },
      null,
      2
    )
  );

  if (artifact.status === "unavailable") process.exit(2);
  if (artifact.status === "fail") process.exit(1);
  process.exit(0);
}

main();
