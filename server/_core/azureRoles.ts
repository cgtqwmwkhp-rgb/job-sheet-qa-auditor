/**
 * Map Azure Easy Auth / Entra app role claims onto DB user roles.
 *
 * Hold-queue and review mutations require admin | qa_lead. Easy Auth users
 * previously defaulted to DB role "user", which surfaces as error 10003.
 */

export type DbUserRole = "user" | "admin" | "qa_lead" | "technician";

const ADMIN_ALIASES = new Set(["admin", "administrator"]);
const QA_LEAD_ALIASES = new Set([
  "qalead",
  "qaleads",
  "qa_lead",
  "lead",
  "reviewer",
]);
const TECHNICIAN_ALIASES = new Set(["technician", "tech", "engineer"]);
const VIEWER_ALIASES = new Set(["viewer", "readonly", "read_only", "user"]);

function normalizeClaim(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}

/** Extract role claim values from a decoded Easy Auth principal. */
export function extractAzureRoleClaims(principal: {
  claims?: Array<{ typ?: string; val?: string }>;
  userRoles?: string[];
}): string[] {
  const fromClaims =
    principal.claims
      ?.filter(c => {
        const typ = String(c.typ ?? "");
        return (
          typ === "roles" ||
          typ.endsWith("/roles") ||
          typ === "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
        );
      })
      .map(c => String(c.val ?? ""))
      .filter(Boolean) ?? [];

  const fromUserRoles = Array.isArray(principal.userRoles)
    ? principal.userRoles.map(String).filter(Boolean)
    : [];

  return [...fromClaims, ...fromUserRoles];
}

/**
 * Resolve an explicit DB role from Entra app-role claims.
 * Returns undefined when no recognised role claim is present.
 */
export function mapAzureRolesToDbRole(
  roleClaims: string[]
): DbUserRole | undefined {
  if (!roleClaims.length) return undefined;

  const normalized = roleClaims.map(normalizeClaim);
  if (normalized.some(r => ADMIN_ALIASES.has(r))) return "admin";
  if (normalized.some(r => QA_LEAD_ALIASES.has(r))) return "qa_lead";
  if (normalized.some(r => TECHNICIAN_ALIASES.has(r))) return "technician";
  if (normalized.some(r => VIEWER_ALIASES.has(r))) return "user";
  return undefined;
}

/**
 * Role to persist for an Azure Easy Auth session.
 *
 * - Explicit Entra app roles win (including viewer → user).
 * - No claims → least-privilege `user` for brand-new accounts only.
 * - Existing DB roles are preserved when claims are absent (no auto-promotion).
 *
 * Staff requiring qa_lead must receive an Entra app-role claim, or be promoted
 * explicitly via ops (`scripts/ops/promote-staff-to-qalead.mjs`).
 */
export function resolveAzureAuthRole(input: {
  roleClaims: string[];
  existingRole?: DbUserRole | null;
  isNewUser: boolean;
}): DbUserRole | undefined {
  const mapped = mapAzureRolesToDbRole(input.roleClaims);
  if (mapped) return mapped;
  if (input.isNewUser) return "user";
  return undefined;
}
