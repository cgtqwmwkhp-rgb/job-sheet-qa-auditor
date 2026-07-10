/**
 * Visual checklist (Ok/Adv/Fail/N/A) from Azure DI selectionMarks.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ChecklistChoice,
  SelectionMarksView,
} from "@/components/review/mapSelectionMarks";

function choiceBadge(choice: ChecklistChoice) {
  switch (choice) {
    case "Ok":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
          Ok
        </Badge>
      );
    case "Adv":
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
          Adv
        </Badge>
      );
    case "Fail":
      return <Badge variant="destructive">Fail</Badge>;
    case "N/A":
      return <Badge variant="secondary">N/A</Badge>;
    default:
      return <Badge variant="outline">Unreadable</Badge>;
  }
}

export interface SelectionMarksPanelProps {
  marks: SelectionMarksView | null;
  className?: string;
  defaultOpen?: boolean;
  onRowClick?: (rowIndex: number, pageNumber: number) => void;
}

export function SelectionMarksPanel({
  marks,
  className,
  defaultOpen = false,
  onRowClick,
}: SelectionMarksPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!marks || marks.rows.length === 0) return null;

  const failCount = marks.rows.filter(r => r.choice === "Fail").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn(className)}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-3 py-2 h-auto font-normal"
          >
            <span className="flex items-center gap-2 text-sm">
              <ListChecks className="w-4 h-4 text-muted-foreground" />
              Checklist marks
              <Badge variant="outline" className="text-[10px]">
                {marks.summary.readableRows}/{marks.summary.rowsDetected} read
              </Badge>
              {failCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {failCount} Fail
                </Badge>
              )}
            </span>
            {open ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
            {marks.error && (
              <p className="text-xs text-amber-700">{marks.error}</p>
            )}
            {marks.rows.map(row => (
              <button
                key={row.rowIndex}
                type="button"
                className="w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
                onClick={() => onRowClick?.(row.rowIndex, row.pageNumber)}
              >
                <div className="shrink-0 mt-0.5">{choiceBadge(row.choice)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {row.label || `Row ${row.rowIndex + 1}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    p.{row.pageNumber} · {row.confidence}% · {row.selectedCount}
                    /{row.markCount} selected
                  </p>
                </div>
              </button>
            ))}
            <p className="text-[10px] text-muted-foreground pt-1">
              Azure DI {marks.model} · {marks.engineVersion}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
