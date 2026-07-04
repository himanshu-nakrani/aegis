import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
  variant?: "default" | "error" | "info";
}

const variantStyles: Record<
  NonNullable<EmptyStateProps["variant"]>,
  { icon: string; rail: string; accent: string }
> = {
  default: {
    icon: "border-primary/20 bg-primary-muted text-primary shadow-elev-glow-primary",
    rail: "from-primary/70 via-accent/50 to-transparent",
    accent: "bg-primary",
  },
  error: {
    icon: "border-destructive/25 bg-destructive/10 text-destructive shadow-elev-glow-destructive",
    rail: "from-destructive/70 via-warning/45 to-transparent",
    accent: "bg-destructive",
  },
  info: {
    icon: "border-accent/25 bg-accent-muted text-accent shadow-elev-glow-accent",
    rail: "from-accent/70 via-primary/45 to-transparent",
    accent: "bg-accent",
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
  variant = "default",
}: EmptyStateProps) {
  const ResolvedIcon = Icon ?? (variant === "error" ? AlertTriangle : variant === "info" ? Info : Inbox);
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-surface text-center shadow-elev-1 backdrop-blur-md",
        compact ? "gap-3 px-4 py-5" : "gap-5 p-8 sm:p-10",
        className
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", styles.rail)} />
      {ResolvedIcon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-xl border",
            styles.icon,
            compact ? "h-10 w-10" : "h-12 w-12"
          )}
        >
          <ResolvedIcon className={cn(compact ? "h-5 w-5" : "h-6 w-6")} aria-hidden="true" />
        </div>
      )}
      <div className={cn("max-w-sm", compact ? "space-y-1" : "space-y-2")}>
        <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-lg")}>
          {title}
        </p>
        {description && (
          <p className={cn("text-muted", compact ? "text-xs leading-5" : "text-sm leading-6")}>
            {description}
          </p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex w-full flex-col items-center justify-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {action}
          {secondaryAction}
        </div>
      )}
      {!compact && (
        <div className="flex items-center gap-1" aria-hidden="true">
          <span className={cn("h-1.5 w-1.5 rounded-full", styles.accent)} />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-border" />
        </div>
      )}
    </div>
  );
}
