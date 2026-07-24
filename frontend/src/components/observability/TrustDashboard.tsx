"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { Sparkline } from "@/components/ui/sparkline";
import { LoadingState } from "@/components/ui/loading-state";
import { FailureClusters } from "@/components/observability/FailureClusters";
import { ViolationBreakdown } from "@/components/observability/ViolationBreakdown";
import { formatCostUsd } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

/** Percentage label from a 0..1 rate. */
function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** ms → compact mono label. */
function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}

/** Higher-is-better tone (eval pass rate). */
function highTone(rate: number | null): string {
  if (rate == null) return "text-foreground";
  if (rate >= 0.9) return "text-success";
  if (rate >= 0.7) return "text-warning";
  return "text-destructive";
}

/** Lower-is-better tone (failure rate). */
function lowTone(rate: number | null, good: number, warn: number): string {
  if (rate == null) return "text-foreground";
  if (rate <= good) return "text-success";
  if (rate <= warn) return "text-warning";
  return "text-destructive";
}

/**
 * The unified Trust surface: quality + safety + cost + reliability on one
 * screen. Every SLO rate is read from a single consistent-window endpoint
 * (build_trust), so tiles never mix recent and all-time denominators. Chroma
 * stays data-only (eval pass / guardrail severity / failure); chrome stays mono.
 */
export function TrustDashboard() {
  const { data: trust, isLoading } = useQuery({
    queryKey: queryKeys.trustDashboard(""),
    queryFn: api.getObservabilityTrust,
    refetchInterval: 60_000,
  });

  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ["observability-errors"],
    queryFn: api.getObservabilityErrors,
    refetchInterval: 60_000,
  });

  if (isLoading || !trust) {
    return <LoadingState label="Loading trust metrics…" />;
  }

  const scanned = trust.runs_scanned;
  const g = trust.guardrail_events;
  const eventTotal = g.passed + g.warned + g.failed;
  const topCost = trust.top_workflows_by_cost ?? [];
  const windowLabel = `last ${scanned.toLocaleString()} runs`;

  return (
    <div className="space-y-5">
      {/* SLO tiles — all rates over the same recent-run window. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Eval pass rate"
          value={
            <span className={cn("font-mono tabular-nums", highTone(trust.eval_pass_rate))}>
              {pct(trust.eval_pass_rate)}
            </span>
          }
          trend={`${trust.eval_passed}/${trust.eval_evaluated} evaluated`}
          chart={
            trust.eval_trend.length >= 2 ? (
              <Sparkline
                data={trust.eval_trend}
                label="Eval score trend over recent runs"
                className="text-success"
                showLastDot
              />
            ) : undefined
          }
        />
        <StatCard
          label="Guardrail block rate"
          value={
            <span className="font-mono tabular-nums text-foreground">
              {pct(trust.guardrail_block_rate)}
            </span>
          }
          trend={`${trust.guardrail_blocked_runs} blocked · ${g.warned} warned`}
        />
        <StatCard
          label="Latency p99"
          value={
            <span className="font-mono tabular-nums text-foreground">
              {ms(trust.latency_p99_ms)}
            </span>
          }
          trend={`p95 ${ms(trust.latency_p95_ms)} · p50 ${ms(trust.latency_p50_ms)}`}
        />
        <StatCard
          label="Cost total"
          value={
            <span className="font-mono tabular-nums text-foreground">
              {formatCostUsd(trust.total_cost_usd)}
            </span>
          }
          trend={windowLabel}
        />
        <StatCard
          label="Failure rate"
          value={
            <span className={cn("font-mono tabular-nums", lowTone(trust.failure_rate, 0.02, 0.1))}>
              {pct(trust.failure_rate)}
            </span>
          }
          trend={`${trust.failed_runs} failed of ${scanned.toLocaleString()}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Quality pillar */}
        <SectionCard title="Quality" description={`LLM-judge evaluation · ${windowLabel}`}>
          <div className="space-y-4">
            <div className="flex items-baseline gap-4">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {pct(trust.eval_pass_rate)}
                </p>
                <p className="text-2xs text-muted">pass rate</p>
              </div>
              <div className="flex gap-3 font-mono text-2xs tabular-nums text-subtle">
                <span className="text-success">{trust.eval_passed} pass</span>
                <span className="text-destructive">
                  {trust.eval_evaluated - trust.eval_passed} fail
                </span>
                {trust.avg_eval != null && <span>avg {trust.avg_eval.toFixed(2)}</span>}
              </div>
            </div>
            {trust.eval_evaluated === 0 && (
              <p className="text-sm text-subtle">No evaluation scores in this window.</p>
            )}
          </div>
        </SectionCard>

        {/* Safety pillar */}
        <SectionCard
          title="Safety"
          description={`Guardrail verdicts · ${windowLabel}`}
          actions={<ShieldCheck className="h-4 w-4 text-muted" aria-hidden />}
        >
          <div className="space-y-4">
            <div className="flex items-baseline gap-4">
              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {g.total.toLocaleString()}
                </p>
                <p className="text-2xs text-muted">guardrail events</p>
              </div>
              <div className="font-mono text-2xs tabular-nums text-destructive">
                {trust.guardrail_blocked_runs} blocked runs
              </div>
            </div>
            {eventTotal > 0 ? (
              <div className="space-y-1.5">
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-input">
                  <span
                    className="bg-success/70"
                    style={{ width: `${(g.passed / eventTotal) * 100}%` }}
                  />
                  <span
                    className="bg-warning/70"
                    style={{ width: `${(g.warned / eventTotal) * 100}%` }}
                  />
                  <span
                    className="bg-destructive/70"
                    style={{ width: `${(g.failed / eventTotal) * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-3 font-mono text-2xs tabular-nums">
                  <span className="text-success">{g.passed} passed</span>
                  <span className="text-warning">{g.warned} warned</span>
                  <span className="text-destructive">{g.failed} failed</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-subtle">No guardrail events in this window.</p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Safety drill-down — guardrail violations by rail type + recent log. */}
      <ViolationBreakdown />

      {/* Reliability pillar — reuse the failure-clustering surface. */}
      <FailureClusters
        clusters={errors?.clusters ?? []}
        failedRunsScanned={errors?.failed_runs_scanned ?? 0}
        loading={errorsLoading}
      />

      {/* Cost & latency pillar */}
      <SectionCard
        title="Cost & latency"
        description={`Spend and speed · ${windowLabel}`}
        actions={
          <span className="font-mono text-2xs tabular-nums text-subtle">
            {scanned.toLocaleString()} runs
          </span>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-2xs text-muted">Total cost</p>
              <p className="font-mono text-lg tabular-nums text-foreground">
                {formatCostUsd(trust.total_cost_usd)}
              </p>
            </div>
            <div>
              <p className="text-2xs text-muted">Total tokens</p>
              <p className="font-mono text-lg tabular-nums text-foreground">
                {trust.total_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-2xs text-muted">Latency p95</p>
              <p className="font-mono text-lg tabular-nums text-foreground">
                {ms(trust.latency_p95_ms)}
              </p>
            </div>
            <div>
              <p className="text-2xs text-muted">Latency p99</p>
              <p className="font-mono text-lg tabular-nums text-foreground">
                {ms(trust.latency_p99_ms)}
              </p>
            </div>
          </div>
          {topCost.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {topCost.slice(0, 5).map((row) => (
                <li
                  key={row.workflow}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{row.workflow}</span>
                  <span className="flex shrink-0 items-center gap-3 font-mono text-2xs tabular-nums text-subtle">
                    <span>{row.runs} runs</span>
                    {row.failures > 0 && (
                      <span className="text-destructive">{row.failures} failed</span>
                    )}
                    <span className="text-foreground">{formatCostUsd(row.cost_usd)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <p className="text-2xs text-subtle">
        Drill into per-run traces from{" "}
        <Link href="/observability" className="underline-offset-4 hover:underline">
          any run
        </Link>{" "}
        to see eval scores and guardrail verdicts on the glass-box timeline.
      </p>
    </div>
  );
}
