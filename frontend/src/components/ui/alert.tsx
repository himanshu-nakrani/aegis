import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "warning" | "destructive" | "success" | "info";

const variantStyles: Record<AlertVariant, { box: string; icon: string }> = {
  warning: {
    box: "border-warning/40 bg-warning/10",
    icon: "text-warning",
  },
  destructive: {
    box: "border-destructive/40 bg-destructive/10",
    icon: "text-destructive",
  },
  success: {
    box: "border-success/40 bg-success/10",
    icon: "text-success",
  },
  info: {
    box: "border-primary/40 bg-primary-muted",
    icon: "text-primary",
  },
};

interface AlertProps {
  variant?: AlertVariant;
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({
  variant = "warning",
  icon: Icon,
  title,
  description,
  actions,
  onDismiss,
  className,
}: AlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        styles.box,
        className
      )}
      role="alert"
    >
      {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <div className="text-sm text-muted">{description}</div>}
        {actions && <div className="flex flex-wrap gap-3 pt-1 text-xs">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss alert"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}