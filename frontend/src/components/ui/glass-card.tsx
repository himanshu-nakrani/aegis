import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-surface shadow-elev-1 backdrop-blur-md",
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = "GlassCard";
