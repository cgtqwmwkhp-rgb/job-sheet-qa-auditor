/** Optional Teams audit card profile (delivered through the HTTP outbox). */
import type { EnqueueDeliveryInput } from "../webhookDeliveryOutbox";

export const FEATURE_TEAMS_AUDIT_CARD = "FEATURE_TEAMS_AUDIT_CARD";

export interface TeamsAuditNotice {
  auditId: number;
  result: string;
  score?: number;
  externalJobId?: string;
  error?: string;
}

export function buildTeamsAuditDelivery(
  data: TeamsAuditNotice,
  env: NodeJS.ProcessEnv = process.env
): EnqueueDeliveryInput | null {
  const normalized = data.result.toLowerCase();
  const shouldNotify =
    normalized === "fail" ||
    normalized === "failed" ||
    normalized === "review_queue";
  if (
    !shouldNotify ||
    env[FEATURE_TEAMS_AUDIT_CARD] !== "true" ||
    !env.TEAMS_WEBHOOK_URL
  ) {
    return null;
  }

  const facts = [
    { name: "Audit", value: String(data.auditId) },
    { name: "Result", value: data.result },
    ...(data.score == null
      ? []
      : [{ name: "Score", value: String(data.score) }]),
    ...(data.externalJobId
      ? [{ name: "External job", value: data.externalJobId }]
      : []),
  ];

  return {
    targetType: "teams",
    event: normalized === "failed" ? "audit.failed" : "audit.completed",
    payloadId: `audit-${data.auditId}`,
    url: env.TEAMS_WEBHOOK_URL,
    payload: {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: `Audit ${data.auditId}: ${data.result}`,
      themeColor: normalized === "review_queue" ? "FFA500" : "D13438",
      title: "Job sheet audit needs attention",
      sections: [
        {
          facts,
          ...(data.error ? { text: data.error } : {}),
        },
      ],
    },
    headers: { "X-Mesh-Target": "teams" },
    maxAttempts: 4,
  };
}
