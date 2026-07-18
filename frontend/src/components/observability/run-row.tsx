"use client";

import Link from "next/link";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel } from "@/lib/run-status";
import type { api } from "@/lib/api";

type ObservabilitySummary = Awaited<ReturnType<typeof api.getObservabilitySummary>>;
export type RecentRun = ObservabilitySummary["recent_runs"][number];

export function statusDotClass(status: string): string {
  if (status === "completed") return "bg-success";
  if (status === "failed" || status === "cancelled") return "bg-destructive";
  if (status === "running" || status === "pending" || status === "queued") return "bg-warning";
  if (status === "awaiting_approval") return "bg-accent";
  return "bg-muted";
}

/** Column-header row so the mono run columns read as a table. */
export function RunColumnHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-subtle sm:px-4">
      <span className="w-1.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">workflow</span>
      <span className="hidden w-16 shrink-0 sm:inline">id</span>
      <span className="w-16 shrink-0">status</span>
      <span className="w-16 shrink-0 text-right">time</span>
      <span className="hidden w-14 shrink-0 text-right sm:inline">eval · lat</span>
    </div>
  );
}

export const StreamRunRow = memo(function StreamRunRow({ run }: { run: RecentRun }) {
  const now = useNow();
  return (
    <Link
      href={`/runs/${run.run_id}`}
      className="focus-ring flex min-h-[48px] items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors hover:bg-surface-hover sm:px-4"
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDotClass(run.status))}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {run.workflow_name || "Workflow"}
      </span>
      <span className="hidden w-16 shrink-0 font-mono text-2xs text-subtle sm:inline">
        {run.run_id.slice(0, 8)}
      </span>
      <span className="w-16 shrink-0 font-mono text-2xs text-muted">
        {runStatusLabel(run.status)}
      </span>
      <time
        className="w-16 shrink-0 text-right font-mono text-2xs text-subtle"
        dateTime={run.created_at}
        title={formatFullTimestamp(run.created_at)}
      >
        {formatRelativeTime(run.created_at, now)}
      </time>
      <span className="hidden w-14 shrink-0 text-right font-mono text-2xs text-muted sm:inline">
        {run.eval_aggregate != null
          ? run.eval_aggregate.toFixed(2)
          : run.latency_ms != null
            ? `${run.latency_ms}ms`
            : "—"}
      </span>
    </Link>
  );
});
