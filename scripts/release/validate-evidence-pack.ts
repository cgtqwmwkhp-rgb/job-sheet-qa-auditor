/**
 * Validate Release Evidence Pack
 *
 * Validates that a release evidence pack contains real evidence,
 * not simulated or placeholder content.
 *
 * Usage:
 *   npx tsx scripts/release/validate-evidence-pack.ts --input <path>
 */

import * as fs from "fs";

// Forbidden tokens that indicate simulated/placeholder content
const FORBIDDEN_TOKENS = [
  "SIMULATED",
  "PLACEHOLDER",
  "TODO:",
  "FIXME:",
  "XXX:",
  "sha256:placeholder",
  "<YOUR_DOMAIN>",
  "example.com",
];

// Required sections that must be present
const REQUIRED_SECTIONS = [
  "## Identity",
  "## CI Evidence",
  "## Smoke Check Evidence",
  "## Monitoring Snapshot",
  "## Rollback Plan",
];

// Pattern for unfilled REQUIRED markers
const REQUIRED_PATTERN = /REQUIRED:/g;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEvidencePack(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for forbidden tokens
  for (const token of FORBIDDEN_TOKENS) {
    if (content.includes(token)) {
      errors.push(`Forbidden token found: "${token}"`);
    }
  }

  // Check for unfilled REQUIRED markers
  const requiredMatches = content.match(REQUIRED_PATTERN);
  if (requiredMatches && requiredMatches.length > 0) {
    errors.push(
      `Found ${requiredMatches.length} unfilled REQUIRED markers`
    );
  }

  // Check for required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Check for MISSING_EVIDENCE markers (warnings, not errors)
  if (content.includes("MISSING_EVIDENCE")) {
    warnings.push("Evidence pack contains MISSING_EVIDENCE markers - review carefully");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function main() {
  const args = process.argv.slice(2);
  let inputPath = "./RELEASE_EVIDENCE_PACK.md";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputPath = args[i + 1];
      i++;
    }
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputPath, "utf-8");
  const result = validateEvidencePack(content);

  console.log(`\n📋 Validating: ${inputPath}\n`);

  if (result.errors.length > 0) {
    console.log("❌ ERRORS:");
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    for (const warning of result.warnings) {
      console.log(`   - ${warning}`);
    }
  }

  if (result.valid) {
    console.log("\n✅ Evidence pack is valid");
    process.exit(0);
  } else {
    console.log("\n❌ Evidence pack validation FAILED");
    process.exit(1);
  }
}

// ESM-compatible main check
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
