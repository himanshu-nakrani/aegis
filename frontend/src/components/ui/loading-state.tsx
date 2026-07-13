import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";

interface LoadingStateProps {
  label?: string;
  className?: string;
  variant?: "page" | "inline" | "card" | "list";
}

export function LoadingState({
  label = "Loading…",
  className,
  variant = "page",
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-border bg-surface-input px-2.5 py-1.5 text-xs font-medium text-muted",
          className
        )}
      >
        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden="true" />
        <span>{label}</span>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <GlassCard className={cn("overflow-hidden p-0", className)} aria-busy="true">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-5 w-40" />
            </div>
            <LoaderCircle className="h-4 w-4 animate-spin text-muted" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="skeleton h-20 w-full" />
          <p className="text-xs text-muted">{label}</p>
        </div>
      </GlassCard>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true" aria-label={label}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-3"
          >
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-44 max-w-full" />
              <div className="skeleton h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("page-container space-y-4", className)}
      aria-busy="true"
      aria-label={label}
    >
      <div className="space-y-2">
        <div className="skeleton h-8 w-48 max-w-full" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <GlassCard key={i} className="space-y-3 p-4">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-16" />
            <div className="skeleton h-3 w-28" />
          </GlassCard>
        ))}
      </div>
      <GlassCard className="space-y-3 p-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-10 w-full" />
      </GlassCard>
    </div>
  );
}
