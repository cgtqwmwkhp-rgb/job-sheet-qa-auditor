/**
 * Generate Release Evidence Pack Template
 *
 * Creates a markdown template for release verification evidence.
 * All fields are marked as REQUIRED and must be filled with real data.
 *
 * Usage:
 *   npx tsx scripts/release/generate-evidence-pack.ts --output <path>
 */

import * as fs from "fs";

const TEMPLATE = `# Release Verification Evidence Pack

**Generated:** ${new Date().toISOString()}
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

## Smoke Check Evidence

### Homepage

\`\`\`bash
# Command:
curl -sS -o /dev/null -w "%{http_code}" "https://<YOUR_DOMAIN>/"
\`\`\`

\`\`\`
REQUIRED: paste HTTP response code (e.g., 200)
\`\`\`

### Health Endpoint

\`\`\`bash
# Command:
curl -s "https://<YOUR_DOMAIN>/api/trpc/system.health?input=%7B%7D" | jq .
\`\`\`

\`\`\`json
REQUIRED: paste actual curl output here
\`\`\`

### Version Endpoint

\`\`\`bash
# Command:
curl -s "https://<YOUR_DOMAIN>/api/trpc/system.version?input=%7B%7D" | jq .
\`\`\`

\`\`\`json
REQUIRED: paste actual curl output here
\`\`\`

---

## Monitoring Snapshot

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Error Rate | REQUIRED | < 1% | REQUIRED: PASS/FAIL |
| API Latency (p50) | REQUIRED | < 200ms | REQUIRED: PASS/FAIL |
| API Latency (p99) | REQUIRED | < 1000ms | REQUIRED: PASS/FAIL |
| 5xx Rate | REQUIRED | 0 | REQUIRED: PASS/FAIL |

### Monitoring Source

\`\`\`
REQUIRED: Describe monitoring source (e.g., Sentry, Grafana, CloudWatch)
If no monitoring is available, write: "MISSING_EVIDENCE: No monitoring configured"
\`\`\`

---

## Rollback Plan

| Field | Value |
|-------|-------|
| **Previous Git SHA** | REQUIRED: paste previous deployed SHA |
| **Rollback Command** | REQUIRED: paste rollback command or procedure |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Release Engineer | REQUIRED | REQUIRED | REQUIRED |
| QA Lead | REQUIRED | REQUIRED | REQUIRED |

---

## Checksums

\`\`\`
REQUIRED: paste artifact checksums if applicable
\`\`\`
`;

function main() {
  const args = process.argv.slice(2);
  let outputPath = "./RELEASE_EVIDENCE_PACK.md";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  fs.writeFileSync(outputPath, TEMPLATE, "utf-8");
  console.log(\`✅ Evidence pack template generated: \${outputPath}\`);
  console.log(\`Next steps:\`);
  console.log(\`1. Fill in all REQUIRED fields with real evidence\`);
  console.log(\`2. Run: npx tsx scripts/release/validate-evidence-pack.ts\`);
  console.log(\`3. Commit the completed evidence pack\`);
}

main();
