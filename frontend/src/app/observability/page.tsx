"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isTerminalObservabilityEvent,
  useObservabilityStream,
} from "@/providers/ObservabilityStreamProvider";
import { Activity, CheckCircle2, Radio, Search } from "lucide-react";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { VirtualList } from "@/components/ui/virtual-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { formatCostUsd } from "@/lib/format";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel } from "@/lib/run-status";

type ObservabilitySummary = Awaited<ReturnType<typeof api.getObservabilitySummary>>;
type RecentRun = ObservabilitySummary["recent_runs"][number];
type StreamFilter = "failed" | "running";

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

type AttentionItem = {
  id: string;
  kind: "regression" | "failed" | "blocked" | "eval_fail" | "awaiting";
  title: string;
  detail: string;
  runId?: string;
  workflowId?: string;
  meta?: string;
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

function statusDotClass(status: string): string {
  if (status === "completed") return "bg-success";
  if (status === "failed" || status === "cancelled") return "bg-destructive";
  if (status === "running" || status === "pending" || status === "queued") return "bg-warning";
  if (status === "awaiting_approval") return "bg-accent";
  return "bg-muted";
}

function buildAttentionItems(
  regressions: RegressionAlert[],
  runs: RecentRun[]
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seenRuns = new Set<string>();

  for (const alert of regressions) {
    const delta =
      alert.delta != null
        ? `${alert.delta > 0 ? "+" : ""}${alert.delta.toFixed(2)}`
        : alert.latest_score != null
          ? alert.latest_score.toFixed(2)
          : undefined;
    items.push({
      id: `reg-${alert.id}`,
      kind: "regression",
      title: `Eval regression · ${alert.workflow_name}`,
      detail: alert.message,
      runId: alert.run_id || undefined,
      workflowId: alert.workflow_id || undefined,
      meta: delta,
    });
    if (alert.run_id) seenRuns.add(alert.run_id);
  }

  for (const run of runs) {
    if (seenRuns.has(run.run_id)) continue;

    if (run.status === "awaiting_approval") {
      items.push({
        id: `await-${run.run_id}`,
        kind: "awaiting",
        title: run.workflow_name || "Workflow",
        detail: "Awaiting human approval",
        runId: run.run_id,
        workflowId: run.workflow_id ?? undefined,
        meta: formatRelativeTime(run.created_at),
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (run.guardrail_blocked) {
      items.push({
        id: `block-${run.run_id}`,
        kind: "blocked",
        title: run.workflow_name || "Workflow",
        detail: "Blocked by guardrail",
        runId: run.run_id,
        workflowId: run.workflow_id ?? undefined,
        meta: formatRelativeTime(run.created_at),
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (run.status === "failed" || run.status === "cancelled") {
      items.push({
        id: `fail-${run.run_id}`,
        kind: "failed",
        title: run.workflow_name || "Workflow",
        detail: run.status === "cancelled" ? "Cancelled" : "Failed",
        runId: run.run_id,
        workflowId: run.workflow_id ?? undefined,
        meta: formatRelativeTime(run.created_at),
      });
      seenRuns.add(run.run_id);
      continue;
    }

    if (run.eval_passed === false) {
      items.push({
        id: `eval-${run.run_id}`,
        kind: "eval_fail",
        title: run.workflow_name || "Workflow",
        detail: "Eval below threshold",
        runId: run.run_id,
        workflowId: run.workflow_id ?? undefined,
        meta:
          run.eval_aggregate != null
            ? run.eval_aggregate.toFixed(2)
            : formatRelativeTime(run.created_at),
      });
      seenRuns.add(run.run_id);
    }
  }

  return items.slice(0, 12);
}

function kindLabel(kind: AttentionItem["kind"]): string {
  switch (kind) {
    case "regression":
      return "regression";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "eval_fail":
      return "eval";
    case "awaiting":
      return "approval";
  }
}

function kindClass(kind: AttentionItem["kind"]): string {
  switch (kind) {
    case "regression":
    case "eval_fail":
      return "text-warning";
    case "failed":
    case "blocked":
      return "text-destructive";
    case "awaiting":
      return "text-accent";
  }
}

const StreamRunRow = memo(function StreamRunRow({ run }: { run: RecentRun }) {
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
      <span className="hidden shrink-0 font-mono text-2xs text-subtle sm:inline">
        {run.run_id.slice(0, 8)}
      </span>
      <span className="shrink-0 font-mono text-2xs text-muted">
        {runStatusLabel(run.status)}
      </span>
      <time
        className="w-16 shrink-0 text-right font-mono text-2xs text-subtle"
        dateTime={run.created_at}
        title={formatFullTimestamp(run.created_at)}
      >
        {formatRelativeTime(run.created_at)}
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-border-strong bg-surface-hover text-foreground"
          : "border-transparent text-muted hover:border-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default function ObservabilityPage() {
  const { connected, subscribe } = useObservabilityStream();
  const queryClient = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [regressionAlerts, setRegressionAlerts] = useState<RegressionAlert[]>([]);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("failed");
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

  const { data: costs } = useQuery({
    queryKey: ["observability-costs"],
    queryFn: api.getObservabilityCosts,
    refetchInterval: 60_000,
  });

  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ["observability-errors"],
    queryFn: api.getObservabilityErrors,
    refetchInterval: 60_000,
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
          return [next, ...current.filter((row) => row.id !== next.id)].slice(0, 8);
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

  const attentionItems = useMemo(
    () => buildAttentionItems(regressionAlerts, summary?.recent_runs ?? []),
    [regressionAlerts, summary?.recent_runs]
  );

  const streamItems = useMemo(() => {
    const base = summary?.recent_runs ?? [];
    if (streamFilter === "running") {
      return base.filter((r) =>
        ["running", "pending", "queued", "awaiting_approval"].includes(r.status)
      );
    }
    // failed: hard failures + blocked + eval fail
    return base.filter(
      (r) =>
        r.status === "failed" ||
        r.status === "cancelled" ||
        r.guardrail_blocked ||
        r.eval_passed === false
    );
  }, [summary?.recent_runs, streamFilter]);

  const allRuns = useMemo(
    () => searchResults ?? summary?.recent_runs ?? [],
    [searchResults, summary?.recent_runs]
  );

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

  const clusters = errors?.clusters ?? [];
  const p50 =
    costs?.latency_p50_ms != null ? `${costs.latency_p50_ms}ms p50` : "— p50";
  const cost = formatCostUsd(costs?.total_cost_usd);
  const tokens =
    costs?.total_tokens != null ? `${costs.total_tokens.toLocaleString()} tok` : "— tok";
  const active = `${summary.active_runs}/${summary.max_concurrent_runs} active`;
  const evalPass =
    summary.quality.eval_pass_rate != null
      ? `${Math.round(summary.quality.eval_pass_rate * 100)}% pass`
      : "— pass";

  return (
    <div className="page-container space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-foreground sm:text-[32px] sm:leading-10">
              Observability
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-2xs",
                connected
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-surface-input text-muted"
              )}
            >
              <Radio className="h-3 w-3" aria-hidden />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Triage regressions, failures, and blocked runs — then open a run to dig in.
          </p>
        </div>
      </div>

      <p className="font-mono text-2xs text-subtle sm:text-xs">
        <span className="text-muted">{p50}</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <span className="text-muted">{cost}</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <span className="text-muted">{tokens}</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <span className="text-muted">{active}</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <span className="text-muted">{evalPass}</span>
        <span className="mx-1.5 text-border-strong">·</span>
        <span className="text-muted">
          {summary.quality.guardrail_stats.blocked_runs} blocked
        </span>
        {summary.scheduler && (
          <>
            <span className="mx-1.5 text-border-strong">·</span>
            <span className="text-muted">
              scheduler {summary.scheduler.running ? "on" : "off"}
              {summary.scheduled_workflow_count > 0
                ? ` · ${summary.scheduled_workflow_count} cron`
                : ""}
            </span>
          </>
        )}
      </p>

      {/* Needs attention */}
      <section
        className="rounded-lg border border-border bg-surface shadow-elev-1"
        aria-labelledby="needs-attention-heading"
      >
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="needs-attention-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Needs attention
          </h2>
          <span className="font-mono text-2xs text-muted tabular-nums">
            {attentionItems.length}
          </span>
        </header>
        {attentionItems.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            Nothing to triage in the recent window.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "font-mono text-2xs uppercase tracking-wide",
                          kindClass(item.kind)
                        )}
                      >
                        {kindLabel(item.kind)}
                      </span>
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{item.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {item.meta && (
                      <span className="font-mono text-2xs text-subtle">{item.meta}</span>
                    )}
                    {item.runId && (
                      <Link
                        href={`/runs/${item.runId}`}
                        className="focus-ring text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        View run
                      </Link>
                    )}
                    {item.workflowId && (
                      <Link
                        href={`/workflows/${item.workflowId}`}
                        className="focus-ring text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Workflow
                      </Link>
                    )}
                    {item.kind === "regression" && (
                      <button
                        type="button"
                        className="focus-ring text-xs text-subtle hover:text-muted"
                        onClick={() => {
                          const alertId = item.id.replace(/^reg-/, "");
                          setRegressionAlerts((cur) =>
                            cur.filter((a) => a.id !== alertId)
                          );
                        }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Failure clusters */}
      <section
        className="rounded-lg border border-border bg-surface shadow-elev-1"
        aria-labelledby="failure-clusters-heading"
      >
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="failure-clusters-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Failure clusters
          </h2>
          <span className="font-mono text-2xs text-muted">
            {errorsLoading
              ? "…"
              : `${errors?.failed_runs_scanned ?? 0} failed scanned`}
          </span>
        </header>
        {errorsLoading ? (
          <p className="px-4 py-6 text-sm text-muted">Loading clusters…</p>
        ) : clusters.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            No failure clusters in the recent window.
          </p>
        ) : (
          <ul className="grid gap-0 sm:grid-cols-2">
            {clusters.slice(0, 8).map((cluster) => (
              <li
                key={cluster.signature}
                className="border-b border-border sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
              >
                <Link
                  href={`/runs/${cluster.sample_run_id}`}
                  className="focus-ring flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className="shrink-0 font-mono text-xs font-semibold text-destructive tabular-nums">
                    {cluster.count}×
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-foreground">
                      {cluster.signature}
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-subtle">
                      {(cluster.workflows || []).slice(0, 3).join(", ")}
                      {cluster.last_seen
                        ? ` · ${formatRelativeTime(cluster.last_seen)}`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Triage stream */}
      <section
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-elev-1"
        aria-labelledby="stream-heading"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="stream-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Triage stream
          </h2>
          <div className="flex items-center gap-0.5" role="group" aria-label="Filter runs">
            <FilterChip
              active={streamFilter === "failed"}
              onClick={() => setStreamFilter("failed")}
            >
              Failed
            </FilterChip>
            <FilterChip
              active={streamFilter === "running"}
              onClick={() => setStreamFilter("running")}
            >
              Running
            </FilterChip>
          </div>
        </header>
        <VirtualList
          items={streamItems}
          itemHeight={48}
          maxHeight={320}
          getItemKey={(run) => run.run_id}
          emptyState={
            <EmptyState
              compact
              icon={Activity}
              title={streamFilter === "failed" ? "No failed runs" : "No running runs"}
              description={
                streamFilter === "failed"
                  ? "See All runs below for the full history."
                  : "No runs in progress right now."
              }
            />
          }
          renderItem={(run) => <StreamRunRow run={run} />}
        />
      </section>

      {/* All runs */}
      <section
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-elev-1"
        aria-labelledby="all-runs-heading"
      >
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <h2
              id="all-runs-heading"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              All runs
            </h2>
            <span className="font-mono text-2xs text-muted tabular-nums">
              {searchResults !== null
                ? `${allRuns.length} matching`
                : summary.recent_runs.length < summary.run_count
                  ? `${summary.recent_runs.length} of ${summary.run_count}`
                  : summary.recent_runs.length}
            </span>
          </div>
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={runSearch}
              onChange={(e) => setRunSearch(e.target.value)}
              placeholder="Search inputs…"
              aria-label="Search all runs"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </header>
        <VirtualList
          items={allRuns}
          itemHeight={48}
          maxHeight={480}
          getItemKey={(run) => run.run_id}
          emptyState={
            <EmptyState
              compact
              icon={Activity}
              title={searchResults !== null ? "No matching runs" : "No runs yet"}
              description={
                searchResults !== null
                  ? "Try a different search term."
                  : "Run a workflow to populate this list."
              }
            />
          }
          renderItem={(run) => <StreamRunRow run={run} />}
        />
      </section>
    </div>
  );
}
