import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Compass, RefreshCcw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";

type RecoveryTone = "error" | "not-found" | "warning";

interface RecoveryStateProps {
  icon?: LucideIcon;
  tone?: RecoveryTone;
  title: string;
  description: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  tertiaryAction?: React.ReactNode;
  diagnostic?: string;
  className?: string;
}

const toneStyles: Record<
  RecoveryTone,
  {
    badge: string;
    icon: string;
    label: string;
    defaultIcon: LucideIcon;
    rail: string;
  }
> = {
  error: {
    badge: "destructive",
    icon: "bg-destructive/10 text-destructive shadow-elev-glow-destructive",
    label: "Recovery mode",
    defaultIcon: ShieldAlert,
    rail: "from-destructive/70 via-warning/45 to-transparent",
  },
  "not-found": {
    badge: "accent",
    icon: "bg-accent-muted text-accent shadow-elev-glow-accent",
    label: "Route not found",
    defaultIcon: Compass,
    rail: "from-accent/70 via-primary/45 to-transparent",
  },
  warning: {
    badge: "warning",
    icon: "bg-warning/10 text-warning shadow-elev-glow-warning",
    label: "Attention needed",
    defaultIcon: AlertTriangle,
    rail: "from-warning/70 via-primary/45 to-transparent",
  },
};

export function RecoveryState({
  icon,
  tone = "error",
  title,
  description,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  diagnostic,
  className,
}: RecoveryStateProps) {
  const style = toneStyles[tone];
  const Icon = icon ?? style.defaultIcon;

  return (
    <GlassCard className={cn("relative w-full max-w-3xl overflow-hidden p-0", className)}>
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", style.rail)} aria-hidden />
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", style.icon)}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={style.badge as "destructive" | "accent" | "warning"}>
                  {style.label}
                </Badge>
                {diagnostic && <Badge variant="outline">Ref {diagnostic}</Badge>}
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
                {description}
              </p>
            </div>
          </div>

          {(primaryAction || secondaryAction || tertiaryAction) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {primaryAction}
              {secondaryAction}
              {tertiaryAction}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface-input/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:border-l md:border-t-0">
          <div className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-3">
              {[
                "Preserve the current workspace",
                "Retry the failed route",
                "Return to a stable surface",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                >
                  <RefreshCcw className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted">
              The recovery state is isolated from workflow data, so refreshing or retrying will not
              mutate saved workflows.
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
