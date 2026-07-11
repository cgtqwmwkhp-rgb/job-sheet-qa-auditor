/**
 * Shared completion-grid Yes/No extraction.
 *
 * Handles two-column grids (Compliance / Inverter sheets) and OCR-flattened
 * single-line documents. Extracted from jobSummaryConsistency so both that
 * module and advancedExtraction can share the same logic.
 */

const YES_NO_TOKEN_RE = /\b(yes|no|true|false)\b/i;

/** Completion-grid labels that bound Yes/No answers on Job Summary / Compliance. */
export const COMPLETION_FIELD_BOUNDARIES = [
  "Service Completed",
  "Additional Tasks Complete",
  "All Works Completed",
  "Return Visit Needed",
  "Consumables Used",
  "Asset Safe To Use",
  "Is the asset safe to use",
  "Is a return visit required",
  "Were all works fully completed",
  "Was the service fully completed",
  "Have all of the additional tasks been completed",
  "Job Duration",
  "Overtime",
  "Travel",
  "Job ID",
  "Compliance Checklist",
  "Next Service Date",
  "Compliance Type",
  "Compliance Title",
];

function completionBoundaryRe(): RegExp {
  return new RegExp(
    `(?:${COMPLETION_FIELD_BOUNDARIES.map(b =>
      b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|")})`,
    "i"
  );
}

function tokenToYesNo(token: string): "yes" | "no" {
  return /^(yes|true)$/i.test(token) ? "yes" : "no";
}

/** Yes/No on the same line before the next completion-field label. */
function yesNoBeforeBoundary(segment: string): "yes" | "no" | null {
  const stopAt = segment.search(completionBoundaryRe());
  const searchIn = stopAt >= 0 ? segment.slice(0, stopAt) : segment;
  const token = searchIn.match(YES_NO_TOKEN_RE);
  return token ? tokenToYesNo(token[1]) : null;
}

/**
 * Find Yes/No for a completion field even when the answer sits on the next
 * line under a two-column grid (common on Compliance / Inverter sheets).
 *
 * Layout example (DV23 inverter sheet):
 *   Service Completed?          Additional Tasks Complete?
 *              Yes                           Yes
 *   All Works Completed?  Yes   Return Visit Needed?  No
 *   Consumables Used?     No    Asset Safe To Use?    Yes
 */
export function extractCompletionYesNo(
  text: string,
  labelPatterns: RegExp[]
): "yes" | "no" | "unknown" {
  const lines = text.split(/\r?\n/);

  for (const label of labelPatterns) {
    const anchor = new RegExp(label.source, "i");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = anchor.exec(line);
      if (!m || m.index == null) continue;

      const afterOnLine = line.slice(m.index + m[0].length);
      const sameLine = yesNoBeforeBoundary(afterOnLine);
      if (sameLine) return sameLine;

      const labelCol = m.index;
      const lineMid = Math.max(40, Math.floor(line.length / 2));
      const preferLeft = labelCol < lineMid;

      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const next = lines[j];
        if (!next.trim()) continue;
        if (completionBoundaryRe().test(next)) continue;
        const tokens = Array.from(
          next.matchAll(new RegExp(YES_NO_TOKEN_RE.source, "gi"))
        );
        if (tokens.length === 0) continue;

        let picked = tokens[0];
        if (tokens.length >= 2) {
          picked = preferLeft ? tokens[0] : tokens[tokens.length - 1];
        }

        return tokenToYesNo(picked[1]);
      }
    }

    // Flattened OCR fallback
    const flat = anchor.exec(text);
    if (flat && flat.index != null) {
      const after = text.slice(
        flat.index + flat[0].length,
        flat.index + flat[0].length + 220
      );
      const flatAnswer = yesNoBeforeBoundary(after);
      if (flatAnswer) return flatAnswer;
    }
  }
  return "unknown";
}
