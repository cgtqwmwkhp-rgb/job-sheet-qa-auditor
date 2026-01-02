import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge Component - Plantexpand Style Guide
 * 
 * - 4px vertical padding, 8px horizontal
 * - 11px font size, 500 weight
 * - 4px border radius
 * - Uppercase text
 * - Semantic color variants
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wide w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        // Default - Lime Green
        default:
          "bg-primary text-primary-foreground",
        // Secondary - Gray background
        secondary:
          "bg-[#F5F4F4] text-[#706D6D] dark:bg-[#334155] dark:text-[#94A3B8]",
        // Destructive - Red
        destructive:
          "bg-[#FEE2E2] text-[#BA3737] dark:bg-[#7F1D1D] dark:text-[#FCA5A5]",
        // Outline - Border only
        outline:
          "border border-[#EBE8E8] bg-transparent text-foreground dark:border-[#334155]",
        // Success - Emerald
        success:
          "bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]",
        // Warning - Amber
        warning:
          "bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FCD34D]",
        // Info - Blue
        info:
          "bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A8A] dark:text-[#93C5FD]",
        // Purple - For PAMS/People stream
        purple:
          "bg-[rgba(139,92,246,0.15)] text-[#8B5CF6]",
        // Emerald - For Parts/Assets stream
        emerald:
          "bg-[rgba(16,185,129,0.15)] text-[#10B981]",
        // Blue - For Contracts/Docs stream
        blue:
          "bg-[rgba(59,130,246,0.15)] text-[#3B82F6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
