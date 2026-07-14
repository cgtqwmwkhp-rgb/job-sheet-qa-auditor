/**
 * In-app how-to for Template Studio authoring (GIGO).
 * Evidence-based rules aligned with live audit behaviour.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const RULES: Array<{ title: string; body: string }> = [
  {
    title: "ROI boxes must be OCR-placed, not generic",
    body: "Suggest fields runs Azure DI layout and places TIGHT boxes on real printed labels (e.g. Job ID, Asset No). If a box misses the value, select it and resize from the edges — never accept overlapping page-tall blobs.",
  },
  {
    title: "Hover Draw labels for how-to",
    body: "Each label in the Draw labels dock (left of the PDF) shows what to look for and whether to box the printed heading with the value, value-only, or the whole tickbox grid.",
  },
  {
    title: "Custom labels are remembered",
    body: "When you + Add a custom label, it is saved for the next template and added to this template's Fields list under the same field id — reuse it so extraction and thresholds stay consistent.",
  },
  {
    title: "One field id — never invent a parallel label",
    body: "Draw labels must use the exact field id from Suggest fields / Fields & rules (e.g. serialNumber, not Serial_Number). Duplicates break extraction and thresholds.",
  },
  {
    title: "Tickboxes: one block for the whole grid",
    body: "Draw a single tickboxBlock covering row requirement text + all four columns (Ok / Adv / Fail / N/A) and the column headers. Do not draw one ROI per column or per tick.",
  },
  {
    title: "Readings with thresholds: label + value",
    body: "For torque, PSI, mm, etc., box the printed label and the number together (e.g. Wheel Nut Torque (NM): 115). Turn Measurement check on only for those fields.",
  },
  {
    title: "IDs, dates, signatures: value area",
    body: "Box the value or signature stroke. A little label edge is fine; avoid huge overlapping zones.",
  },
  {
    title: "Avoid overlapping regions",
    body: "Overlaps only warn today but confuse authors and can mix evidence. Prefer side-by-side or stacked non-overlapping boxes.",
  },
  {
    title: "Keywords ≠ completeness",
    body: "selectionConfig tokens tell the system which template this PDF is. Audit completeness comes from required fields, critical ROIs, and rules — not from token lists.",
  },
  {
    title: "Measurement check is opt-in",
    body: "Leave Measurement check off for Asset ID, signatures, etc. Enable it only when a numeric min/max/unit must fail the live audit.",
  },
  {
    title: "Dry-run before activate",
    body: "Gates run the real audit pipeline. Fix findings, acknowledge dry-run, then activate. ROI edits change the version hash and require a fresh dry-run.",
  },
];

interface TemplateAuthoringGuideProps {
  /** Compact inline panel vs full card */
  compact?: boolean;
  defaultOpen?: boolean;
}

export function TemplateAuthoringGuide({
  compact = false,
  defaultOpen = false,
}: TemplateAuthoringGuideProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (compact) {
    return (
      <div
        className="rounded-md border border-[#BEDA41]/50 bg-[#F7F9EC]"
        data-testid="template-authoring-guide"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-sm font-semibold text-[#333030]">
            How to author a template (GIGO)
          </span>
          <span className="text-xs text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
        </button>
        {open && (
          <ol className="space-y-2 border-t border-[#BEDA41]/30 px-3 py-3 text-xs text-slate-700">
            {RULES.map((r, i) => (
              <li key={r.title}>
                <span className="font-semibold">
                  {i + 1}. {r.title}.
                </span>{" "}
                {r.body}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return (
    <Card data-testid="template-authoring-guide">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              How to author a template
            </CardTitle>
            <CardDescription>
              Good templates in → reliable live audits. Follow these rules
              every time you upload a form.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(o => !o)}
          >
            {open ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            {RULES.map(r => (
              <li key={r.title}>
                <span className="font-semibold text-[#333030]">{r.title}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.body}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
