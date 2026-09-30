"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { StaggerList } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionCard } from "@/components/ui/section-card";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-date";
import { queryKeys } from "@/lib/query-keys";
import { useNow } from "@/hooks/use-now";
import { InlineQueryError } from "@/components/ui/inline-error";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { runStatusTone } from "@/lib/run-status";

/** Number of recent runs to surface in the rail. */
const MAX_ROWS = 6;

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
        <div className="px-3 py-6 text-center">
          <LoadingState variant="inline" label="Loading recent activity…" />
        </div>
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
                  <span className="block truncate text-2xs capitalize text-subtle">
                    {run.status.replaceAll("_", " ")}
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
