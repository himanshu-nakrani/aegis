import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowCard } from "@/components/ui/glow-card";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  value: ReactNode;
  footer?: ReactNode;
  icon?: LucideIcon;
  variant?: "default" | "highlight";
  className?: string;
};

export function StatCard({ eyebrow, value, footer, icon: Icon, variant = "default", className }: Props) {
  const inner = (
    <div className="flex min-h-28 flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-micro">{eyebrow}</div>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-input text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[30px] font-semibold leading-none text-foreground sm:text-[34px]">
          {value}
        </div>
        {footer && <div className="min-h-5">{footer}</div>}
      </div>
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
