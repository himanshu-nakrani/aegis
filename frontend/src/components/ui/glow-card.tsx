import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "success" | "destructive" | "warning";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
};

const VARIANT_SHADOW: Record<Variant, string> = {
  primary: "shadow-glow-primary",
  accent: "shadow-glow-accent",
  success: "shadow-glow-success",
  destructive: "shadow-glow-destructive",
  warning: "shadow-glow-warning",
};

export const GlowCard = forwardRef<HTMLDivElement, Props>(
  ({ className, variant = "primary", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface backdrop-blur-md border border-border-glow rounded-xl",
        VARIANT_SHADOW[variant],
        className
      )}
      {...props}
    />
  )
);
GlowCard.displayName = "GlowCard";