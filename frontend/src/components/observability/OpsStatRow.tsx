"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkline } from "@/components/ui/sparkline";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { timeBuckets } from "@/lib/time-buckets";
import { formatCostUsd } from "@/lib/format";
import type { ObservabilityCosts } from "@/types/workflow";

type SummaryLike = {
  run_count: number;
  active_runs: number;
  max_concurrent_runs: number;
  scheduler?: { enabled: boolean; running: boolean; poll_seconds: number } | null;
  scheduled_workflow_count: number;
  quality: {
    eval_pass_rate: number | null;
    eval_trend: Array<{ created_at: string; aggregate: number }>;
    guardrail_stats: { blocked_runs: number };
  };
};

interface OpsStatRowProps {
  summary: SummaryLike;
  costs?: ObservabilityCosts;
}

/**
 * Instrument-style stat row for the observability dashboard: five StatCards
 * plus a scheduler footnote. Owns its own listObservabilityRuns query so the
 * latency sparkline reflects the real per-run series (the summary only carries
 * an aggregate p50/p95). Endpoint caps at 100 runs — labels say so honestly.
 */
export function OpsStatRow({ summary, costs }: OpsStatRowProps) {
  const { data: runsData } = useQuery({
    queryKey: ["observability-runs", 100],
    queryFn: () => api.listObservabilityRuns(100),
    staleTime: 30_000,
  });

  const runSampleCount = runsData?.recent_runs?.length ?? 0;

  const latencySeries = useMemo(() => {
    const items = (runsData?.recent_runs ?? []) as Array<Record<string, unknown>>;
    const stamped = items.map((r) => ({
      created_at: typeof r.created_at === "string" ? r.created_at : null,
      latency_ms:
        typeof r.latency_ms === "number" && Number.isFinite(r.latency_ms)
          ? (r.latency_ms as number)
          : null,
    }));
    const series = timeBuckets(stamped, 24, (r) => r.latency_ms).filter((v) => v > 0);
    return series;
  }, [runsData]);

  const volumeSeries = useMemo(() => {
    const items = (runsData?.recent_runs ?? []) as Array<Record<string, unknown>>;
    const stamped = items.map((r) => ({
      created_at: typeof r.created_at === "string" ? r.created_at : null,
    }));
    return timeBuckets(stamped, 24);
  }, [runsData]);

  const evalSeries = useMemo(() => {
    const trend = summary.quality.eval_trend ?? [];
    if (trend.length === 0) return [];
    return timeBuckets(trend, Math.min(24, Math.max(2, trend.length)), (r) => r.aggregate).filter(
      (v) => Number.isFinite(v)
    );
  }, [summary.quality.eval_trend]);

  const p50 =
    costs?.latency_p50_ms != null ? `${costs.latency_p50_ms.toLocaleString()}ms` : "—";
  const p95Trend =
    costs?.latency_p95_ms != null ? `p95 ${costs.latency_p95_ms.toLocaleString()}ms` : "p95 —";

  const costValue = costs != null ? formatCostUsd(costs.total_cost_usd) : "—";
  const costTrend =
    costs?.runs_scanned != null
      ? `${costs.runs_scanned.toLocaleString()} runs scanned`
      : "last 100 runs";

  const evalPass =
    summary.quality.eval_pass_rate != null
      ? `${Math.round(summary.quality.eval_pass_rate * 100)}%`
      : "—";

  const runVolume = summary.run_count.toLocaleString();

  const schedulerLabel = summary.scheduler
    ? `Scheduler ${summary.scheduler.running ? "running" : "stopped"}` +
      (summary.scheduled_workflow_count > 0
        ? ` · ${summary.scheduled_workflow_count} scheduled ${
            summary.scheduled_workflow_count === 1 ? "workflow" : "workflows"
          }`
        : "")
    : "Scheduler unavailable";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Latency p50"
          value={<span className="font-mono tabular-nums">{p50}</span>}
          trend={p95Trend}
          chart={
            runSampleCount >= 2 && latencySeries.length >= 2 ? (
              <Sparkline
                data={latencySeries}
                label="Latency trend over the last 100 runs"
                className="text-warning"
                showLastDot
              />
            ) : undefined
          }
        />
        <StatCard
          label="Cost total"
          value={<span className="font-mono tabular-nums">{costValue}</span>}
          trend={costTrend}
        />
        <StatCard
          label="Run volume"
          value={<span className="font-mono tabular-nums">{runVolume}</span>}
          trend="all runs recorded"
          chart={
            runSampleCount >= 2 && volumeSeries.length >= 2 ? (
              <Sparkline
                data={volumeSeries}
                label="Run volume over the last 100 runs"
                className="text-muted"
                fill
              />
            ) : undefined
          }
        />
        <StatCard
          label="Active runs"
          value={
            <span className="font-mono tabular-nums">
              {summary.active_runs}/{summary.max_concurrent_runs}
            </span>
          }
          trend={`${summary.quality.guardrail_stats.blocked_runs} blocked`}
        />
        <StatCard
          label="Eval pass rate"
          value={<span className="font-mono tabular-nums">{evalPass}</span>}
          trend="last 100 runs"
          chart={
            (summary.quality.eval_trend?.length ?? 0) >= 2 && evalSeries.length >= 2 ? (
              <Sparkline
                data={evalSeries}
                label="Eval score trend over recent runs"
                className="text-success"
                showLastDot
              />
            ) : undefined
          }
        />
      </div>
      <p className="font-mono text-2xs tabular-nums text-subtle">{schedulerLabel}</p>
    </div>
  );
}
