/**
 * Org-wide AI Auditor Persona — advisory voice / bias only.
 * Never changes COMMENT-C / FAULT-C / Audit Policy Major-Minor law.
 */

export const AI_PERSONA_FOCUS_AREAS = ["safety", "customer", "parts"] as const;

export type AiPersonaFocusArea = (typeof AI_PERSONA_FOCUS_AREAS)[number];

export type AiPersonaStrictnessBand = "lenient" | "standard" | "strict";

export interface AiPersona {
  /** Optimistic concurrency version (semver-like string, bumped on save). */
  version: string;
  strictness: number;
  toneCheck: boolean;
  completenessCheck: boolean;
  customInstructions: string;
  focusAreas: AiPersonaFocusArea[];
  updatedAt?: string;
  updatedBy?: number;
}

/** Provenance stamp on reportJson — no full custom instructions. */
export interface PersonaDecisionStamp {
  version: string;
  snapshotHash: string;
  strictness: number;
  band: AiPersonaStrictnessBand;
  toneCheck: boolean;
  completenessCheck: boolean;
  focusAreas: AiPersonaFocusArea[];
  instructionsHash: string;
}

export interface AiPersonaPreviewInput {
  commentSnippet: string;
  onFailurePath?: boolean;
  failMarkCount?: number;
  partsSummary?: string | null;
  photoSummary?: string | null;
}

export interface AiPersonaPreviewResult {
  persona: AiPersona;
  band: AiPersonaStrictnessBand;
  snapshotHash: string;
  adequate: boolean | null;
  gaps: string[];
  summary: string;
  advisoryOnly: true;
}
