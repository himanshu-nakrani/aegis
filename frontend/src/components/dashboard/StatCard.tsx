import { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowCard } from "@/components/ui/glow-card";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  value: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "highlight";
  className?: string;
};

export function StatCard({ eyebrow, value, footer, variant = "default", className }: Props) {
  const inner = (
    <div className="flex flex-col gap-2">
      <div className="text-micro">{eyebrow}</div>
      <div className="text-display">{value}</div>
      {footer && <div>{footer}</div>}
    </div>
  );
  return variant === "highlight" ? (
    <GlowCard variant="primary" className={cn("p-5", className)}>
      {inner}
    </GlowCard>
  ) : (
    <GlassCard className={cn("p-5", className)}>{inner}</GlassCard>
  );
}