"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { StaggerList } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-date";
import { queryKeys } from "@/lib/query-keys";
import { useNow } from "@/hooks/use-now";
import { InlineQueryError } from "@/components/ui/inline-error";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { runStatusLabel, runStatusTextClass, runStatusTone } from "@/lib/run-status";
import { cn } from "@/lib/utils";

/** Number of recent runs to surface in the rail. */
const MAX_ROWS = 6;

/** Placeholder rows matched to the real row geometry (dot · text · time). */
function ActivitySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recent activity…" role="status">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0"
        >
          <span className="skeleton h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="skeleton block h-2.5" style={{ width: `${55 + ((i * 9) % 30)}%` }} />
            <span className="skeleton block h-2" style={{ width: `${25 + ((i * 7) % 20)}%` }} />
          </span>
          <span className="skeleton h-2 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function RecentActivityRail() {
  // Shares the summary query with the overview strip. "No runs yet" is a claim
  // about the user's history, so it may only render once the request actually
  // succeeded — never while loading and never on failure.
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.observabilitySummary,
    queryFn: api.getObservabilitySummary,
    retry: 1,
    staleTime: 30_000,
  });

  const now = useNow();
  const runs = (summary?.recent_runs ?? []).slice(0, MAX_ROWS);

  return (
    <SectionCard title="Recent activity" description="Latest runs across all workflows" flush actions={<Link href="/observability" className="focus-ring rounded text-xs text-muted hover:text-foreground">View all</Link>}>
      {isError ? (
        <div className="p-3">
          <InlineQueryError
            message="Couldn't load recent activity."
            onRetry={() => void refetch()}
          />
        </div>
      ) : isLoading ? (
        <ActivitySkeleton />
      ) : runs.length === 0 ? (
        <div className="p-3">
          <EmptyState
            icon={Activity}
            title="No runs yet"
            description="Trigger a workflow to see run activity here."
            compact
          />
        </div>
      ) : (
        <StaggerList className="divide-y divide-border" max={MAX_ROWS}>
          {runs.map((run) => {
            const when = run.created_at ? formatRelativeTime(run.created_at, now) : "—";
            return (
              <Row key={run.run_id} href={`/runs/${run.run_id}`} gutter="rail" className="group">
                <StatusDot tone={runStatusTone(run.status)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">
                    {run.workflow_name || "Untitled workflow"}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-2xs font-medium",
                      runStatusTextClass(run.status)
                    )}
                  >
                    {runStatusLabel(run.status)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">{when}</span>
              </Row>
            );
          })}
        </StaggerList>
      )}
    </SectionCard>
  );
}
