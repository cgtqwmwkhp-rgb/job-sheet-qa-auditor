import EntraSignIn from "@/pages/EntraSignIn";

/**
 * Technician portal login — same Entra app as Job Sheet QA (Phase 0 decision #3).
 * Replaces the email/password mock with portal-verbatim Entra CTA.
 */
export default function PortalLogin() {
  return (
    <EntraSignIn
      subtitle="Technician Portal"
      redirectPath="/portal/dashboard"
    />
  );
}
