/** Optional ERP audit write-back profile (delivered through the HTTP outbox). */
import type { EnqueueDeliveryInput } from "../webhookDeliveryOutbox";

export const FEATURE_ERP_WRITEBACK = "FEATURE_ERP_WRITEBACK";

export interface ErpAuditWriteback {
  auditId: number;
  result: string;
  score: number;
  externalJobId?: string;
  findingsSummary?: unknown;
}

export function buildErpWritebackDelivery(
  data: ErpAuditWriteback,
  env: NodeJS.ProcessEnv = process.env
): EnqueueDeliveryInput | null {
  if (env[FEATURE_ERP_WRITEBACK] !== "true" || !env.ERP_WEBHOOK_URL) {
    return null;
  }

  return {
    targetType: "erp",
    event: "audit.completed",
    payloadId: `audit-${data.auditId}`,
    url: env.ERP_WEBHOOK_URL,
    secret: env.ERP_WEBHOOK_SECRET,
    payload: {
      auditId: data.auditId,
      result: data.result,
      score: data.score,
      ...(data.externalJobId ? { externalJobId: data.externalJobId } : {}),
      ...(data.findingsSummary !== undefined
        ? { findingsSummary: data.findingsSummary }
        : {}),
    },
    headers: { "X-Mesh-Target": "erp" },
    maxAttempts: 5,
  };
}
