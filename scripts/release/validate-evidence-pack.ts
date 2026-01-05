#!/usr/bin/env npx tsx
/**
 * Release Evidence Pack Validator
 *
 * Validates that a release evidence pack:
 * - Contains all required sections
 * - Does not contain "SIMULATED" or placeholder text
 * - Has identity fields populated
 * - Has no REQUIRED markers remaining
 *
 * Usage:
 *   npx tsx scripts/release/validate-evidence-pack.ts [--input <path>]
 *
 * Options:
 *   --input <path>  Input file path (default: ./RELEASE_VERIFICATION_EVIDENCE_PACK.md)
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 */

import * as fs from "fs";
import { fileURLToPath } from "url";

// ============================================================================
// CONFIGURATION
// ============================================================================

export const REQUIRED_SECTIONS = [
  "Identity",
  "CI Evidence",
  "Smoke Checks",
  "Monitoring Snapshot",
  "Rollback Plan",
  "Comms",
] as const;

export const FORBIDDEN_TOKENS = [
  "SIMULATED",
  "sha256:placeholder",
  "<PASTE_HERE>",
  "<REQUIRED>",
] as const;

export const REQUIRED_MARKERS = [
  "REQUIRED:",
  "REQUIRED: paste",
  "REQUIRED: PASS/FAIL",
] as const;

export const IDENTITY_FIELDS = [
  "Git SHA (full)",
  "Git SHA (short)",
  "Platform Version",
  "Build Time",
  "Environment",
] as const;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEvidencePack(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required sections
  for (const section of REQUIRED_SECTIONS) {
    const sectionPattern = new RegExp(`^## ${section}`, "m");
    if (!sectionPattern.test(content)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  // Check for forbidden tokens
  for (const token of FORBIDDEN_TOKENS) {
    if (content.includes(token)) {
      const lines = content.split("\n");
      const lineNumbers = lines
        .map((line, i) => (line.includes(token) ? i + 1 : -1))
        .filter((n) => n !== -1);
      errors.push(
        `Forbidden token "${token}" found on line(s): ${lineNumbers.join(", ")}`
      );
    }
  }

  // Check for REQUIRED markers (case-insensitive)
  for (const marker of REQUIRED_MARKERS) {
    const pattern = new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      errors.push(
        `Found ${matches.length} unfilled "${marker}" marker(s) - all must be replaced with real evidence`
      );
    }
  }

  // Check identity fields are not placeholder values
  for (const field of IDENTITY_FIELDS) {
    const fieldPattern = new RegExp(
      `\\*\\*${field}\\*\\*\\s*\\|\\s*([^|\\n]+)`,
      "i"
    );
    const match = content.match(fieldPattern);
    if (match) {
      const value = match[1].trim();
      if (
        value === "REQUIRED" ||
        value.startsWith("REQUIRED:") ||
        value === "unknown" ||
        value === ""
      ) {
        errors.push(`Identity field "${field}" is not populated with real value`);
      }
    }
  }

  // Check for DRAFT status (warning, not error)
  if (content.includes("Status:** DRAFT")) {
    warnings.push(
      'Evidence pack status is still "DRAFT" - change to "COMPLETE" when ready'
    );
  }

  // Check for empty code blocks
  const emptyCodeBlockPattern = /```[\w]*\n\s*\n```/g;
  const emptyBlocks = content.match(emptyCodeBlockPattern);
  if (emptyBlocks && emptyBlocks.length > 0) {
    warnings.push(`Found ${emptyBlocks.length} empty code block(s)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  let inputPath = "./RELEASE_VERIFICATION_EVIDENCE_PACK.md";

  // Parse --input argument
  const inputIndex = args.indexOf("--input");
  if (inputIndex !== -1 && args[inputIndex + 1]) {
    inputPath = args[inputIndex + 1];
  }

  // Check if file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Evidence pack not found: ${inputPath}`);
    console.error("");
    console.error("Generate one first with:");
    console.error("  npx tsx scripts/release/generate-evidence-pack.ts");
    process.exit(1);
  }

  const content = fs.readFileSync(inputPath, "utf-8");
  const result = validateEvidencePack(content);

  console.log("=".repeat(60));
  console.log("Release Evidence Pack Validation");
  console.log("=".repeat(60));
  console.log(`File: ${inputPath}`);
  console.log("");

  if (result.errors.length > 0) {
    console.log("❌ ERRORS:");
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("⚠️  WARNINGS:");
    for (const warning of result.warnings) {
      console.log(`   - ${warning}`);
    }
    console.log("");
  }

  if (result.valid) {
    console.log("✅ VALIDATION PASSED");
    console.log("");
    console.log("The evidence pack contains all required sections");
    console.log("and no forbidden tokens or unfilled markers.");
    process.exit(0);
  } else {
    console.log("❌ VALIDATION FAILED");
    console.log("");
    console.log("Please fix the errors above before finalizing the release.");
    process.exit(1);
  }
}

// Only run main if this is the entry point
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
