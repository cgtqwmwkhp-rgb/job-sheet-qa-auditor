import { describe, it, expect } from "vitest";
import {
  validateEvidencePack,
  REQUIRED_SECTIONS,
  FORBIDDEN_TOKENS,
} from "../../../scripts/release/validate-evidence-pack";

describe("Release Evidence Pack Validation (Contract)", () => {
  describe("validateEvidencePack", () => {
    it("should fail on content containing SIMULATED", () => {
      const content = `
# Release Verification Evidence Pack

## Identity
Git SHA: SIMULATED_SHA_123

## CI Evidence
All tests passed.

## Smoke Checks
All endpoints healthy.

## Monitoring Snapshot
No errors.

## Rollback Plan
Revert to previous SHA.

## Comms
Team notified.
`;
      const result = validateEvidencePack(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("SIMULATED"))).toBe(true);
    });

    it("should fail on content with unfilled REQUIRED markers", () => {
      const content = `
# Release Verification Evidence Pack

## Identity
| **Git SHA (full)** | REQUIRED: paste from version endpoint |

## CI Evidence
All tests passed.

## Smoke Checks
All endpoints healthy.

## Monitoring Snapshot
No errors.

## Rollback Plan
Revert to previous SHA.

## Comms
Team notified.
`;
      const result = validateEvidencePack(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("REQUIRED:"))).toBe(true);
    });

    it("should fail when required sections are missing", () => {
      const content = `
# Release Verification Evidence Pack

## Identity
Git SHA: abc123def456

## CI Evidence
All tests passed.

## Smoke Checks
All endpoints healthy.

## Monitoring Snapshot
No errors.

## Comms
Team notified.
`;
      // Missing "Rollback Plan" section
      const result = validateEvidencePack(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Rollback Plan"))).toBe(true);
    });

    it("should fail on sha256:placeholder token", () => {
      const content = `
# Release Verification Evidence Pack

## Identity
Git SHA: abc123def456
Checksum: sha256:placeholder

## CI Evidence
All tests passed.

## Smoke Checks
All endpoints healthy.

## Monitoring Snapshot
No errors.

## Rollback Plan
Revert to previous SHA.

## Comms
Team notified.
`;
      const result = validateEvidencePack(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("sha256:placeholder"))).toBe(
        true
      );
    });

    it("should pass on valid evidence pack with real content", () => {
      const content = `
# Release Verification Evidence Pack

**Generated:** 2026-01-05T12:00:00Z
**Status:** COMPLETE

## Identity

| Field | Value |
|-------|-------|
| **Git SHA (full)** | d589d5514b02345253e1c06da38ca4fdbac9a630 |
| **Git SHA (short)** | d589d55 |
| **Platform Version** | v1.2.3 |
| **Build Time** | 2026-01-05T12:00:00Z |
| **Environment** | production |

### Version Endpoint Response

\`\`\`json
{
  "gitSha": "d589d5514b02345253e1c06da38ca4fdbac9a630",
  "gitShaShort": "d589d55",
  "platformVersion": "v1.2.3",
  "buildTime": "2026-01-05T12:00:00Z",
  "environment": "production",
  "schemaVersion": "1.0.0"
}
\`\`\`

## CI Evidence

| Check | Status | Run URL |
|-------|--------|---------|
| Unit Tests | PASS | https://github.com/org/repo/actions/runs/123 |
| Integration Tests | PASS | https://github.com/org/repo/actions/runs/123 |
| E2E Tests | PASS | https://github.com/org/repo/actions/runs/123 |
| TypeScript Check | PASS | https://github.com/org/repo/actions/runs/123 |
| Lint Check | PASS | https://github.com/org/repo/actions/runs/123 |
| Release Rehearsal | PASS | https://github.com/org/repo/actions/runs/123 |

## Smoke Checks

| Endpoint | Status | Response Time | HTTP Code |
|----------|--------|---------------|-----------|
| GET / | OK | 45ms | 200 |
| GET /api/trpc/system.health | OK | 12ms | 200 |
| GET /api/trpc/system.version | OK | 8ms | 200 |

## Monitoring Snapshot

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| 5xx Error Rate | 0.00% | < 0.1% | PASS |
| 4xx Error Rate | 0.5% | < 5% | PASS |
| P95 Latency | 120ms | < 500ms | PASS |
| Error Log Count | 0 | 0 new errors | PASS |

## Rollback Plan

| Field | Value |
|-------|-------|
| **Previous Git SHA** | ccd3e4512345678901234567890123456789abcd |
| **Previous Platform Version** | v1.2.2 |
| **Rollback Method** | Platform redeploy |

### Rollback Steps

1. Navigate to deployment platform
2. Select previous deployment
3. Click "Redeploy"

## Comms

### Internal Notification

- [x] Team notified via: Slack #releases
- [x] Release notes shared: https://github.com/org/repo/releases/v1.2.3

### Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Release Engineer | John Doe | 2026-01-05 | Approved |
| QA Lead | Jane Smith | 2026-01-05 | Approved |
`;
      const result = validateEvidencePack(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should have all required sections defined", () => {
      expect(REQUIRED_SECTIONS).toContain("Identity");
      expect(REQUIRED_SECTIONS).toContain("CI Evidence");
      expect(REQUIRED_SECTIONS).toContain("Smoke Checks");
      expect(REQUIRED_SECTIONS).toContain("Monitoring Snapshot");
      expect(REQUIRED_SECTIONS).toContain("Rollback Plan");
      expect(REQUIRED_SECTIONS).toContain("Comms");
    });

    it("should have SIMULATED in forbidden tokens", () => {
      expect(FORBIDDEN_TOKENS).toContain("SIMULATED");
    });
  });
});
