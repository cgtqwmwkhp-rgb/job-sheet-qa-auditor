/**
 * PlantExpand portal-verbatim Entra sign-in.
 * Authority: https://auth.portal.plantexpand.com
 * — light grey page, centered white card, single Microsoft Entra CTA, no chrome.
 */

const ENTRA_LOGIN_PATH = "/.auth/login/aad";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 21 21"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

interface EntraSignInProps {
  /** Product line under the brand */
  subtitle?: string;
  /** post_login_redirect_uri path (defaults to current path or /) */
  redirectPath?: string;
}

export default function EntraSignIn({
  subtitle = "Job Sheet QA Auditor",
  redirectPath,
}: EntraSignInProps) {
  const handleSignIn = () => {
    const current =
      `${window.location.pathname}${window.location.search}` || "/";
    const redirect = redirectPath ?? current;
    const url = `${ENTRA_LOGIN_PATH}?post_login_redirect_uri=${encodeURIComponent(redirect)}`;
    // Top-level navigation only — never load login.windows.net inside a frame.
    const target = window.top ?? window;
    target.location.assign(url);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-muted"
      style={{
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <div
        className="w-full bg-card border"
        style={{
          maxWidth: 368,
          padding: "40px 32px 32px",
          borderRadius: 4,
        }}
      >
        <div className="text-center mb-8">
          <p
            className="text-xs font-semibold tracking-wide uppercase mb-3 text-muted-foreground"
            style={{ letterSpacing: "0.06em" }}
          >
            PlantExpand
          </p>
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            {subtitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your work account to continue.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 text-sm font-semibold transition-colors"
          style={{
            height: 44,
            backgroundColor: "#2f2f2f",
            color: "#ffffff",
            borderRadius: 2,
            border: "none",
            cursor: "pointer",
          }}
        >
          <MicrosoftIcon />
          Sign in with Microsoft Entra ID
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secured by Microsoft Entra ID
        </p>
      </div>
    </div>
  );
}
