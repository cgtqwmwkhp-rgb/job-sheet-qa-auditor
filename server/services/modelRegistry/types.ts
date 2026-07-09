/**
 * Model Registry types (PR-9)
 *
 * Single snapshot of pinned models per pipeline role, plus currency metadata.
 * No secrets — provider + model identifiers only.
 */

/** Pipeline roles that pin a model/provider. */
export type ModelRole =
  | "ocr"
  | "judgment"
  | "interpreter"
  | "fallback_ocr"
  | "vlm_verification";

/** One role's pinned provider + model. */
export interface ModelRoleEntry {
  role: ModelRole;
  provider: string;
  model: string;
}

/**
 * How the registry was resolved.
 * Overnight / CI: always `env` (no live provider catalog calls).
 */
export type ModelCurrencySource = "env";

export interface ModelCurrencyMeta {
  /** ISO timestamp when this snapshot was built. */
  lastChecked: string;
  /** Where pinned values came from. */
  source: ModelCurrencySource;
}

export interface ModelRegistry {
  roles: {
    ocr: ModelRoleEntry;
    judgment: ModelRoleEntry;
    interpreter: ModelRoleEntry;
    /** Present when OCR failover / fallback is configured. */
    fallback_ocr?: ModelRoleEntry;
    /** Present when VLM verification config is available. */
    vlm_verification?: ModelRoleEntry;
  };
  currency: ModelCurrencyMeta;
}
