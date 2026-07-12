import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DocOutcomeResult =
  | "pass"
  | "fail"
  | "review_queue"
  | "PASS"
  | "FAIL"
  | "REVIEW_QUEUE"
  | string;

/**
 * Documentation-quality outcome badge.
 * PASS/FAIL here means paperwork consistency — not whether the asset passed.
 */
export function DocOutcomeBadge({
  result,
  className,
  showDocsHint = true,
}: {
  result: DocOutcomeResult | null | undefined;
  className?: string;
  /** Append a quiet "docs" cue so PASS is not read as asset pass. */
  showDocsHint?: boolean;
}) {
  if (!result) return null;
  const normalized = String(result).toLowerCase();
  const isPass = normalized === "pass";
  const isReview = normalized === "review_queue" || normalized === "review";
  const isFail = normalized === "fail";

  if (!isPass && !isFail && !isReview) {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground", className)}
      >
        —
      </Badge>
    );
  }

  const label = isPass ? "PASS" : isReview ? "REVIEW" : "FAIL";
  const title =
    "Documentation quality — not whether the asset passed inspection";

  return (
    <Badge
      variant={isPass ? "default" : isFail ? "destructive" : "outline"}
      title={title}
      aria-label={`${label}: documentation quality`}
      className={cn(
        isPass && "bg-emerald-600 hover:bg-emerald-700",
        isReview && "border-amber-500/60 text-amber-800 dark:text-amber-200",
        className
      )}
    >
      {label}
      {showDocsHint ? (
        <span className="ml-1 font-normal opacity-80">· docs</span>
      ) : null}
    </Badge>
  );
}
