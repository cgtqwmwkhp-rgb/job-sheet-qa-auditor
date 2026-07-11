/**
 * Derive hold-queue reason chips from audit findings data.
 *
 * Each chip has a label, variant colour key, and optional detail
 * (e.g. affected field names for CONFLICT).
 */

export interface ReasonChip {
  key: string;
  label: string;
  variant: "destructive" | "warning" | "secondary" | "outline";
  className: string;
}

interface FindingLike {
  reasonCode?: string | null;
  severity?: string | null;
  fieldName?: string | null;
  resolutionStatus?: string | null;
}

const REASON_META: Record<
  string,
  { label: string; variant: ReasonChip["variant"]; className: string }
> = {
  CONFLICT: {
    label: "Conflict",
    variant: "destructive",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  LOW_CONFIDENCE: {
    label: "Low Confidence",
    variant: "warning",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  UNREADABLE_FIELD: {
    label: "Unreadable",
    variant: "warning",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  MISSING_FIELD: {
    label: "Missing Field",
    variant: "secondary",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  INVALID_FORMAT: {
    label: "Invalid Format",
    variant: "secondary",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  OUT_OF_POLICY: {
    label: "Out of Policy",
    variant: "destructive",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  OCR_FAILURE: {
    label: "OCR Failure",
    variant: "warning",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
};

const REASON_PRIORITY = [
  "CONFLICT",
  "LOW_CONFIDENCE",
  "UNREADABLE_FIELD",
  "MISSING_FIELD",
  "OUT_OF_POLICY",
  "INVALID_FORMAT",
  "OCR_FAILURE",
];

export function deriveReasonChips(
  findings: FindingLike[],
  opts?: { hasMajorFails?: boolean; auditResult?: string | null }
): ReasonChip[] {
  const open = findings.filter(
    f =>
      !f.resolutionStatus ||
      f.resolutionStatus === "open" ||
      f.resolutionStatus === "flagged"
  );

  const chips: ReasonChip[] = [];

  if (opts?.hasMajorFails) {
    chips.push({
      key: "major-fail",
      label: "Major Fail",
      variant: "destructive",
      className: "bg-red-100 text-red-800 border-red-200",
    });
  }

  const seenCodes = new Set<string>();
  for (const code of REASON_PRIORITY) {
    const matching = open.filter(f => f.reasonCode === code);
    if (matching.length === 0) continue;
    seenCodes.add(code);
    const meta = REASON_META[code];
    if (!meta) continue;

    let label = meta.label;
    if (code === "CONFLICT") {
      const fields = Array.from(
        new Set(matching.map(f => f.fieldName).filter(Boolean)),
      );
      if (fields.length > 0 && fields.length <= 2) {
        label = `${meta.label} ↔ ${fields.join(", ")}`;
      } else if (fields.length > 2) {
        label = `${meta.label} ↔ ${fields.length} fields`;
      }
    }

    chips.push({
      key: code,
      label,
      variant: meta.variant,
      className: meta.className,
    });
  }

  if (chips.length === 0) {
    chips.push({
      key: "review",
      label: "Review Required",
      variant: "secondary",
      className: "bg-orange-100 text-orange-800 border-orange-200",
    });
  }

  return chips;
}
