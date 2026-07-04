import Link from "next/link";
import { PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionStateProps = {
  title?: string;
  description?: React.ReactNode;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Request failed";
}

export function ApiConnectionState({
  title = "API request failed",
  description,
  error,
  onRetry,
  className,
}: ConnectionStateProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return (
    <section className={cn("dashboard-panel overflow-hidden rounded-xl", className)}>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
              <PlugZap className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-title">{title}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted">
                {description ??
                  "This view depends on backend data. Start the API on the target below, then retry."}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {onRetry && (
              <Button type="button" onClick={onRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/">Dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-input p-4">
          <div className="text-micro">API</div>
          <p className="mt-2 break-all font-mono text-sm text-foreground">{apiUrl}</p>
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-micro">ERROR</div>
            <p className="mt-2 text-sm text-muted">{errorMessage(error)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
