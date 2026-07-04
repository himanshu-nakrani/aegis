import { Activity, LoaderCircle } from "lucide-react";
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
        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
        <span>{label}</span>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <GlassCard className={cn("overflow-hidden p-0", className)} aria-busy="true">
        <div className="border-b border-border bg-surface-input px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-5 w-40" />
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-primary">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="skeleton h-20 w-full" />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </GlassCard>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"
          >
            <div className="skeleton h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-44 max-w-full" />
              <div className="skeleton h-3 w-64 max-w-full" />
            </div>
            <div className="skeleton h-6 w-16 rounded-md max-sm:hidden" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("page-container space-y-6", className)} aria-busy="true">
      <GlassCard className="overflow-hidden p-0">
        <div className="h-1 bg-gradient-to-r from-primary/70 via-accent/60 to-transparent" />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-56 max-w-full" />
            <div className="skeleton h-4 w-96 max-w-full" />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-muted">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            {label}
          </div>
        </div>
      </GlassCard>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-9 w-9 rounded-lg" />
            </div>
            <div className="skeleton h-7 w-16" />
            <div className="skeleton h-3 w-28" />
          </GlassCard>
        ))}
      </div>
      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3 p-5">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-28 w-full" />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
            </div>
          </div>
          <div className="border-t border-border bg-surface-input p-5 lg:border-l lg:border-t-0">
            <div className="space-y-3">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
