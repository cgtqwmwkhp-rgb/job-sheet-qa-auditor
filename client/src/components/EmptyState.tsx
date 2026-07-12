import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      <div
        className={cn(
          "mb-4 flex items-center justify-center rounded-full bg-[rgba(190,218,65,0.12)]",
          compact ? "h-12 w-12" : "h-14 w-14"
        )}
      >
        <Icon
          className={cn("text-[#8A8787]", compact ? "h-6 w-6" : "h-7 w-7")}
          aria-hidden
        />
      </div>
      <p className="font-medium text-[#333030]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[#706D6D]">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-4">
          {action.href ? (
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
