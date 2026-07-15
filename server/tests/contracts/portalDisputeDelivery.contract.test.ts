/**
 * Wave-4 D2 — portal honesty + dispute durability + audit.completed receipts.
 *
 * Challenge bars:
 * - portal metrics = live API flags (source/scoreMeasured) or labelled unavailable in UI
 * - dispute create persists a row and emits dispute.created
 * - ops delivery receipts never invent success when empty/unavailable
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  clearWebhookState,
  registerWebhook,
  emitWebhookEvent,
  getDeliveryReceiptsSnapshot,
  getAuditCompletedReceipts,
} from "../../services/webhooks";

describe("Wave-4 D2 portal + delivery receipt honesty", () => {
  beforeEach(() => {
    clearWebhookState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWebhookState();
    vi.restoreAllMocks();
  });

  it("portal.myDashboard returns live source + scoreMeasured (no hardcoded demo)", () => {
    const src = readFileSync(
      resolve(__dirname, "../../routers/portalRouter.ts"),
      "utf8"
    );
    expect(src).toContain('source: "live"');
    expect(src).toContain("scoreMeasured");
    expect(src).not.toMatch(/94\.2/);
    expect(src).not.toMatch(/Blurry Serial Number/i);
  });

  it("technician dashboard labels unavailable instead of fake zeros on error", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "../../../client/src/pages/portal/TechnicianDashboard.tsx"
      ),
      "utf8"
    );
    expect(src).toContain("Scorecard unavailable");
    expect(src).toContain("dashboardUnavailable");
    expect(src).toContain("trpc.disputes.create");
    expect(src).not.toMatch(/94\.2/);
  });

  it("disputes.create persists a row and emits dispute.created webhook", () => {
    const src = readFileSync(resolve(__dirname, "../../routers.ts"), "utf8");
    expect(src).toContain("db.createDispute");
    expect(src).toContain("CREATE_DISPUTE");
    expect(src).toContain("webhookEvents");
    expect(src).toContain("disputeCreated");
  });

  it("audit.completed delivery receipts stay empty (not fake success) without subscribers", async () => {
    const snapshot = await getDeliveryReceiptsSnapshot({
      event: "audit.completed",
    });
    expect(snapshot.available).toBe(true);
    expect(snapshot.auditCompletedSubscriberCount).toBe(0);
    expect(snapshot.receiptCount).toBe(0);
    expect(snapshot.receipts).toEqual([]);
  });

  it("records auditId on audit.completed delivery receipts for ops lookup", async () => {
    registerWebhook("https://example.test/hooks", ["audit.completed"], {
      secret: "whsec_d2_receipt_test_secret_abcdef",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 }))
    );

    const results = await emitWebhookEvent("audit.completed", {
      auditId: 42,
      result: "PASS",
      score: 0.91,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.auditId).toBe(42);
    expect(results[0]?.success).toBe(true);

    const forAudit = await getAuditCompletedReceipts(42);
    expect(forAudit.available).toBe(true);
    expect(forAudit.receiptCount).toBe(1);
    expect(forAudit.receipts[0]?.auditId).toBe(42);

    const missing = await getAuditCompletedReceipts(999);
    expect(missing.available).toBe(true);
    expect(missing.receiptCount).toBe(0);
  });

  it("ops webhooks router exposes honest receipt endpoints", () => {
    const src = readFileSync(
      resolve(__dirname, "../../routers/webhooksRouter.ts"),
      "utf8"
    );
    expect(src).toContain("deliveryReceipts");
    expect(src).toContain("auditCompletedReceipt");
    expect(src).toContain('"unavailable" as const');
    expect(src).toContain('"none" as const');
    expect(src).toContain("hasSecret");
    expect(src).not.toMatch(/secret:\s*webhook\.secret/);
  });

  it("Monitoring surfaces audit.completed delivery receipts without fake success", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../client/src/pages/Monitoring.tsx"),
      "utf8"
    );
    expect(src).toContain("ops-webhook-delivery-receipts");
    expect(src).toContain("webhooks.deliveryReceipts");
    expect(src).toMatch(/No audit\.completed deliveries recorded yet/);
    expect(src).toMatch(/Delivery receipts unavailable/);
  });
});
