/**
 * Staging verification checklist for Template Studio (R1).
 * Run against staging after deploy — not an automated CI gate.
 *
 * 1. Sign in as qa_lead
 * 2. Open /specs (Template Studio) — viewer must get 403
 * 3. New draft → attach sample PDF → Propose → accept → ROI save → save fields
 * 4. Gates report allowed → Activate on staging
 * 5. Upload same form type on staging → Selection Trace shows this template
 * 6. (R3) Request promote as user A; approve as user B; apply on production when YES
 */

export const TEMPLATE_STUDIO_STAGING_VERIFY = {
  route: "/specs",
  alias: "/template-studio",
  authors: ["admin", "qa_lead"] as const,
  mysqlPersistenceEnv: "TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED=true",
  auditActions: [
    "TEMPLATE_STUDIO_CREATE_DRAFT",
    "TEMPLATE_STUDIO_ATTACH_SAMPLE",
    "TEMPLATE_ACTIVATE_STAGING",
    "TEMPLATE_PROMOTE_REQUEST",
    "TEMPLATE_PROMOTE_APPROVE",
    "TEMPLATE_PROMOTE_APPLY",
    "TEMPLATE_OVERRIDE",
  ],
} as const;
