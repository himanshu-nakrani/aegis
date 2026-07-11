"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  isTerminalObservabilityEvent,
  useObservabilityStream,
} from "@/providers/ObservabilityStreamProvider";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Brain,
  LayoutTemplate,
  Radio,
  Shield,
  ShieldAlert,
  Star,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { EvalTrendChart } from "@/components/results/EvalTrendChart";
import { TraceIdBadge } from "@/components/observability/TraceIdBadge";
import { VirtualList } from "@/components/ui/virtual-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { OperationsPanel } from "@/components/observability/OperationsPanel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { pluralize } from "@/lib/format";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
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

type RecentRun = ObservabilitySummary["recent_runs"][number];

const ObservabilityRunRow = memo(function ObservabilityRunRow({
  run,
  traceUiBase,
}: {
  run: RecentRun;
  traceUiBase: string | null;
}) {
  const evalPassed = run.eval_passed;
  return (
    <ListRow
      href={`/runs/${run.run_id}`}
      className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)_auto] sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-input shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              run.status === "completed"
                ? "bg-success"
                : run.status === "failed"
                  ? "bg-destructive"
                  : run.status === "running"
                    ? "bg-warning"
                    : "bg-muted"
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {run.workflow_name || "Workflow"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
            <time
              className="text-xs text-muted"
              dateTime={run.created_at}
              title={formatFullTimestamp(run.created_at)}
            >
              {formatRelativeTime(run.created_at)}
            </time>
          </div>
        </div>
      </div>
      <div className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex">
        {run.trace_id && <TraceIdBadge traceId={run.trace_id} uiBaseUrl={traceUiBase} compact />}
        {run.guardrail_blocked && <Badge variant="destructive">guardrail blocked</Badge>}
        {run.eval_aggregate != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-accent">Eval {run.eval_aggregate.toFixed(2)}</span>
            {evalPassed === true && <Badge variant="success">pass</Badge>}
            {evalPassed === false && <Badge variant="destructive">fail</Badge>}
          </div>
        )}
      </div>
      <span className="text-right font-mono text-xs text-muted">
        {run.latency_ms != null ? `${run.latency_ms} ms` : "—"}
      </span>
    </ListRow>
  );
});

export default function ObservabilityPage() {
  const { connected, subscribe } = useObservabilityStream();
  const queryClient = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [regressionAlerts, setRegressionAlerts] = useState<RegressionAlert[]>([]);
  const [runSearch, setRunSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RecentRun[] | null>(null);

  useEffect(() => {
    const q = runSearch.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .searchObservabilityRuns(q)
        .then((data) => setSearchResults(data.recent_runs as unknown as RecentRun[]))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  const {
    data: summary,
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.observabilitySummary("observability"),
    queryFn: api.getObservabilitySummary,
  });

  const refreshSummary = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.observabilitySummary("observability"),
    });
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

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
        queryKeys.observabilitySummary("observability"),
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

  if (isError) {
    return (
      <div className="page-container">
        <ApiConnectionState
          description="Observability data could not be loaded. Check the API target, then retry."
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="page-container">
        <EmptyState
          icon={Activity}
          title="Couldn't load observability"
          description="Check your connection and try refreshing the page."
          action={
            <Button variant="outline" onClick={refreshSummary}>
              Retry
            </Button>
          }
        />
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
          {regressionAlerts.slice(0, 5).map((alert) => (
            <Alert
              key={alert.id}
              variant="warning"
              icon={ShieldAlert}
              title={`Eval regression — ${alert.workflow_name}`}
              description={alert.message}
              onDismiss={() =>
                setRegressionAlerts((current) => current.filter((row) => row.id !== alert.id))
              }
              actions={
                <>
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
                </>
              }
            />
          ))}
        </div>
      )}

      <PageHeader
        title="Observability"
        description="Run metrics, evaluation quality, guardrail health, and workflow performance."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Workflows
            </Link>
          </Button>
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

      <div
        className="section-block grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "40ms" }}
      >
        <StatCard label="Workflows" value={summary.workflow_count} icon={LayoutTemplate} />
        <StatCard label="Recent Runs" value={summary.run_count} icon={Activity} />
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

      <div
        className="section-block grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "80ms" }}
      >
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

      <OperationsPanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="overflow-hidden p-0">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle as="h2" className="text-base">Evaluation quality</CardTitle>
              <Badge variant="outline">{quality.eval_run_count} eval runs</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm text-muted">
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
              <EmptyState
                compact
                icon={Activity}
                title="No evaluation scores yet"
                description="Add an Evaluation node to a workflow and run it. Scores will appear here once recorded."
              />
            )}
            <EvalTrendChart points={quality.eval_trend} />
          </CardContent>
        </GlassCard>

        <GlassCard className="overflow-hidden p-0">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle as="h2" className="text-base">Guardrail health</CardTitle>
              <Badge variant="outline">
                {quality.guardrail_stats.total_events} events
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface-input px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <p className="text-xs text-muted">Passed</p>
                <p className="text-xl font-semibold text-success">{quality.guardrail_stats.passed}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-input px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <p className="text-xs text-muted">Warned</p>
                <p className="text-xl font-semibold text-warning">{quality.guardrail_stats.warned}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-input px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <p className="text-xs text-muted">Failed</p>
                <p className="text-xl font-semibold text-destructive">{quality.guardrail_stats.failed}</p>
              </div>
            </div>
            <p className="text-sm text-muted">
              {pluralize(quality.guardrail_stats.blocked_runs, "run")} stopped by blocking
              guardrails.
            </p>

            {quality.workflow_eval_leaderboard.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Top workflows by eval
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {quality.workflow_eval_leaderboard.slice(0, 8).map((row) => (
                    <Link
                      key={row.workflow_id}
                      href={`/workflows/${row.workflow_id}`}
                      className="focus-ring flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-surface-hover"
                    >
                      <span className="truncate font-medium text-foreground">{row.workflow_name}</span>
                      <span className="shrink-0 text-accent">
                        {row.avg_eval_score.toFixed(2)} · {pluralize(row.run_count, "run")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle as="h2" className="text-base">Scheduler</CardTitle>
            <Badge variant={summary.scheduler.running ? "success" : "outline"}>
              {summary.scheduler.running ? "Running" : "Stopped"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-input p-3 text-sm text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <Badge variant="outline">
              {summary.scheduler.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <span>Poll every {summary.scheduler.poll_seconds}s</span>
            <Badge variant="outline">{summary.scheduled_workflow_count} scheduled flows</Badge>
          </div>

          {summary.scheduled_workflows.length > 0 ? (
            <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {summary.scheduled_workflows.slice(0, 50).map((item) => (
                <Link
                  key={item.workflow_id}
                  href={`/workflows/${item.workflow_id}`}
                  className="focus-ring flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.workflow_name}</p>
                    <code className="text-xs text-muted">{item.cron}</code>
                  </div>
                  <div className="text-xs text-muted">
                    {item.cron_valid ? (
                      <>
                        Next:{" "}
                        {item.next_run_at ? (
                          <time
                            dateTime={item.next_run_at}
                            title={formatFullTimestamp(item.next_run_at)}
                          >
                            {formatRelativeTime(item.next_run_at)}
                          </time>
                        ) : (
                          "—"
                        )}
                      </>
                    ) : (
                      <Badge variant="destructive">Invalid cron</Badge>
                    )}
                    {item.last_fired_at && (
                      <span className="mt-1 block sm:mt-0 sm:text-right">
                        Last:{" "}
                        <time
                          dateTime={item.last_fired_at}
                          title={formatFullTimestamp(item.last_fired_at)}
                        >
                          {formatRelativeTime(item.last_fired_at)}
                        </time>
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
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            Status breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(summary.status_counts).map(([status, count]) => (
            <Badge key={status} variant={runStatusVariant(status)}>
              {runStatusLabel(status)}: {count}
            </Badge>
          ))}
        </CardContent>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle as="h2">Recent runs</CardTitle>
              <p className="text-caption">
                {searchResults !== null
                  ? `${searchResults.length} matching`
                  : summary.recent_runs.length < summary.run_count
                    ? `${summary.recent_runs.length} of ${pluralize(summary.run_count, "run")}`
                    : pluralize(summary.run_count, "run")}
              </p>
            </div>
            <input
              value={runSearch}
              onChange={(e) => setRunSearch(e.target.value)}
              placeholder="Search inputs & outputs…"
              aria-label="Search runs"
              className="focus-ring h-8 w-64 rounded-md border border-border bg-surface-input px-3 text-xs text-foreground placeholder:text-subtle"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <VirtualList
            items={searchResults ?? summary.recent_runs}
            itemHeight={72}
            maxHeight={480}
            getItemKey={(run) => run.run_id}
            emptyState={
              <EmptyState
                compact
                icon={Activity}
                title="No recent runs"
                description="Execute a workflow to populate this feed."
              />
            }
            renderItem={(run) => (
              <ObservabilityRunRow run={run} traceUiBase={traceUiBase} />
            )}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
