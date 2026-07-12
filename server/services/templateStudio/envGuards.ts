/**
 * Environment guards for Template Studio dual-control.
 */

export function isProductionAppEnv(): boolean {
  const env = (process.env.APP_ENV || "").toLowerCase();
  return env === "production" || env === "prod";
}

export function isStagingOrDevAppEnv(): boolean {
  if (isProductionAppEnv()) return false;
  const env = (
    process.env.APP_ENV ||
    process.env.NODE_ENV ||
    "development"
  ).toLowerCase();
  return (
    env === "staging" ||
    env === "development" ||
    env === "test" ||
    env === "dev" ||
    env === ""
  );
}

/**
 * Direct activation is staging/dev only. Production must use approved promote apply.
 */
export function assertStagingActivationAllowed(action: string): void {
  if (isProductionAppEnv()) {
    throw new Error(
      `${action} blocked on production. Use Template Studio dual-control promote ` +
        `(request → second-user approve → apply), not direct activation.`
    );
  }
}
