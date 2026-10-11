"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChartNoAxesCombined, CircleCheck, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NumberTween } from "@/components/motion";
import { Sparkline } from "@/components/ui/sparkline";
import { InlineQueryError } from "@/components/ui/inline-error";
import { api } from "@/lib/api";
import { useObservabilityRuns } from "@/hooks/use-observability-runs";
import { queryKeys } from "@/lib/query-keys";
import { rateTone, toneTextClass } from "@/lib/run-status";
import { timeBuckets } from "@/lib/time-buckets";
import { cn } from "@/lib/utils";
import { partitionByLifecycle } from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

/** Number of sparkline buckets for the run-volume mini chart. */
const RUN_BUCKETS = 20;

function PulseStat({
  href,
  icon: Icon,
  label,
  value,
  valueClassName,
  chart,
  sub,
  subClassName,
  footer,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  /** Extra classes on the metric text (status-aware color). */
  valueClassName?: string;
  chart?: React.ReactNode;
  sub?: React.ReactNode;
  /** Extra classes on the support line. */
  subClassName?: string;
  /** Bottom rail — a full-width visual like the lifecycle bar. */
  footer?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface-card group flex min-w-0 flex-col rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4"
    >
      <span className="flex items-center gap-1.5 text-micro">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-2.5 flex flex-wrap items-end gap-x-2.5 gap-y-1">
        <span
          className={cn(
            "text-title font-mono tabular-nums text-foreground sm:text-metric",
            valueClassName
          )}
        >
          {value}
        </span>
        {chart}
      </span>
      {sub != null && (
        <span className={cn("mt-1.5 block text-2xs text-subtle", subClassName)}>
          {sub}
        </span>
      )}
      {footer != null && <span className="mt-auto pt-3">{footer}</span>}
    </Link>
  );
}

/**
 * Linked at-a-glance metric cards above the desk. Summary cards show dashes
 * while loading and an inline error when health fails, so the library card
 * stays usable and stale health values are never shown.
 */
export function HomePulseBar({ workflows }: { workflows: WorkflowListItem[] }) {
  const summaryQuery = useQuery({
    queryKey: queryKeys.observabilitySummary,
    queryFn: api.getObservabilitySummary,
    retry: 1,
    staleTime: 30_000,
  });
  const runsQuery = useObservabilityRuns(100, summaryQuery.isSuccess);

  // On error hide stale cache explicitly so failed health never shows old numbers.
  const summary = summaryQuery.isError ? undefined : summaryQuery.data;
  const isSummaryError = summaryQuery.isError;

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

  const activeRuns = summary?.active_runs ?? 0;
  const passRate = summary?.quality.eval_pass_rate ?? null;
  const evalRunCount = summary?.quality.eval_run_count ?? 0;
  // A pass rate needs verdicts, and verdicts need thresholds. Scored-but-
  // unjudged runs must say so — "—" over "15 eval runs" reads as broken data.
  const evalsUnjudged = passRate == null && evalRunCount > 0;
  // Judged pass rate becomes a status signal; raw count stays neutral.
  const passTone = passRate != null ? rateTone(passRate, "high-good", [0.8, 0.5]) : null;

  // partitionByLifecycle is exhaustive over the three stages, so segment
  // widths sum to 100% and the chips add up to the Workflows total.
  const total = workflows.length;
  const segWidth = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;


  return (
    <div role="group" aria-label="Workspace health">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PulseStat
          href="/observability"
          icon={Activity}
          label="Active runs"
          value={
            summary ? (
              <span
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  activeRuns > 0 && "text-active"
                )}
              >
                {summaryQuery.isSuccess && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      activeRuns > 0 ? "motion-safe:animate-pulse bg-active" : "bg-muted/60"
                    )}
                    aria-hidden
                  />
                )}
                <NumberTween value={activeRuns} />
              </span>
            ) : (
              "—"
            )
          }
          sub={
            isSummaryError
              ? "Unavailable"
              : summary
                ? activeRuns > 0
                  ? "executing now"
                  : "no runs in flight"
                : "Loading…"
          }
          subClassName={cn(
            isSummaryError && "text-destructive/80",
            summary && activeRuns > 0 && "text-active"
          )}
        />
        <PulseStat
          href="/observability"
          icon={ChartNoAxesCombined}
          label="Total runs"
          value={summary ? <NumberTween value={summary.run_count} /> : "—"}
          chart={
            summary && !runsQuery.isError && runVolume.length >= 2 ? (
              <Sparkline
                data={runVolume}
                label="Run volume over the last 100 runs"
                fill
                width={72}
                height={22}
                className="pb-1 text-primary/70"
              />
            ) : undefined
          }
          sub={
            isSummaryError
              ? "Unavailable"
              : summary
                ? "all time · last 100 charted"
                : "Loading…"
          }
          subClassName={cn(isSummaryError && "text-destructive/80")}
        />
        <PulseStat
          href="/observability"
          icon={CircleCheck}
          label="Eval pass rate"
          value={passRate != null ? <NumberTween value={passRate * 100} suffix="%" /> : "—"}
          valueClassName={passTone ? toneTextClass(passTone) : undefined}
          chart={
            passTrend.length >= 2 ? (
              <Sparkline
                data={passTrend}
                label="Eval aggregate trend"
                showLastDot
                width={72}
                height={22}
                className={cn("pb-1", passTone ? toneTextClass(passTone) : "text-success")}
              />
            ) : undefined
          }
          sub={
            isSummaryError
              ? "Unavailable"
              : summary
                ? evalsUnjudged
                  ? `${evalRunCount} scored · no thresholds set`
                  : `${evalRunCount} eval runs`
                : "Loading…"
          }
          subClassName={cn(isSummaryError && "text-destructive/80")}
        />
        <PulseStat
          href="#library"
          icon={Workflow}
          label="Workflows"
          value={<NumberTween value={total} />}
          sub={
            total > 0 ? (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-success/80" aria-hidden />
                  <span className="font-medium text-success">{stages.published.length} live</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning/80" aria-hidden />
                  <span className="font-medium text-warning">{stages.in_review.length} review</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted/70" aria-hidden />
                  <span>{stages.draft.length} draft</span>
                </span>
              </span>
            ) : (
              "no workflows yet"
            )
          }
          footer={
            total > 0 ? (
              <span
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-input"
                role="img"
                aria-label={`${stages.published.length} live, ${stages.in_review.length} in review, ${stages.draft.length} draft`}
              >
                <span className="bg-success/70" style={{ width: segWidth(stages.published.length) }} />
                <span className="bg-warning/70" style={{ width: segWidth(stages.in_review.length) }} />
                <span className="bg-muted/70" style={{ width: segWidth(stages.draft.length) }} />
              </span>
            ) : undefined
          }
        />
      </div>
      {isSummaryError && (
        <div className="mt-3">
          <InlineQueryError message="Workspace health is unavailable." onRetry={() => void summaryQuery.refetch()} />
        </div>
      )}
    </div>
  );
}
