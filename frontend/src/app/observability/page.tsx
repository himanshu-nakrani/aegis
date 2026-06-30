"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTerminalObservabilityEvent,
  useObservabilityStream,
} from "@/providers/ObservabilityStreamProvider";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Brain,
  Radio,
  Shield,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { EvalTrendChart } from "@/components/results/EvalTrendChart";
import { TraceIdBadge } from "@/components/observability/TraceIdBadge";
import { VirtualList } from "@/components/ui/virtual-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";

type ObservabilitySummary = Awaited<ReturnType<typeof api.getObservabilitySummary>>;

type RegressionAlert = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  run_id: string;
  message: string;
  latest_score?: number;
  baseline_score?: number;
  delta?: number;
};

function patchRecentRun(
  summary: ObservabilitySummary,
  event: Record<string, unknown>
): ObservabilitySummary {
  const runId = String(event.run_id);
  const nextRun = {
    run_id: runId,
    workflow_id: (event.workflow_id as string | null | undefined) ?? null,
    workflow_name: (event.workflow_name as string | null | undefined) ?? null,
    status: String(event.status || "running"),
    created_at: String(event.created_at || new Date().toISOString()),
    eval_aggregate:
      typeof event.eval_aggregate === "number" ? event.eval_aggregate : null,
    eval_passed: typeof event.eval_passed === "boolean" ? event.eval_passed : null,
    latency_ms: null,
    guardrail_blocked: Boolean(event.guardrail_blocked),
    guardrail_warn_count: 0,
    guardrail_fail_count: 0,
    trace_id: typeof event.trace_id === "string" ? event.trace_id : null,
  };

  const recentRuns = [
    nextRun,
    ...summary.recent_runs.filter((row) => row.run_id !== runId),
  ].slice(0, 20);

  const statusCounts = { ...summary.status_counts };
  const previous = summary.recent_runs.find((row) => row.run_id === runId);
  if (previous && previous.status !== nextRun.status) {
    statusCounts[previous.status] = Math.max(0, (statusCounts[previous.status] || 0) - 1);
    statusCounts[nextRun.status] = (statusCounts[nextRun.status] || 0) + 1;
  } else if (!previous) {
    statusCounts[nextRun.status] = (statusCounts[nextRun.status] || 0) + 1;
  }

  const activeRuns =
    event.type === "run_started"
      ? summary.active_runs + (previous ? 0 : 1)
      : ["run_completed", "run_failed", "run_cancelled"].includes(String(event.type))
        ? Math.max(0, summary.active_runs - 1)
        : summary.active_runs;

  return {
    ...summary,
    recent_runs: recentRuns,
    status_counts: statusCounts,
    active_runs: activeRuns,
  };
}

export default function ObservabilityPage() {
  const { connected, subscribe } = useObservabilityStream();
  const queryClient = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [regressionAlerts, setRegressionAlerts] = useState<RegressionAlert[]>([]);

  const { data: summary, isLoading: loading } = useQuery({
    queryKey: ["observability-summary"],
    queryFn: api.getObservabilitySummary,
  });

  const refreshSummary = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["observability-summary"] });
  }, [queryClient]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "heartbeat") return;

      if (event.type === "eval_regression") {
        const regression = (event.regression || {}) as Record<string, unknown>;
        const runId = String(event.run_id || "");
        setRegressionAlerts((current) => {
          const next: RegressionAlert = {
            id: runId || `${event.workflow_id}-${Date.now()}`,
            workflow_id: String(event.workflow_id || ""),
            workflow_name: String(event.workflow_name || "Workflow"),
            run_id: runId,
            message: String(regression.message || "Eval score dropped below recent average"),
            latest_score:
              typeof regression.latest_score === "number" ? regression.latest_score : undefined,
            baseline_score:
              typeof regression.baseline_score === "number" ? regression.baseline_score : undefined,
            delta: typeof regression.delta === "number" ? regression.delta : undefined,
          };
          return [next, ...current.filter((row) => row.id !== next.id)].slice(0, 5);
        });
        refreshSummary();
      }

      queryClient.setQueryData<ObservabilitySummary | undefined>(
        ["observability-summary"],
        (current) => (current ? patchRecentRun(current, event) : current)
      );
      if (!isTerminalObservabilityEvent(event.type)) return;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(refreshSummary, 500);
    });
  }, [subscribe, queryClient, refreshSummary]);

  if (loading) {
    return <LoadingState label="Loading observability…" />;
  }

  if (!summary) {
    return (
      <div className="page-container">
        <p className="text-muted">Failed to load observability data.</p>
      </div>
    );
  }

  const quality = summary.quality;
  const dimensionScores = {
    faithfulness: quality.avg_dimension_scores.faithfulness,
    helpfulness: quality.avg_dimension_scores.helpfulness,
    relevance: quality.avg_dimension_scores.relevance,
    toxicity: quality.avg_dimension_scores.toxicity,
    aggregate_score: summary.avg_eval_score ?? undefined,
  };
  const traceUiBase = summary.tracing?.ui_base_url ?? null;

  return (
    <div className="page-container space-y-10">
      {regressionAlerts.length > 0 && (
        <div className="space-y-2">
          {regressionAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
            >
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Eval regression — {alert.workflow_name}
                </p>
                <p className="text-sm text-muted">{alert.message}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {alert.run_id && (
                    <Link href={`/runs/${alert.run_id}`} className="text-primary hover:underline">
                      View run
                    </Link>
                  )}
                  {alert.workflow_id && (
                    <Link
                      href={`/workflows/${alert.workflow_id}`}
                      className="text-primary hover:underline"
                    >
                      Open workflow
                    </Link>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() =>
                  setRegressionAlerts((current) => current.filter((row) => row.id !== alert.id))
                }
                className="shrink-0 rounded-md p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <PageHeader
        title="Observability"
        description="Run metrics, evaluation quality, guardrail health, and workflow performance."
        back={
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {connected && (
              <Badge variant="success" className="gap-1">
                <Radio className="h-3 w-3" />
                Live
              </Badge>
            )}
            {summary.tracing?.enabled && (
              <Badge variant="outline">OpenTelemetry enabled</Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Workflows" value={summary.workflow_count} />
        <StatCard label="Recent Runs" value={summary.run_count} />
        <StatCard
          label="Avg Eval"
          value={summary.avg_eval_score?.toFixed(2) ?? "—"}
          icon={Star}
        />
        <StatCard
          label="Eval Pass Rate"
          value={
            quality.eval_pass_rate != null
              ? `${Math.round(quality.eval_pass_rate * 100)}%`
              : "—"
          }
          icon={Shield}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="KB Documents" value={summary.knowledge_doc_count} icon={BookOpen} />
        <StatCard label="Memory Entries" value={summary.memory_entry_count} icon={Brain} />
        <StatCard
          label="Guardrail Blocks"
          value={quality.guardrail_stats.blocked_runs}
          icon={ShieldAlert}
        />
        <StatCard
          label="Active Runs"
          value={`${summary.active_runs}/${summary.max_concurrent_runs}`}
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluation quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm text-muted">
              <Badge variant="outline">{quality.eval_run_count} eval runs</Badge>
              {quality.eval_pass_count > 0 && (
                <Badge variant="success">{quality.eval_pass_count} passed</Badge>
              )}
              {quality.eval_fail_count > 0 && (
                <Badge variant="destructive">{quality.eval_fail_count} below threshold</Badge>
              )}
            </div>
            {summary.avg_eval_score != null ? (
              <EvalScoresChart scores={dimensionScores} compact />
            ) : (
              <p className="text-sm text-muted">No evaluation scores recorded yet.</p>
            )}
            <EvalTrendChart points={quality.eval_trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardrail health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center">
                <p className="text-xs text-muted">Passed</p>
                <p className="text-xl font-semibold text-success">{quality.guardrail_stats.passed}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center">
                <p className="text-xs text-muted">Warned</p>
                <p className="text-xl font-semibold text-warning">{quality.guardrail_stats.warned}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center">
                <p className="text-xs text-muted">Failed</p>
                <p className="text-xl font-semibold text-destructive">{quality.guardrail_stats.failed}</p>
              </div>
            </div>
            <p className="text-sm text-muted">
              {quality.guardrail_stats.blocked_runs} run
              {quality.guardrail_stats.blocked_runs === 1 ? "" : "s"} stopped by blocking guardrails.
            </p>

            {quality.workflow_eval_leaderboard.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Top workflows by eval
                </p>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {quality.workflow_eval_leaderboard.map((row) => (
                    <Link
                      key={row.workflow_id}
                      href={`/workflows/${row.workflow_id}`}
                      className="flex items-center justify-between px-3 py-2 text-sm transition hover:bg-surface-hover"
                    >
                      <span className="truncate font-medium text-foreground">{row.workflow_name}</span>
                      <span className="shrink-0 text-accent">
                        {row.avg_eval_score.toFixed(2)} · {row.run_count} runs
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            <Badge variant={summary.scheduler.running ? "success" : "outline"}>
              {summary.scheduler.running ? "Running" : "Stopped"}
            </Badge>
            <Badge variant="outline">
              {summary.scheduler.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <span>Poll every {summary.scheduler.poll_seconds}s</span>
            <Badge variant="outline">{summary.scheduled_workflow_count} scheduled flows</Badge>
          </div>

          {summary.scheduled_workflows.length > 0 ? (
            <div className="divide-y divide-border rounded-lg border border-border">
              {summary.scheduled_workflows.map((item) => (
                <Link
                  key={item.workflow_id}
                  href={`/workflows/${item.workflow_id}`}
                  className="flex flex-col gap-1 px-4 py-3 transition hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.workflow_name}</p>
                    <code className="text-xs text-muted">{item.cron}</code>
                  </div>
                  <div className="text-xs text-muted">
                    {item.cron_valid ? (
                      <>
                        Next:{" "}
                        {item.next_run_at
                          ? new Date(item.next_run_at).toLocaleString()
                          : "—"}
                      </>
                    ) : (
                      <Badge variant="destructive">Invalid cron</Badge>
                    )}
                    {item.last_fired_at && (
                      <span className="mt-1 block sm:mt-0 sm:text-right">
                        Last: {new Date(item.last_fired_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No workflows use a schedule trigger yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(summary.status_counts).map(([status, count]) => (
            <Badge key={status} variant={runStatusVariant(status)}>
              {runStatusLabel(status)}: {count}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <VirtualList
            items={summary.recent_runs}
            itemHeight={72}
            maxHeight={480}
            renderItem={(run) => (
              <Link
                href={`/runs/${run.run_id}`}
                className="group flex items-center gap-4 border-b border-border px-6 py-4 transition hover:bg-surface-hover/60"
              >
                <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {run.workflow_name || "Workflow"}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                {run.trace_id && (
                  <TraceIdBadge
                    traceId={run.trace_id}
                    uiBaseUrl={traceUiBase}
                    compact
                  />
                )}
                {run.guardrail_blocked && (
                  <Badge variant="destructive">guardrail blocked</Badge>
                )}
                {run.eval_aggregate != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-accent">Eval {run.eval_aggregate.toFixed(2)}</span>
                    {run.eval_passed === true && <Badge variant="success">pass</Badge>}
                    {run.eval_passed === false && <Badge variant="destructive">fail</Badge>}
                  </div>
                )}
                {run.latency_ms != null && (
                  <span className="text-sm text-muted">{run.latency_ms} ms</span>
                )}
              </Link>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}