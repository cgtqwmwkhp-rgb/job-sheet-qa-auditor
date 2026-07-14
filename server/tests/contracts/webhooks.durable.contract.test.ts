/**
 * Durable Webhooks Contract (PR-IO-WEBHOOKS)
 *
 * Fixtures only — no live network delivery.
 * Verifies subscriptions survive simulated restart via import/export,
 * signed delivery log fields, Stage-3 emit wiring, and fail-safe hydrate.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  registerWebhook,
  listWebhooks,
  clearWebhookState,
  exportWebhookSubscriptions,
  importWebhookSubscriptions,
  exportWebhookDeliveryLog,
  importWebhookDeliveryLog,
  hydrateWebhooksFromDb,
  emitWebhookEvent,
  type WebhookDeliveryResult,
} from "../../services/webhooks";

describe("Durable Webhooks Contract (PR-IO-WEBHOOKS)", () => {
  beforeEach(() => {
    clearWebhookState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWebhookState();
    vi.restoreAllMocks();
  });

  it("subscriptions survive simulated restart via export/import", () => {
    const registered = registerWebhook("https://example.test/hooks", [
      "audit.completed",
    ]);
    expect(listWebhooks()).toHaveLength(1);

    const snapshot = exportWebhookSubscriptions();
    clearWebhookState();
    expect(listWebhooks()).toHaveLength(0);

    const imported = importWebhookSubscriptions(snapshot);
    expect(imported).toBe(1);
    expect(listWebhooks()).toHaveLength(1);
    expect(listWebhooks()[0]?.id).toBe(registered.id);
    expect(listWebhooks()[0]?.events).toContain("audit.completed");
  });

  it("signed delivery log retains signature + payloadHash after restart import", async () => {
    registerWebhook("https://example.test/hooks", ["audit.completed"], {
      secret: "whsec_test_secret_for_signing_123456",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 }))
    );

    const results = await emitWebhookEvent("audit.completed", {
      auditId: 42,
      result: "PASS",
      score: 0.95,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(results[0]?.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(results[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const snapshot = exportWebhookDeliveryLog();
    clearWebhookState();
    expect(exportWebhookDeliveryLog()).toHaveLength(0);

    const imported = importWebhookDeliveryLog(snapshot);
    expect(imported).toBe(1);
    const restored = exportWebhookDeliveryLog()[0] as WebhookDeliveryResult;
    expect(restored.signature).toBe(results[0]?.signature);
    expect(restored.payloadHash).toBe(results[0]?.payloadHash);
    expect(restored.event).toBe("audit.completed");
  });

  it("hydrateWebhooksFromDb is fail-safe when getDb returns null", async () => {
    await expect(hydrateWebhooksFromDb()).resolves.toBe(0);
  });

  it("schema defines durable webhook_subscriptions + webhook_delivery_log", () => {
    const schema = readFileSync(
      resolve(__dirname, "../../../drizzle/schema.ts"),
      "utf8"
    );
    expect(schema).toContain('mysqlTable("webhook_subscriptions"');
    expect(schema).toContain('mysqlTable("webhook_delivery_log"');
    expect(schema).toContain("signature");
    expect(schema).toContain("payloadHash");
  });

  it("documentProcessor Stage-3 path emits audit.completed", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain('from "./webhooks"');
    expect(src).toContain("webhookEvents");
    expect(src).toContain("auditCompleted");
    expect(src).toContain("Stage-3 Store Results");
  });

  it("server boot hydrates webhooks from durable tables", () => {
    const index = readFileSync(
      resolve(__dirname, "../../_core/index.ts"),
      "utf8"
    );
    expect(index).toContain("hydrateWebhooksFromDb");
  });
});
