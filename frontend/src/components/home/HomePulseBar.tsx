"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NumberTween } from "@/components/motion";
import { Sparkline } from "@/components/ui/sparkline";
import { api } from "@/lib/api";
import { useObservabilityRuns } from "@/hooks/use-observability-runs";
import { queryKeys } from "@/lib/query-keys";
import { timeBuckets } from "@/lib/time-buckets";
import { cn } from "@/lib/utils";
import { partitionByLifecycle } from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

/** Number of sparkline buckets for the run-volume mini chart. */
const RUN_BUCKETS = 20;

function PulseStat({
  label,
  value,
  chart,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  chart?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 lg:flex-1 lg:px-5 lg:first:pl-0">
      <p className="text-micro text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2.5">
        <span className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">
          {value}
        </span>
        {chart}
      </div>
      {sub != null && <div className="mt-1.5 text-2xs text-subtle">{sub}</div>}
    </div>
  );
}

/**
 * Slim at-a-glance health strip above the desk. Supplemental only: renders
 * dashes while the summary loads and hides entirely if the request fails, so
 * it can never error-flash the desk below.
 */
export function HomePulseBar({ workflows }: { workflows: WorkflowListItem[] }) {
  const summaryQuery = useQuery({
    queryKey: queryKeys.observabilitySummary,
    queryFn: api.getObservabilitySummary,
    retry: 1,
    staleTime: 30_000,
  });
  const runsQuery = useObservabilityRuns(100, summaryQuery.isSuccess);

  const summary = summaryQuery.data;

  const runVolume = useMemo(() => {
    const rows = runsQuery.data?.recent_runs ?? [];
    if (rows.length === 0) return [] as number[];
    const stamped = rows.map((r) => ({
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    }));
    return timeBuckets(stamped, RUN_BUCKETS);
  }, [runsQuery.data]);

  const passTrend = useMemo(() => {
    const trend = summary?.quality.eval_trend ?? [];
    return trend
      .map((t) => t.aggregate)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  }, [summary]);

  const stages = useMemo(() => partitionByLifecycle(workflows), [workflows]);

  if (summaryQuery.isError) return null;

  const activeRuns = summary?.active_runs ?? 0;
  const passRate = summary?.quality.eval_pass_rate ?? null;
  const evalRunCount = summary?.quality.eval_run_count ?? 0;
  // A pass rate needs verdicts, and verdicts need thresholds. Scored-but-
  // unjudged runs must say so — "—" over "15 eval runs" reads as broken data.
  const evalsUnjudged = passRate == null && evalRunCount > 0;

  // partitionByLifecycle is exhaustive over the three stages, so segment
  // widths sum to 100% and the chips add up to the Library total.
  const total = workflows.length;
  const segWidth = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;

  return (
    <div
      role="group"
      aria-label="Fleet health"
      className={cn(
        "surface-card grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border px-4 py-3 shadow-elev-1",
        "lg:flex lg:items-start lg:divide-x lg:divide-border lg:gap-0"
      )}
    >
      <PulseStat
        label="Active runs"
        value={
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                activeRuns > 0 ? "animate-pulse bg-success" : "bg-muted/60"
              )}
              aria-hidden
            />
            {summary ? <NumberTween value={activeRuns} /> : "—"}
          </span>
        }
        sub={activeRuns > 0 ? "executing now" : "idle"}
      />

      <PulseStat
        label="Runs"
        value={summary ? <NumberTween value={summary.run_count} /> : "—"}
        chart={
          runVolume.length >= 2 ? (
            <Sparkline
              data={runVolume}
              label="Run volume over the last 100 runs"
              fill
              width={72}
              height={20}
              className="text-primary/70"
            />
          ) : undefined
        }
        sub="total · volume over last 100"
      />

      <PulseStat
        label="Eval pass rate"
        value={
          passRate != null ? (
            <NumberTween value={passRate * 100} suffix="%" />
          ) : (
            "—"
          )
        }
        chart={
          passTrend.length >= 2 ? (
            <Sparkline
              data={passTrend}
              label="Eval aggregate trend"
              showLastDot
              width={72}
              height={20}
              className="text-success"
            />
          ) : undefined
        }
        sub={
          summary
            ? evalsUnjudged
              ? `${evalRunCount} scored · no thresholds set`
              : `${evalRunCount} eval runs`
            : undefined
        }
      />

      <PulseStat
        label="Library"
        value={<NumberTween value={total} />}
        chart={
          total > 0 ? (
            // Lifecycle mix rail — same recipe as SeverityBar, draft is neutral
            // (not a failure), so muted stands in for the third segment.
            <span
              className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-input"
              aria-hidden
            >
              <span className="bg-success/70" style={{ width: segWidth(stages.published.length) }} />
              <span className="bg-warning/70" style={{ width: segWidth(stages.in_review.length) }} />
              <span className="bg-muted/70" style={{ width: segWidth(stages.draft.length) }} />
            </span>
          ) : undefined
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-success/70" aria-hidden />
              {stages.published.length} live
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-warning/70" aria-hidden />
              {stages.in_review.length} review
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-muted/70" aria-hidden />
              {stages.draft.length} draft
            </span>
          </span>
        }
      />
    </div>
  );
}
