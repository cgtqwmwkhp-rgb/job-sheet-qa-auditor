/**
 * Ops webhook surface — delivery receipts for audit.completed (Wave-4 D2).
 * Honest: empty log is empty; unavailable only when the log cannot be loaded.
 * Secrets are never returned.
 */

import { z } from "zod";
import { staffProcedure, router } from "../_core/trpc";
import {
  getAuditCompletedReceipts,
  getDeliveryReceiptsSnapshot,
  listWebhooks,
  type WebhookEvent,
} from "../services/webhooks";

const webhookEventSchema = z.enum([
  "audit.completed",
  "audit.failed",
  "dispute.created",
  "dispute.resolved",
  "waiver.approved",
  "waiver.rejected",
  "spec.activated",
  "spec.deactivated",
  "template.stored",
  "selection_trace.stored",
]);

function redactSubscription(webhook: ReturnType<typeof listWebhooks>[number]) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    retryCount: webhook.retryCount,
    timeoutMs: webhook.timeoutMs,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    hasSecret: Boolean(webhook.secret),
  };
}

function serializeReceipt(
  receipt: Awaited<
    ReturnType<typeof getDeliveryReceiptsSnapshot>
  >["receipts"][number]
) {
  return {
    id: receipt.id,
    success: receipt.success,
    webhookId: receipt.webhookId,
    event: receipt.event,
    payloadId: receipt.payloadId ?? null,
    auditId: receipt.auditId ?? null,
    statusCode: receipt.statusCode ?? null,
    responseTimeMs: receipt.responseTime ?? null,
    error: receipt.error ?? null,
    retryCount: receipt.retryCount,
    payloadHash: receipt.payloadHash,
    /** Signature present but truncated — enough to confirm signed delivery. */
    signatureFingerprint: receipt.signature
      ? `${receipt.signature.slice(0, 12)}…`
      : null,
    deliveredAt: receipt.deliveredAt.toISOString(),
  };
}

export const webhooksRouter = router({
  /**
   * Active subscriptions (no secrets) — ops can see who listens for audit.completed.
   */
  subscriptions: staffProcedure.query(() => {
    const subscriptions = listWebhooks().map(redactSubscription);
    return {
      available: true,
      count: subscriptions.length,
      auditCompletedSubscriberCount: subscriptions.filter(
        s => s.active && s.events.includes("audit.completed")
      ).length,
      subscriptions,
    };
  }),

  /**
   * Recent delivery receipts. Empty ≠ fake success; unavailable only on load failure.
   */
  deliveryReceipts: staffProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional().default(50),
          event: webhookEventSchema.optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const snapshot = await getDeliveryReceiptsSnapshot({
        limit: input?.limit ?? 50,
        event: input?.event as WebhookEvent | undefined,
      });
      return {
        ...snapshot,
        receipts: snapshot.receipts.map(serializeReceipt),
      };
    }),

  /**
   * Per-audit audit.completed delivery receipts for ops / audit detail.
   */
  auditCompletedReceipt: staffProcedure
    .input(
      z.object({
        auditId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).optional().default(20),
      })
    )
    .query(async ({ input }) => {
      const snapshot = await getAuditCompletedReceipts(
        input.auditId,
        input.limit ?? 20
      );
      return {
        ...snapshot,
        auditId: input.auditId,
        status: !snapshot.available
          ? ("unavailable" as const)
          : snapshot.receiptCount === 0
            ? ("none" as const)
            : snapshot.receipts.every(r => r.success)
              ? ("delivered" as const)
              : ("partial_or_failed" as const),
        receipts: snapshot.receipts.map(serializeReceipt),
      };
    }),
});

export type WebhooksRouter = typeof webhooksRouter;
