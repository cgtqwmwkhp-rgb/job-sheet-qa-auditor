/**
 * Exception Management Contract Tests (PR-17)
 *
 * Fixtures/mocks only — no live DB, OCR, or LLM.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildExceptionManagementSummary,
  buildHoldQueueSlaSummary,
  buildOverturnAnalytics,
  buildRecurrenceSummary,
  classifyAgeingBucket,
  hoursBetween,
  runDlqRetryPass,
  DEFAULT_SLA_HOURS,
  type HoldQueueItemRow,
  type OverturnFindingRow,
} from "../../services/exceptionAnalytics";
import {
  addToDeadLetterQueue,
  clearDeadLetterQueue,
  getFailedJob,
  importDLQ,
  type FailedJob,
} from "../../utils/deadLetterQueue";
import { RATE_LIMITS } from "../../utils/rateLimiter";

const AS_OF = "2024-06-20T12:00:00Z";

const holdItems: HoldQueueItemRow[] = [
  {
    jobSheetId: 1,
    referenceNumber: "JS-1",
    siteInfo: "London HQ",
    queuedAt: "2024-06-20T10:00:00Z", // 2h — under_4h, S0 SLA 4h → ok
    highestSeverity: "S0",
    openFindingCount: 2,
    technicianId: 10,
  },
  {
    jobSheetId: 2,
    referenceNumber: "JS-2",
    siteInfo: "Manchester",
    queuedAt: "2024-06-19T12:00:00Z", // 24h — 4h_to_24h boundary → 1d_to_3d? 24h is min of 1d_to_3d
    highestSeverity: "S1",
    openFindingCount: 1,
    technicianId: 11,
  },
  {
    jobSheetId: 3,
    referenceNumber: "JS-3",
    siteInfo: "Leeds",
    queuedAt: "2024-06-10T12:00:00Z", // 10d — over_7d, breached for any SLA
    highestSeverity: "S2",
    openFindingCount: 3,
    technicianId: 12,
  },
  {
    jobSheetId: 4,
    referenceNumber: null,
    siteInfo: null,
    queuedAt: "2024-06-20T08:00:00Z", // 4h exactly → 4h_to_24h
    highestSeverity: "unknown",
    openFindingCount: 0,
    technicianId: null,
  },
];

const findings: OverturnFindingRow[] = [
  {
    findingId: 100,
    jobSheetId: 1,
    ruleId: "RULE_SIG",
    reasonCode: "MISSING_FIELD",
    severity: "S1",
    fieldName: "signature",
    resolutionStatus: "overridden",
    siteInfo: "London HQ",
    occurredAt: "2024-06-05T10:00:00Z",
    resolvedAt: "2024-06-05T12:00:00Z",
  },
  {
    findingId: 101,
    jobSheetId: 2,
    ruleId: "RULE_SIG",
    reasonCode: "MISSING_FIELD",
    severity: "S1",
    fieldName: "signature",
    resolutionStatus: "overridden",
    siteInfo: "London HQ",
    occurredAt: "2024-06-08T10:00:00Z",
    resolvedAt: "2024-06-08T11:00:00Z",
  },
  {
    findingId: 102,
    jobSheetId: 3,
    ruleId: "RULE_SIG",
    reasonCode: "MISSING_FIELD",
    severity: "S1",
    fieldName: "signature",
    resolutionStatus: "approved",
    siteInfo: "London HQ",
    occurredAt: "2024-06-10T10:00:00Z",
    resolvedAt: "2024-06-10T11:00:00Z",
  },
  {
    findingId: 103,
    jobSheetId: 4,
    ruleId: "RULE_DATE",
    reasonCode: "INVALID_FORMAT",
    severity: "S2",
    fieldName: "date",
    resolutionStatus: "waived",
    siteInfo: "Manchester",
    occurredAt: "2024-06-12T10:00:00Z",
    resolvedAt: "2024-06-12T11:00:00Z",
  },
  {
    findingId: 104,
    jobSheetId: 5,
    ruleId: null,
    reasonCode: "OUT_OF_POLICY",
    severity: "S0",
    fieldName: "safeToUse",
    resolutionStatus: "open",
    siteInfo: "Leeds",
    occurredAt: "2024-06-15T10:00:00Z",
    resolvedAt: null,
  },
  {
    findingId: 105,
    jobSheetId: 6,
    ruleId: "RULE_SIG",
    reasonCode: "MISSING_FIELD",
    severity: "S1",
    fieldName: "signature",
    resolutionStatus: "overridden",
    siteInfo: "London HQ",
    occurredAt: "2024-06-18T10:00:00Z",
    resolvedAt: "2024-06-18T12:00:00Z",
  },
];

describe("Exception Management - PR-17 Contract Tests", () => {
  describe("ageing + SLA timers", () => {
    it("classifies ageing buckets by age hours", () => {
      expect(classifyAgeingBucket(2)).toBe("under_4h");
      expect(classifyAgeingBucket(4)).toBe("4h_to_24h");
      expect(classifyAgeingBucket(23.9)).toBe("4h_to_24h");
      expect(classifyAgeingBucket(24)).toBe("1d_to_3d");
      expect(classifyAgeingBucket(100)).toBe("3d_to_7d");
      expect(classifyAgeingBucket(200)).toBe("over_7d");
    });

    it("computes hoursBetween", () => {
      expect(hoursBetween("2024-06-20T10:00:00Z", "2024-06-20T12:00:00Z")).toBe(
        2
      );
    });

    it("builds hold-queue SLA summary with breaches and ageing", () => {
      const summary = buildHoldQueueSlaSummary({
        items: holdItems,
        asOf: AS_OF,
      });

      expect(summary.totalOnHold).toBe(4);
      expect(summary.slaHoursBySeverity.S0).toBe(DEFAULT_SLA_HOURS.S0);

      const js1 = summary.items.find(i => i.jobSheetId === 1)!;
      expect(js1.ageingBucket).toBe("under_4h");
      expect(js1.breached).toBe(false);
      expect(js1.slaHours).toBe(4);

      const js2 = summary.items.find(i => i.jobSheetId === 2)!;
      expect(js2.ageHours).toBe(24);
      expect(js2.ageingBucket).toBe("1d_to_3d");
      // S1 SLA = 8h, age 24h → breached
      expect(js2.breached).toBe(true);

      const js3 = summary.items.find(i => i.jobSheetId === 3)!;
      expect(js3.ageingBucket).toBe("over_7d");
      expect(js3.breached).toBe(true);

      expect(summary.breachedCount).toBeGreaterThanOrEqual(2);
      expect(summary.breachRate).toBe(summary.breachedCount / 4);

      const over7 = summary.ageing.find(b => b.id === "over_7d")!;
      expect(over7.count).toBe(1);
      expect(over7.breachedCount).toBe(1);

      // Breached items sorted first
      expect(summary.items[0].breached).toBe(true);
    });
  });

  describe("per-rule overturn rates", () => {
    it("aggregates overturn rate per rule", () => {
      const summary = buildOverturnAnalytics({
        findings,
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-30T23:59:59Z",
      });

      expect(summary.totalFindings).toBe(6);
      expect(summary.overturnedCount).toBe(3);
      expect(summary.waivedCount).toBe(1);

      const sig = summary.byRule.find(r => r.ruleId === "RULE_SIG")!;
      expect(sig).toBeDefined();
      expect(sig.totalFindings).toBe(4);
      expect(sig.overturnedCount).toBe(3);
      expect(sig.approvedCount).toBe(1);
      // PX-065/089: overturn = human reversal (override+waive) / resolved
      // RULE_SIG: 3 overturned + 0 waived / (3+1) = 0.75
      expect(sig.overturnRate).toBe(0.75);
      expect(sig.reversalRate).toBe(0.75);

      // RULE_DATE is 100% waived (= overturn under SSOT); RULE_SIG is 0.75.
      expect(summary.worstRules[0].ruleId).toBe("RULE_DATE");
      expect(summary.worstRules.some(r => r.ruleId === "RULE_SIG")).toBe(true);
      // overall: (3 overridden + 1 waived) / 5 resolved = 0.8
      expect(summary.overallOverturnRate).toBeCloseTo(4 / 5, 5);
    });

    it("handles findings without ruleId via reason key", () => {
      const summary = buildOverturnAnalytics({
        findings,
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-30T23:59:59Z",
      });
      const openRule = summary.byRule.find(r =>
        r.ruleKey.startsWith("reason:OUT_OF_POLICY")
      );
      expect(openRule?.openCount).toBe(1);
      expect(openRule?.overturnRate).toBeNull();
    });
  });

  describe("recurrence", () => {
    it("clusters repeated rule+site occurrences", () => {
      const summary = buildRecurrenceSummary({
        findings,
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-30T23:59:59Z",
        threshold: 3,
      });

      expect(summary.clusterCount).toBeGreaterThanOrEqual(1);
      const londonSig = summary.clusters.find(
        c => c.site === "London HQ" && c.reasonCode === "MISSING_FIELD"
      );
      expect(londonSig?.occurrenceCount).toBe(4);
      expect(londonSig?.distinctJobSheets).toBe(4);
    });
  });

  describe("combined summary", () => {
    it("builds exception management summary", () => {
      const summary = buildExceptionManagementSummary({
        holdItems,
        findings,
        asOf: AS_OF,
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-30T23:59:59Z",
      });

      expect(summary.holdQueue.totalOnHold).toBe(4);
      expect(summary.overturns.overturnedCount).toBe(3);
      expect(summary.recurrence.clusterCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("DLQ retry worker", () => {
    beforeEach(() => {
      clearDeadLetterQueue();
    });

    it("schedules retries and exhausts at maxAttempts", async () => {
      const job = addToDeadLetterQueue(
        99,
        "ocr",
        new Error("timeout ETIMEDOUT"),
        { maxAttempts: 3, recoverable: true, attempts: 1 }
      );

      const pass1 = await runDlqRetryPass({
        handler: () => "retry",
        limit: 10,
      });
      expect(pass1.scheduled).toBe(1);
      expect(getFailedJob(job.id)?.attempts).toBe(2);
      expect(getFailedJob(job.id)?.recoverable).toBe(true);

      const pass2 = await runDlqRetryPass({
        handler: () => "retry",
        limit: 10,
      });
      // attempts 3 >= maxAttempts 3 → exhausted
      expect(pass2.exhausted).toBe(1);
      expect(getFailedJob(job.id)?.recoverable).toBe(false);
    });

    it("marks recovered when handler succeeds", async () => {
      addToDeadLetterQueue(100, "analysis", new Error("503"), {
        recoverable: true,
      });
      const result = await runDlqRetryPass({
        handler: () => "recovered",
      });
      expect(result.recovered).toBe(1);
      expect(result.scanned).toBe(1);
    });

    it("importDLQ hydrates in-memory queue without duplicates", () => {
      clearDeadLetterQueue();
      const seed: FailedJob[] = [
        {
          id: "hydrate-1",
          jobSheetId: 7,
          stage: "ocr",
          error: { message: "timeout" },
          attempts: 1,
          maxAttempts: 3,
          lastAttemptAt: new Date("2024-01-01T00:00:00Z"),
          createdAt: new Date("2024-01-01T00:00:00Z"),
          metadata: {},
          recoverable: true,
        },
      ];
      expect(importDLQ(seed)).toBe(1);
      expect(importDLQ(seed)).toBe(0);
      expect(getFailedJob("hydrate-1")?.jobSheetId).toBe(7);
    });
  });

  describe("rate limit config", () => {
    it("exposes RATE_LIMITS.review for exception actions", () => {
      expect(RATE_LIMITS.review.maxRequests).toBe(40);
      expect(RATE_LIMITS.review.windowMs).toBe(60_000);
    });
  });
});
