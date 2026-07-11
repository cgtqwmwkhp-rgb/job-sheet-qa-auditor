/**
 * DocQualityBreakdown — popover showing itemized Doc Quality penalty deductions.
 *
 * Renders as a clickable Badge; clicking opens a popover with a small table of
 * ruleId, field, failClass, and points deducted.
 */

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DocQualityPenalty {
  ruleId: string;
  fieldName: string;
  severity: string;
  failClass?: "major" | "minor" | "informational";
  points: number;
}

export interface DocQualityBreakdownProps {
  score: string | number;
  penalties: DocQualityPenalty[];
}

export function mapDocQualityPenaltiesFromReport(
  reportJson: unknown
): DocQualityPenalty[] {
  if (!reportJson || typeof reportJson !== "object") return [];
  const raw = (reportJson as Record<string, unknown>)
    .documentationQualityPenalties;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map(p => ({
      ruleId: String(p.ruleId ?? ""),
      fieldName: String(p.fieldName ?? ""),
      severity: String(p.severity ?? ""),
      failClass: (["major", "minor", "informational"] as const).includes(
        p.failClass as any
      )
        ? (p.failClass as "major" | "minor" | "informational")
        : undefined,
      points: typeof p.points === "number" ? p.points : 0,
    }));
}

const failClassColors: Record<string, string> = {
  major: "bg-red-100 text-red-800 border-red-300",
  minor: "bg-orange-100 text-orange-800 border-orange-300",
  informational: "bg-slate-100 text-slate-600 border-slate-300",
};

export function DocQualityBreakdown({
  score,
  penalties,
}: DocQualityBreakdownProps) {
  const totalDeducted = penalties.reduce((sum, p) => sum + p.points, 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className="font-mono bg-[#333030] text-white border-[#333030] cursor-pointer hover:bg-[#444] transition-colors"
          title="Click to see Doc Quality penalty breakdown"
        >
          Doc quality: {score}
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0" sideOffset={6}>
        <div className="px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Doc Quality Breakdown</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Score: <span className="font-mono font-semibold">{score}</span>
            {totalDeducted > 0 && (
              <>
                {" "}
                &mdash; {totalDeducted} pts deducted from {penalties.length}{" "}
                issue{penalties.length !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        {penalties.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No penalty deductions — perfect score.
          </div>
        ) : (
          <div className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="py-2 px-3">Rule</TableHead>
                  <TableHead className="py-2 px-3">Field</TableHead>
                  <TableHead className="py-2 px-3">Class</TableHead>
                  <TableHead className="py-2 px-3 text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {penalties.map((p, i) => (
                  <TableRow
                    key={`${p.ruleId}-${p.fieldName}-${i}`}
                    className="text-xs"
                  >
                    <TableCell className="py-1.5 px-3 font-mono text-[11px]">
                      {p.ruleId || "—"}
                    </TableCell>
                    <TableCell
                      className="py-1.5 px-3 max-w-[140px] truncate"
                      title={p.fieldName}
                    >
                      {p.fieldName}
                    </TableCell>
                    <TableCell className="py-1.5 px-3">
                      {p.failClass ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${failClassColors[p.failClass] ?? ""}`}
                        >
                          {p.failClass}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-right font-mono tabular-nums text-red-600">
                      −{p.points}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold text-xs">
                  <TableCell colSpan={3} className="py-2 px-3">
                    Total deducted
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-red-700">
                    −{totalDeducted}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
