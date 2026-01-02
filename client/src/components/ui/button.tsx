import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button Component - Plantexpand Style Guide
 * 
 * Primary: Lime Green (#BEDA41) with Charcoal text
 * Secondary: White with border
 * Ghost: Transparent with hover background
 * Destructive: Crimson Red (#BA3737)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Primary - Lime Green with Charcoal text
        default: 
          "bg-primary text-primary-foreground hover:bg-[#A8C038] hover:-translate-y-0.5 active:translate-y-0",
        // Destructive - Crimson Red
        destructive:
          "bg-destructive text-white hover:bg-[#962C2C] focus-visible:ring-destructive/50",
        // Outline/Secondary - White with border
        outline:
          "border border-[#EBE8E8] bg-white text-foreground hover:bg-[#33303008] hover:border-foreground font-medium",
        // Secondary - Same as outline for Plantexpand
        secondary:
          "border border-[#EBE8E8] bg-white text-foreground hover:bg-[#33303008] hover:border-foreground font-medium",
        // Ghost - Transparent
        ghost:
          "bg-transparent text-foreground hover:bg-[#33303008] font-medium",
        // Link - Blue underline
        link: "text-[#2868CE] underline-offset-4 hover:underline hover:text-[#1E52A3] font-medium",
      },
      size: {
        // Small: 36px height
        sm: "h-9 rounded-lg gap-1.5 px-3 py-2 text-[13px] has-[>svg]:px-2.5",
        // Default: 40px height
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        // Large: 44px height
        lg: "h-11 rounded-lg px-6 py-3 has-[>svg]:px-5",
        // Icon buttons
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
