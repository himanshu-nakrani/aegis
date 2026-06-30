import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info } from "lucide-react";
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

const variantIconStyles: Record<NonNullable<EmptyStateProps["variant"]>, string> = {
  default: "bg-primary-muted text-primary",
  error: "bg-destructive/10 text-destructive",
  info: "bg-primary-muted text-primary",
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
  const ResolvedIcon =
    Icon ?? (variant === "error" ? AlertTriangle : variant === "info" ? Info : undefined);

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-3 px-4 py-8" : "gap-4 px-6 py-14",
        className
      )}
    >
      {ResolvedIcon && (
        <div
          className={cn(
            // rounded-xl: decorative icon container, larger than inline controls (rounded-lg)
            "flex items-center justify-center rounded-xl",
            variantIconStyles[variant],
            compact ? "h-10 w-10" : "h-12 w-12"
          )}
        >
          <ResolvedIcon className={cn(compact ? "h-5 w-5" : "h-6 w-6")} />
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>
          {title}
        </p>
        {description && (
          <p className={cn("text-muted", compact ? "text-xs" : "text-sm")}>{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}