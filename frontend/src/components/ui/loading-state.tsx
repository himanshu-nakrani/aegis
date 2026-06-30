import { cn } from "@/lib/utils";

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
      <div className={cn("flex items-center gap-2 text-sm text-muted", className)}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        {label}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("space-y-3 p-4", className)}>
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-4 w-3/4" />
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("divide-y divide-border", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("page-container space-y-8", className)}>
      <div className="space-y-3">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel h-24" />
        ))}
      </div>
      <p className="text-center text-sm text-muted">{label}</p>
    </div>
  );
}