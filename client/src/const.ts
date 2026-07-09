export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Azure Easy Auth / Entra login URL (PlantExpand portal pattern).
 * Falls back to in-app /login when Easy Auth path is unavailable locally.
 */
export const getLoginUrl = () => {
  if (typeof window === "undefined") return "/login";
  const redirect = `${window.location.pathname}${window.location.search}` || "/";
  return `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(redirect)}`;
};
