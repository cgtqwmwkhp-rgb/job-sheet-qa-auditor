/**
 * Template collision governance types (Phase 3.4)
 *
 * Pure fingerprint-based collision checks — DB-ready, no registry coupling.
 */

export interface TemplateFingerprint {
  templateId: string;
  fingerprint: string;
  version?: string;
}

export interface CollisionResult {
  collides: boolean;
  existingTemplateId?: string;
  reason?: string;
}
