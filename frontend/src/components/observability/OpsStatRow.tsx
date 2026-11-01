"use client";

import { formatCostUsd, formatDurationMs } from "@/lib/format";
import type { ObservabilityCosts } from "@/types/workflow";

type SummaryLike = {
  run_count: number;
  active_runs: number;
  max_concurrent_runs: number;
  scheduler?: { enabled: boolean; running: boolean; poll_seconds: number } | null;
  scheduled_workflow_count: number;
  quality: {
    eval_pass_rate: number | null;
    /** Scored runs and verdict counts — a rate of null with scored runs means
     *  no pass/fail thresholds are configured, not missing data. */
    eval_run_count?: number;
    eval_pass_count?: number;
    eval_fail_count?: number;
    eval_trend: Array<{ created_at: string; aggregate: number }>;
    guardrail_stats: { blocked_runs: number };
  };
};

interface OpsStatRowProps {
  summary: SummaryLike;
  costs?: ObservabilityCosts;
}

export function OpsStatRow({ summary, costs }: OpsStatRowProps) {
  const quality = summary.quality;
  const verdicts = (quality.eval_pass_count ?? 0) + (quality.eval_fail_count ?? 0);
  const evalDetail = verdicts > 0
    ? `${quality.eval_pass_count ?? 0} of ${verdicts} passed`
    : (quality.eval_run_count ?? 0) > 0 ? `${quality.eval_run_count} scored · no thresholds` : "No evaluated runs";
  const metrics = [
    { label: "Total runs", value: summary.run_count.toLocaleString(), detail: "All time" },
    { label: "Active", value: summary.active_runs.toLocaleString(), detail: `${summary.max_concurrent_runs} concurrent limit` },
    { label: "Latency p50", value: formatDurationMs(costs?.latency_p50_ms), detail: `p95 ${formatDurationMs(costs?.latency_p95_ms)} · last 100 runs` },
    { label: "Cost", value: costs ? formatCostUsd(costs.total_cost_usd) : "—", detail: costs ? `Last ${costs.runs_scanned.toLocaleString()} runs` : "Cost sample unavailable" },
    { label: "Eval pass rate", value: quality.eval_pass_rate == null ? "—" : `${Math.round(quality.eval_pass_rate * 100)}%`, detail: evalDetail },
  ];
  return (
    <section aria-label="Run metrics" className="border-y border-border py-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map(({ label, value, detail }) => (
          <div key={label} className="min-w-0 lg:border-l lg:border-border lg:pl-5 lg:first:border-0 lg:first:pl-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-2 font-mono text-title tabular-nums text-foreground">{value}</dd>
            <dd className="mt-1 text-2xs text-subtle">{detail}</dd>
          </div>
        ))}
      </dl>
      {(!summary.scheduler?.running || summary.scheduled_workflow_count > 0) && (
        <p className="mt-5 border-t border-border pt-3 text-xs text-subtle">
          {summary.scheduler ? `Scheduler ${summary.scheduler.running ? "running" : "stopped"}` : "Scheduler unavailable"}
          {summary.scheduled_workflow_count > 0 && ` · ${summary.scheduled_workflow_count} scheduled ${summary.scheduled_workflow_count === 1 ? "workflow" : "workflows"}`}
        </p>
      )}
    </section>
  );
}
