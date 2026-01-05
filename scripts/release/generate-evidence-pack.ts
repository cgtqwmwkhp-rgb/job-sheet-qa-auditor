#!/usr/bin/env npx tsx
/**
 * Release Evidence Pack Generator
 *
 * Generates a RELEASE_VERIFICATION_EVIDENCE_PACK.md template with required sections.
 * All placeholders are explicit and cannot be left as "SIMULATED".
 *
 * Usage:
 *   npx tsx scripts/release/generate-evidence-pack.ts [--output <path>]
 *
 * Options:
 *   --output <path>  Output file path (default: ./RELEASE_VERIFICATION_EVIDENCE_PACK.md)
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const REQUIRED_SECTIONS = [
  "Identity",
  "CI Evidence",
  "Smoke Checks",
  "Monitoring Snapshot",
  "Rollback Plan",
  "Comms",
] as const;

const FORBIDDEN_TOKENS = [
  "SIMULATED",
  "placeholder",
  "sha256:placeholder",
  "TODO:",
  "FIXME:",
  "<PASTE_HERE>",
  "<REQUIRED>",
] as const;

// ============================================================================
// TEMPLATE
// ============================================================================

function generateTemplate(): string {
  const timestamp = new Date().toISOString();

  return `# Release Verification Evidence Pack

**Generated:** ${timestamp}
**Status:** DRAFT (requires real evidence)

> **IMPORTANT:** This evidence pack MUST contain only real outputs. The word "SIMULATED" is forbidden.

---

## Identity

| Field | Value |
|-------|-------|
| **Git SHA (full)** | REQUIRED: paste from \`/api/trpc/system.version\` |
| **Git SHA (short)** | REQUIRED: paste from \`/api/trpc/system.version\` |
| **Platform Version** | REQUIRED: paste from \`/api/trpc/system.version\` or deployment platform |
| **Build Time** | REQUIRED: paste from \`/api/trpc/system.version\` |
| **Environment** | REQUIRED: staging or production |

### Version Endpoint Response

\`\`\`bash
# Command:
curl -s "https://<YOUR_DOMAIN>/api/trpc/system.version?input=%7B%7D" | jq .
\`\`\`

\`\`\`json
REQUIRED: paste actual curl output here
\`\`\`

---

## CI Evidence

| Check | Status | Run URL |
|-------|--------|---------|
| Unit Tests | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |
| Integration Tests | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |
| E2E Tests | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |
| TypeScript Check | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |
| Lint Check | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |
| Release Rehearsal | REQUIRED: PASS/FAIL | REQUIRED: paste GitHub Actions run URL |

### CI Run Details

\`\`\`
REQUIRED: paste CI run summary or link to workflow run
\`\`\`

---

## Smoke Checks

| Endpoint | Status | Response Time | HTTP Code |
|----------|--------|---------------|-----------|
| GET / | REQUIRED | REQUIRED | REQUIRED |
| GET /api/trpc/system.health | REQUIRED | REQUIRED | REQUIRED |
| GET /api/trpc/system.version | REQUIRED | REQUIRED | REQUIRED |

### Smoke Check Commands

\`\`\`bash
# Run smoke checks:
./scripts/release/smoke-check.sh https://<YOUR_DOMAIN>
\`\`\`

### Smoke Check Output

\`\`\`
REQUIRED: paste actual smoke check output here
\`\`\`

---

## Monitoring Snapshot

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| 5xx Error Rate | REQUIRED | < 0.1% | REQUIRED |
| 4xx Error Rate | REQUIRED | < 5% | REQUIRED |
| P95 Latency | REQUIRED | < 500ms | REQUIRED |
| Error Log Count | REQUIRED | 0 new errors | REQUIRED |

### Monitoring Source

\`\`\`
REQUIRED: paste monitoring dashboard URL or log excerpt
\`\`\`

### Monitoring Evidence

\`\`\`
REQUIRED: paste actual metrics snapshot here
\`\`\`

---

## Rollback Plan

| Field | Value |
|-------|-------|
| **Previous Git SHA** | REQUIRED: paste previous deployed SHA |
| **Previous Platform Version** | REQUIRED: paste previous platform version |
| **Rollback Method** | REQUIRED: platform redeploy / git revert / other |

### Rollback Steps

1. REQUIRED: document specific rollback steps for this deployment
2. REQUIRED: include any database migration rollback if applicable
3. REQUIRED: include any cache invalidation steps

### Rollback Command

\`\`\`bash
REQUIRED: paste exact rollback command or platform steps
\`\`\`

---

## Comms

### Internal Notification

- [ ] Team notified via: REQUIRED: Slack / Email / Other
- [ ] Release notes shared: REQUIRED: link or N/A

### External Notification (if applicable)

- [ ] Customer notification: REQUIRED: sent / not required
- [ ] Status page updated: REQUIRED: yes / no / N/A

### Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Release Engineer | REQUIRED | REQUIRED | REQUIRED |
| QA Lead | REQUIRED | REQUIRED | REQUIRED |

---

## Validation

Before finalizing this evidence pack, run:

\`\`\`bash
npx tsx scripts/release/validate-evidence-pack.ts
\`\`\`

This will verify:
- All required sections are present
- No "SIMULATED" or placeholder text remains
- Identity fields are populated
- All REQUIRED markers have been replaced

---

**Evidence Pack Status:** DRAFT

> Change status to COMPLETE only after all REQUIRED fields are filled with real evidence.
`;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  let outputPath = "./RELEASE_VERIFICATION_EVIDENCE_PACK.md";

  // Parse --output argument
  const outputIndex = args.indexOf("--output");
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputPath = args[outputIndex + 1];
  }

  const template = generateTemplate();

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, template, "utf-8");

  console.log(`✅ Evidence pack template generated: ${outputPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("1. Fill in all REQUIRED fields with real evidence");
  console.log("2. Run: npx tsx scripts/release/validate-evidence-pack.ts");
  console.log("3. Commit the completed evidence pack");
}

main();
