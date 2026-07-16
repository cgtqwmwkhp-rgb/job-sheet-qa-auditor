import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWebhookDeliveryOutboxForTests,
  enqueueWebhookDelivery,
  drainWebhookDeliveryOutbox,
  listMemoryOutboxForTests,
  redriveWebhookDelivery,
  restoreWebhookDeliveryOutboxBackendForTests,
} from "../../services/webhookDeliveryOutbox";
import { clearWebhookState, webhookEvents } from "../../services/webhooks";

describe("Platform mesh contracts", () => {
  beforeEach(() => {
    clearWebhookState();
    clearWebhookDeliveryOutboxForTests();
    vi.restoreAllMocks();
    delete process.env.FEATURE_ERP_WRITEBACK;
    delete process.env.ERP_WEBHOOK_URL;
    delete process.env.ERP_WEBHOOK_SECRET;
    delete process.env.FEATURE_TEAMS_AUDIT_CARD;
    delete process.env.TEAMS_WEBHOOK_URL;
  });

  afterEach(() => {
    clearWebhookState();
    clearWebhookDeliveryOutboxForTests();
    restoreWebhookDeliveryOutboxBackendForTests();
    vi.restoreAllMocks();
    delete process.env.FEATURE_ERP_WRITEBACK;
    delete process.env.ERP_WEBHOOK_URL;
    delete process.env.ERP_WEBHOOK_SECRET;
    delete process.env.FEATURE_TEAMS_AUDIT_CARD;
    delete process.env.TEAMS_WEBHOOK_URL;
  });

  it("persists a pending row before POST (crash boundary)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const queued = await enqueueWebhookDelivery({
      targetType: "webhook",
      event: "audit.completed",
      url: "https://example.test/audit",
      payload: { auditId: 42 },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(listMemoryOutboxForTests()).toContainEqual(
      expect.objectContaining({ id: queued.id, status: "pending", attempts: 0 })
    );
  });

  it("moves exhausted delivery to DLQ and redrives it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 }))
    );
    const queued = await enqueueWebhookDelivery({
      targetType: "webhook",
      event: "audit.completed",
      url: "https://example.test/audit",
      payload: { auditId: 42 },
      maxAttempts: 2,
    });

    const [pending] = await drainWebhookDeliveryOutbox({ ids: [queued.id] });
    expect(pending).toMatchObject({
      success: false,
      status: "pending",
      attempts: 1,
    });
    const retryAt = listMemoryOutboxForTests()[0]?.nextAttemptAt;
    expect(retryAt?.getTime()).toBeGreaterThan(Date.now());

    const [failed] = await drainWebhookDeliveryOutbox({
      ids: [queued.id],
      now: new Date((retryAt?.getTime() ?? Date.now()) + 1),
    });
    expect(failed).toMatchObject({ success: false, status: "dlq" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 }))
    );
    const redriven = await redriveWebhookDelivery(queued.id);
    expect(redriven).toMatchObject({ success: true, status: "delivered" });
  });

  it("queues ERP write-back through the outbox without a subscriber", async () => {
    process.env.FEATURE_ERP_WRITEBACK = "true";
    process.env.ERP_WEBHOOK_URL = "https://erp.example.test/audits";
    process.env.ERP_WEBHOOK_SECRET = "erp-secret";
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await webhookEvents.auditCompleted(91, "pass", 98, {
      externalJobId: "ERP-123",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      auditId: 91,
      result: "pass",
      score: 98,
      externalJobId: "ERP-123",
    });
    expect(listMemoryOutboxForTests()[0]?.status).toBe("delivered");
  });

  it("migration and ingest persister carry upstream identity", () => {
    const root = resolve(__dirname, "../../..");
    const migration = readFileSync(
      resolve(root, "drizzle/0014_platform_mesh.sql"),
      "utf8"
    );
    const persist = readFileSync(
      resolve(root, "server/services/ingest/persist.ts"),
      "utf8"
    );
    expect(migration).toContain("webhook_delivery_outbox");
    expect(migration).toContain("externalJobId");
    expect(migration).toContain("sourceSystem");
    expect(migration).toContain("deviceId");
    expect(persist).toContain("externalJobId: input.externalJobId");
    expect(persist).toContain('sourceSystem: "signed_ingest"');
    expect(persist).toContain("deviceId: input.deviceId");
  });
});
