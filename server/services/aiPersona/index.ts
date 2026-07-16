/**
 * Org AI Persona — merge, sanitize, hash, prompt builders, preview.
 */

import { createHash } from "crypto";
import {
  DEFAULT_AI_PERSONA,
  MAX_CUSTOM_INSTRUCTIONS_CHARS,
  PERSONA_INSTRUCTION_BLOCKLIST,
} from "./defaults";
import type {
  AiPersona,
  AiPersonaFocusArea,
  AiPersonaPreviewInput,
  AiPersonaPreviewResult,
  AiPersonaStrictnessBand,
  PersonaDecisionStamp,
} from "./types";
import { AI_PERSONA_FOCUS_AREAS } from "./types";

export type {
  AiPersona,
  AiPersonaFocusArea,
  AiPersonaPreviewInput,
  AiPersonaPreviewResult,
  AiPersonaStrictnessBand,
  PersonaDecisionStamp,
} from "./types";

export { AI_PERSONA_FOCUS_AREAS } from "./types";

export {
  AI_PERSONA_SETTING_KEY,
  DEFAULT_AI_PERSONA,
  MAX_CUSTOM_INSTRUCTIONS_CHARS,
} from "./defaults";

export function strictnessBand(strictness: number): AiPersonaStrictnessBand {
  if (strictness < 40) return "lenient";
  if (strictness > 70) return "strict";
  return "standard";
}

export function sanitizeCustomInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = raw.replace(/\0/g, "").trim();
  if (text.length > MAX_CUSTOM_INSTRUCTIONS_CHARS) {
    text = text.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS);
  }
  for (const re of PERSONA_INSTRUCTION_BLOCKLIST) {
    text = text.replace(re, "[redacted]");
  }
  return text;
}

function normalizeFocusAreas(raw: unknown): AiPersonaFocusArea[] {
  if (!Array.isArray(raw)) return [...DEFAULT_AI_PERSONA.focusAreas];
  const allowed = new Set<string>(AI_PERSONA_FOCUS_AREAS);
  const out: AiPersonaFocusArea[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (allowed.has(key) && !out.includes(key as AiPersonaFocusArea)) {
      out.push(key as AiPersonaFocusArea);
    }
  }
  return out;
}

function clampStrictness(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AI_PERSONA.strictness;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Merge partial / stored persona with defaults. Always returns a valid object.
 */
export function mergeAiPersona(raw: unknown): AiPersona {
  const base = { ...DEFAULT_AI_PERSONA };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  const version =
    typeof o.version === "string" && o.version.trim()
      ? o.version.trim()
      : base.version;

  return {
    version,
    strictness: clampStrictness(o.strictness),
    toneCheck: typeof o.toneCheck === "boolean" ? o.toneCheck : base.toneCheck,
    completenessCheck:
      typeof o.completenessCheck === "boolean"
        ? o.completenessCheck
        : base.completenessCheck,
    customInstructions: sanitizeCustomInstructions(
      o.customInstructions ?? base.customInstructions
    ),
    focusAreas: normalizeFocusAreas(o.focusAreas),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
    updatedBy: typeof o.updatedBy === "number" ? o.updatedBy : undefined,
  };
}

/** Unwrap processing_settings JSON `{ value: ... }` or raw object. */
export function parseStoredAiPersona(stored: unknown): unknown {
  if (
    stored &&
    typeof stored === "object" &&
    "value" in (stored as object) &&
    (stored as { value: unknown }).value !== undefined
  ) {
    return (stored as { value: unknown }).value;
  }
  return stored;
}

function canonicalForHash(persona: AiPersona): string {
  return JSON.stringify({
    strictness: persona.strictness,
    toneCheck: persona.toneCheck,
    completenessCheck: persona.completenessCheck,
    customInstructions: persona.customInstructions,
    focusAreas: [...persona.focusAreas].sort(),
  });
}

export function computePersonaSnapshotHash(persona: AiPersona): string {
  return createHash("sha256").update(canonicalForHash(persona)).digest("hex");
}

export function computeInstructionsHash(instructions: string): string {
  return createHash("sha256").update(instructions).digest("hex").slice(0, 16);
}

export function buildPersonaDecisionStamp(
  persona: AiPersona
): PersonaDecisionStamp {
  return {
    version: persona.version,
    snapshotHash: computePersonaSnapshotHash(persona),
    strictness: persona.strictness,
    band: strictnessBand(persona.strictness),
    toneCheck: persona.toneCheck,
    completenessCheck: persona.completenessCheck,
    focusAreas: [...persona.focusAreas],
    instructionsHash: computeInstructionsHash(persona.customInstructions),
  };
}

/** Prompt fragment for sufficiency / Deep Note / coaching. */
export function buildPersonaPromptBlock(persona: AiPersona): string {
  const band = strictnessBand(persona.strictness);
  const focus =
    persona.focusAreas.length > 0
      ? persona.focusAreas.join(", ")
      : "general documentation quality";
  const bandGuidance =
    band === "lenient"
      ? "Be lenient: tolerate minor omissions; only flag material documentation gaps."
      : band === "strict"
        ? "Be strict: flag thin cause/next-action language and vague close-outs as advisory gaps."
        : "Use balanced senior-engineer judgment for documentation sufficiency.";

  const lines = [
    `Org auditor persona v${persona.version} (strictness=${persona.strictness}, band=${band}).`,
    bandGuidance,
    `Tone/language check: ${persona.toneCheck ? "on" : "off"}.`,
    `Completeness / loose-ends check: ${persona.completenessCheck ? "on" : "off"}.`,
    `Focus areas: ${focus}.`,
  ];
  if (persona.customInstructions.trim()) {
    lines.push(`Custom instructions: ${persona.customInstructions.trim()}`);
  }
  lines.push(
    "Stay advisory only — do not invent job sheet IDs; do not override hard clinical rules."
  );
  return lines.join("\n");
}

/**
 * Soft advisory gaps from persona (never hard findings).
 * Applied on top of COMMENT-C rubric floor when completeness/tone enabled.
 */
export function personaSoftGaps(input: {
  persona: AiPersona;
  onFailurePath: boolean;
  hasWhat: boolean;
  hasNextAction: boolean;
  hasPartsStance: boolean;
  isVagueOnly: boolean;
  commentSnippet: string;
}): string[] {
  const { persona } = input;
  if (!input.onFailurePath) return [];
  const band = strictnessBand(persona.strictness);
  const gaps: string[] = [];

  if (persona.completenessCheck && band === "strict") {
    if (input.hasWhat && !input.hasNextAction && !input.hasPartsStance) {
      gaps.push(
        "Persona (strict): missing clear next action or parts stance for failure-path close-out."
      );
    }
    if (input.isVagueOnly) {
      gaps.push(
        "Persona (strict): narrative reads vague — expand technical detail."
      );
    }
  }

  if (persona.toneCheck && band !== "lenient") {
    const snip = input.commentSnippet.toLowerCase();
    if (
      /\b(idiot|stupid|crap|wtf|fuck|shit)\b/i.test(snip) ||
      /\bfixed it\b/i.test(snip) && snip.length < 40
    ) {
      gaps.push(
        "Persona (tone): unprofessional or non-technical close-out language."
      );
    }
  }

  if (
    persona.focusAreas.includes("parts") &&
    band === "strict" &&
    input.onFailurePath &&
    !input.hasPartsStance
  ) {
    gaps.push(
      "Persona (parts focus): no parts stance noted on failure-path write-up."
    );
  }

  return gaps;
}

/**
 * Deterministic preview for Settings "Try on sample note" (no network).
 */
export function previewAiPersona(
  persona: AiPersona,
  input: AiPersonaPreviewInput
): AiPersonaPreviewResult {
  const onFailurePath = input.onFailurePath !== false;
  const snippet = (input.commentSnippet || "").trim();
  const gaps: string[] = [];

  if (!onFailurePath) {
    return {
      persona,
      band: strictnessBand(persona.strictness),
      snapshotHash: computePersonaSnapshotHash(persona),
      adequate: null,
      gaps: [],
      summary: "Not on failure path — sufficiency preview skipped.",
      advisoryOnly: true,
    };
  }

  if (!snippet) {
    gaps.push("Missing clinical narrative (what failed).");
  } else {
    const hasWhat =
      /\b(fault|fail|defect|broken|leak|error|issue|not working)\b/i.test(
        snippet
      );
    const hasNext =
      /\b(return|reorder|replace|next|follow.?up|will)\b/i.test(snippet);
    const hasParts = /\b(part|pn|ordered|awaiting)\b/i.test(snippet);
    const vague = /^(fixed it|done|ok|sorted)\.?$/i.test(snippet);
    if (!hasWhat) gaps.push("No clear defect / fault statement.");
    if (!hasNext && !hasParts) gaps.push("No next action or parts stance.");
    if (vague || snippet.length < 24) {
      gaps.push("Narrative too thin / vague for senior-engineer review.");
    }
    gaps.push(
      ...personaSoftGaps({
        persona,
        onFailurePath: true,
        hasWhat,
        hasNextAction: hasNext,
        hasPartsStance: hasParts,
        isVagueOnly: vague,
        commentSnippet: snippet,
      })
    );
  }

  const unique = Array.from(new Set(gaps));
  return {
    persona,
    band: strictnessBand(persona.strictness),
    snapshotHash: computePersonaSnapshotHash(persona),
    adequate: unique.length === 0,
    gaps: unique,
    summary:
      unique.length === 0
        ? "Preview: write-up looks sufficient under this persona (advisory)."
        : `Preview gaps: ${unique.join(" ")}`,
    advisoryOnly: true,
  };
}
