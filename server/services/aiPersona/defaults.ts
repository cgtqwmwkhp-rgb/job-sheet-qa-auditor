import type { AiPersona } from "./types";

export const AI_PERSONA_SETTING_KEY = "aiPersona";

export const DEFAULT_AI_PERSONA: AiPersona = {
  version: "1.0.0",
  strictness: 70,
  toneCheck: true,
  completenessCheck: true,
  customInstructions:
    "Ensure the engineer provides a clear root cause for any return visit. Flag vague phrases like 'fixed it' or 'done' without technical detail. Check for professional language.",
  focusAreas: ["safety", "parts"],
};

/** Phrases that try to override hard rules / advisory-only contract. */
export const PERSONA_INSTRUCTION_BLOCKLIST = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /disable\s+(comment-?c|fault-?c|hard\s*fail)/i,
  /you\s+must\s+fail\s+the\s+(sheet|audit)/i,
  /invent\s+(job|sheet|finding)\s*ids?/i,
  /override\s+audit\s+policy/i,
];

export const MAX_CUSTOM_INSTRUCTIONS_CHARS = 1500;
