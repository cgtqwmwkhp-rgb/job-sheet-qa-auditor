import {
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  PIPELINE_CORE_STAGES,
  type ProcessStatusView,
  type ProcessingStageSnapshot,
  type StageRunStatus,
} from "@shared/processingProgress";

function StageIcon({ status }: { status: StageRunStatus }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-[#2868CE]" />;
    case "skipped":
      // PX-093 — N/A / skipped stages stay neutral (never red ✗)
      return (
        <SkipForward
          className="h-4 w-4 text-muted-foreground"
          aria-label="Skipped"
        />
      );
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  }
}

function stageLabel(stage: ProcessingStageSnapshot): string {
  if (stage.status === "running") return `${stage.stage}…`;
  if (stage.status === "skipped") return `${stage.stage} (N/A)`;
  return stage.stage;
}

interface ProcessingProgressPanelProps {
  progress: ProcessStatusView | null | undefined;
  className?: string;
  compact?: boolean;
  title?: string;
}

export function ProcessingProgressPanel({
  progress,
  className,
  compact = false,
  title = "Processing progress",
}: ProcessingProgressPanelProps) {
  if (!progress) return null;

  const stages = progress.stages.filter(
    s =>
      !compact ||
      s.status !== "pending" ||
      (PIPELINE_CORE_STAGES as readonly string[]).includes(s.stage)
  );

  return (
    <div
      className={cn(
        "rounded-lg border bg-blue-50/40 border-blue-100 p-4 space-y-3",
        className
      )}
      data-testid="processing-progress-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.percentComplete}%
        </span>
      </div>
      <Progress value={progress.percentComplete} className="h-2" />
      {progress.currentStage && (
        <p className="text-xs text-muted-foreground">
          Current: {progress.currentStage}
        </p>
      )}
      <ul className="space-y-1.5">
        {stages.map(stage => (
          <li
            key={stage.stage}
            className="flex items-center gap-2 text-sm"
            data-stage={stage.stage}
            data-stage-status={stage.status}
          >
            <StageIcon status={stage.status} />
            <span
              className={cn(
                stage.status === "pending" && "text-muted-foreground",
                stage.status === "running" && "font-medium text-blue-800",
                stage.status === "failed" && "text-red-700",
                stage.status === "skipped" && "text-muted-foreground"
              )}
            >
              {stageLabel(stage)}
            </span>
            {typeof stage.durationMs === "number" &&
              stage.status !== "pending" &&
              stage.status !== "running" && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {stage.durationMs}ms
                </span>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}
