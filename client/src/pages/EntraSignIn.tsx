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
  subtitle?: string;
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
    const target = window.top ?? window;
    target.location.assign(url);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-muted/80"
      style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="bg-card border border-border/60 shadow-sm rounded-lg overflow-hidden">
          <div className="h-1 bg-primary" aria-hidden="true" />
          <div className="px-8 pt-10 pb-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center mb-4">
                <img
                  src="/plantexpand-mark.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                  aria-hidden="true"
                />
              </div>
              <p
                className="text-xs font-semibold tracking-wide uppercase text-muted-foreground"
                style={{ letterSpacing: "0.06em" }}
              >
                PlantExpand
              </p>
              <h1 className="mt-2 text-xl font-semibold leading-tight text-foreground">
                {subtitle}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Sign in with your work account to continue.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-3 text-sm font-semibold rounded-md transition-colors bg-foreground text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              style={{ height: 44 }}
            >
              <MicrosoftIcon />
              Sign in with Microsoft Entra ID
            </button>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Secured by Microsoft Entra ID
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Use your organisation credentials. Contact IT if you need access.
        </p>
      </div>
    </div>
  );
}
