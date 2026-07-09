/**
 * Template Collision Detector
 *
 * PR-16: Detect fingerprint collisions before template activation.
 * An ambiguous template match validates against the wrong spec — a silent
 * wrong-audit generator. Collision checks are mandatory before merge/activate.
 */

import type { SelectionConfig } from "./types";

/**
 * Fingerprint used for collision comparison
 */
export interface TemplateFingerprint {
  /** Numeric registry ID (optional for pack-only checks) */
  templateId?: number;
  /** Stable slug / templateId string */
  templateSlug: string;
  /** Selection config tokens */
  requiredTokensAll: string[];
  requiredTokensAny: string[];
  optionalTokens: string[];
  formCodeRegex?: string;
}

/**
 * Collision severity
 * - exact: identical requiredTokensAll sets
 * - high: Jaccard ≥ high threshold or one requiredAll is a subset of the other
 * - moderate: Jaccard ≥ moderate threshold
 */
export type CollisionSeverity = "exact" | "high" | "moderate";

/**
 * Single collision between two templates
 */
export interface CollisionMatch {
  templateA: string;
  templateB: string;
  severity: CollisionSeverity;
  overlapTokens: string[];
  jaccardSimilarity: number;
  reason: string;
}

/**
 * Collision check report
 */
export interface CollisionReport {
  /** Whether activation / merge is allowed (no exact/high collisions) */
  allowed: boolean;
  /** Blocking collisions (exact + high) */
  blocking: CollisionMatch[];
  /** Non-blocking moderate overlaps */
  warnings: CollisionMatch[];
  /** All matches */
  matches: CollisionMatch[];
  /** Summary message */
  message: string;
}

export interface CollisionDetectorOptions {
  /** Jaccard threshold for high severity (default 0.7) */
  jaccardHighThreshold?: number;
  /** Jaccard threshold for moderate severity (default 0.4) */
  jaccardModerateThreshold?: number;
  /** Treat exact requiredTokensAll match as blocking (default true) */
  blockExact?: boolean;
  /** Treat high Jaccard / subset as blocking (default true) */
  blockHigh?: boolean;
}

const DEFAULT_OPTIONS: Required<CollisionDetectorOptions> = {
  jaccardHighThreshold: 0.7,
  jaccardModerateThreshold: 0.4,
  blockExact: true,
  blockHigh: true,
};

/**
 * Normalize tokens for deterministic set comparison
 */
export function normalizeTokens(tokens: string[] | undefined | null): string[] {
  if (!tokens?.length) return [];
  return Array.from(
    new Set(tokens.map(t => t.trim().toLowerCase()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Build a fingerprint from a selection config
 */
export function fingerprintFromSelectionConfig(
  templateSlug: string,
  selectionConfig: SelectionConfig,
  templateId?: number
): TemplateFingerprint {
  return {
    templateId,
    templateSlug,
    requiredTokensAll: normalizeTokens(selectionConfig.requiredTokensAll),
    requiredTokensAny: normalizeTokens(selectionConfig.requiredTokensAny),
    optionalTokens: normalizeTokens(selectionConfig.optionalTokens),
    formCodeRegex: selectionConfig.formCodeRegex,
  };
}

/**
 * Jaccard similarity on two token sets
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const token of Array.from(setA)) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Tokens present in both sets
 */
export function overlapTokens(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter(t => setB.has(t)).sort((x, y) => x.localeCompare(y));
}

/**
 * True when every token in `subset` appears in `superset` (and subset non-empty)
 */
export function isTokenSubset(subset: string[], superset: string[]): boolean {
  if (subset.length === 0) return false;
  const set = new Set(superset);
  return subset.every(t => set.has(t));
}

function requiredTokenUniverse(fp: TemplateFingerprint): string[] {
  return normalizeTokens([...fp.requiredTokensAll, ...fp.requiredTokensAny]);
}

/**
 * Compare two fingerprints and return a match if they collide
 */
export function compareFingerprints(
  a: TemplateFingerprint,
  b: TemplateFingerprint,
  options: Required<CollisionDetectorOptions> = DEFAULT_OPTIONS
): CollisionMatch | null {
  if (a.templateSlug === b.templateSlug) return null;

  const aAll = normalizeTokens(a.requiredTokensAll);
  const bAll = normalizeTokens(b.requiredTokensAll);
  const aUniverse = requiredTokenUniverse(a);
  const bUniverse = requiredTokenUniverse(b);

  const allEqual =
    aAll.length > 0 &&
    aAll.length === bAll.length &&
    aAll.every((t, i) => t === bAll[i]);

  if (allEqual) {
    return {
      templateA: a.templateSlug,
      templateB: b.templateSlug,
      severity: "exact",
      overlapTokens: aAll,
      jaccardSimilarity: 1,
      reason: "Identical requiredTokensAll fingerprints",
    };
  }

  // Same form-code regex is an exact collision signal
  if (
    a.formCodeRegex &&
    b.formCodeRegex &&
    a.formCodeRegex === b.formCodeRegex
  ) {
    return {
      templateA: a.templateSlug,
      templateB: b.templateSlug,
      severity: "exact",
      overlapTokens: overlapTokens(aUniverse, bUniverse),
      jaccardSimilarity: 1,
      reason: "Identical formCodeRegex patterns",
    };
  }

  const jaccard = jaccardSimilarity(aUniverse, bUniverse);
  const overlap = overlapTokens(aUniverse, bUniverse);
  const subset =
    isTokenSubset(aAll, bAll) ||
    isTokenSubset(bAll, aAll) ||
    isTokenSubset(aUniverse, bUniverse) ||
    isTokenSubset(bUniverse, aUniverse);

  if (jaccard >= options.jaccardHighThreshold || subset) {
    return {
      templateA: a.templateSlug,
      templateB: b.templateSlug,
      severity: "high",
      overlapTokens: overlap,
      jaccardSimilarity: Math.round(jaccard * 1000) / 1000,
      reason: subset
        ? "Required token set is a subset of another template"
        : `High token overlap (Jaccard ${jaccard.toFixed(2)})`,
    };
  }

  if (jaccard >= options.jaccardModerateThreshold) {
    return {
      templateA: a.templateSlug,
      templateB: b.templateSlug,
      severity: "moderate",
      overlapTokens: overlap,
      jaccardSimilarity: Math.round(jaccard * 1000) / 1000,
      reason: `Moderate token overlap (Jaccard ${jaccard.toFixed(2)})`,
    };
  }

  return null;
}

/**
 * Detect collisions between a candidate fingerprint and existing templates
 */
export function detectTemplateCollisions(
  candidate: TemplateFingerprint,
  existing: TemplateFingerprint[],
  options: CollisionDetectorOptions = {}
): CollisionReport {
  const opts: Required<CollisionDetectorOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const matches: CollisionMatch[] = [];
  for (const other of existing) {
    const match = compareFingerprints(candidate, other, opts);
    if (match) matches.push(match);
  }

  matches.sort((a, b) => {
    const order = { exact: 0, high: 1, moderate: 2 };
    if (order[a.severity] !== order[b.severity]) {
      return order[a.severity] - order[b.severity];
    }
    return b.jaccardSimilarity - a.jaccardSimilarity;
  });

  const blocking = matches.filter(m => {
    if (m.severity === "exact") return opts.blockExact;
    if (m.severity === "high") return opts.blockHigh;
    return false;
  });
  const warnings = matches.filter(m => !blocking.includes(m));
  const allowed = blocking.length === 0;

  return {
    allowed,
    blocking,
    warnings,
    matches,
    message: allowed
      ? warnings.length > 0
        ? `No blocking collisions; ${warnings.length} moderate overlap warning(s)`
        : "No template fingerprint collisions detected"
      : `Blocked: ${blocking.length} collision(s) with existing templates`,
  };
}

/**
 * Pairwise collision scan across a full template set (governance dashboard)
 */
export function detectAllTemplateCollisions(
  fingerprints: TemplateFingerprint[],
  options: CollisionDetectorOptions = {}
): CollisionReport {
  const opts: Required<CollisionDetectorOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const matches: CollisionMatch[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const match = compareFingerprints(fingerprints[i], fingerprints[j], opts);
      if (!match) continue;
      const key = [match.templateA, match.templateB].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
  }

  matches.sort((a, b) => {
    const order = { exact: 0, high: 1, moderate: 2 };
    if (order[a.severity] !== order[b.severity]) {
      return order[a.severity] - order[b.severity];
    }
    return b.jaccardSimilarity - a.jaccardSimilarity;
  });

  const blocking = matches.filter(m => {
    if (m.severity === "exact") return opts.blockExact;
    if (m.severity === "high") return opts.blockHigh;
    return false;
  });
  const warnings = matches.filter(m => !blocking.includes(m));

  return {
    allowed: blocking.length === 0,
    blocking,
    warnings,
    matches,
    message:
      blocking.length === 0
        ? warnings.length > 0
          ? `Catalog clear of blockers; ${warnings.length} moderate overlap(s)`
          : "Template catalog has no fingerprint collisions"
        : `Catalog has ${blocking.length} blocking collision(s)`,
  };
}

/**
 * Format collision report as an activation error
 */
export function formatCollisionError(report: CollisionReport): string {
  const lines = report.blocking.map(
    m =>
      `- ${m.severity.toUpperCase()}: ${m.templateA} ↔ ${m.templateB} — ${m.reason}` +
      (m.overlapTokens.length
        ? ` (overlap: ${m.overlapTokens.join(", ")})`
        : "")
  );
  return (
    `TEMPLATE_COLLISION: Activation blocked due to fingerprint collisions.\n\n` +
    `${lines.join("\n")}\n\n` +
    `Fix: differentiate requiredTokensAll / requiredTokensAny or add a unique formCodeRegex.`
  );
}
