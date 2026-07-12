import { cn } from "@/lib/utils";

interface BrandLogoProps {
  /** Show PlantExpand wordmark beside the mark. Default true. */
  showWordmark?: boolean;
  /** Optional secondary line under the wordmark (e.g. product name). */
  subtitle?: string;
  className?: string;
  markClassName?: string;
}

/**
 * PlantExpand brand mark (interlocking octagons, lime + charcoal) + optional wordmark.
 */
export function BrandLogo({
  showWordmark = true,
  subtitle,
  className,
  markClassName,
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <img
        src="/plantexpand-mark.png"
        alt=""
        width={32}
        height={32}
        className={cn("h-7 w-7 shrink-0 object-contain", markClassName)}
        aria-hidden="true"
      />
      {showWordmark ? (
        <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
          <span className="font-heading font-bold text-sm truncate leading-tight">
            PlantExpand
          </span>
          {subtitle ? (
            <span className="text-xs opacity-80 truncate">{subtitle}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
