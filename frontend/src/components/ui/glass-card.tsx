import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface backdrop-blur-md border border-border rounded-xl shadow-elev-1",
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = "GlassCard";