import {
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  ProcessStatusView,
  ProcessingStageSnapshot,
  StageRunStatus,
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
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  }
}

function stageLabel(stage: ProcessingStageSnapshot): string {
  if (stage.status === "running") return `${stage.stage}…`;
  if (stage.status === "skipped") return `${stage.stage} (skipped)`;
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
      // Hide trailing pending extras in compact mode except canonical flow
      !compact ||
      s.status !== "pending" ||
      progress.stages.findIndex(x => x.stage === s.stage) < 6
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
                stage.status === "failed" && "text-red-700"
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
