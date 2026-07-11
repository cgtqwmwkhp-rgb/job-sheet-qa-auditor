export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
export const NOT_QA_LEAD_ERR_MSG = "You do not have QA lead permission (10003)";

/**
 * Rule IDs whose failClass / enabled toggle may only be changed by an admin.
 * Shared between server (enforcement) and client (UI gating).
 */
export const SAFETY_CRITICAL_RULE_IDS: ReadonlySet<string> = new Set([
  "JSR-C010",
  "JSR-C011",
  "JSR-C020",
  "JSR-C030",
  "JSR-C031",
  "JSR-C060",
  "JSR-C090",
  "JSR-C093",
  "DEF-C010",
  "DEF-C030",
]);
