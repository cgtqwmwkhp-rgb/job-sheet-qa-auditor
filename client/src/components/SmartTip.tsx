import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface SmartTipProps {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function SmartTip({ content, side = "top", className }: SmartTipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Info className={`h-4 w-4 text-muted-foreground/70 hover:text-primary cursor-help transition-colors ${className}`} />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs p-4 bg-popover border-border shadow-xl">
          <div className="text-sm space-y-2">
            {content}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
