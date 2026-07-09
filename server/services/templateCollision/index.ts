/**
 * Template collision governance module (Phase 3.4)
 *
 * Feature flag (default OFF):
 * - FEATURE_TEMPLATE_COLLISION=true → enable collision checks in downstream wiring
 *
 * Not yet wired into templateRegistry — intentional ownership boundary.
 */

export const FEATURE_FLAG = "FEATURE_TEMPLATE_COLLISION";

export function isTemplateCollisionEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { checkCollision } from "./collisionCheck";
