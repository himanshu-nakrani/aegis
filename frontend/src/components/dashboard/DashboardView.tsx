"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { HeroGreeting } from "@/components/dashboard/HeroGreeting";
import { LiveDot } from "@/components/dashboard/LiveDot";
import { RecentRunRow } from "@/components/dashboard/RecentRunRow";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatCard } from "@/components/dashboard/StatCard";

import { WorkflowCard } from "@/components/dashboard/WorkflowCard";
import { NumberTween, PageEnter, StaggerList } from "@/components/motion";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { pluralize } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format-date";
import { useObservabilityStream } from "@/providers/ObservabilityStreamProvider";
type DashboardRun = {
  id: string;
  workflow_name: string | null;
  status: "completed" | "failed" | "running" | "cancelled" | "pending" | "awaiting_approval";
  duration_ms?: number | null;
  created_at: string;
};

function summaryRunToDashboardRun(run: {
  run_id: string;
  workflow_name?: string | null;
  status: string;
  created_at: string;
  latency_ms?: number | null;
}): DashboardRun {
  return {
    id: run.run_id,
    workflow_name: run.workflow_name ?? null,
    status: run.status as DashboardRun["status"],
    duration_ms: run.latency_ms ?? null,
    created_at: run.created_at,
  };
}

function RelativeTimeLabel({ ts }: { ts?: string | null }) {
  if (!ts) return <span>—</span>;
  return <span>{formatRelativeTime(ts)}</span>;
}

export function DashboardView() {
  const { subscribe, connected: sseConnected } = useObservabilityStream();
  const [runs, setRuns] = useState<DashboardRun[]>([]);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const {
    data: observability,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryQueryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.observabilitySummary("dashboard"),
    queryFn: api.getObservabilitySummary,
  });
  const {
    data: workflowData,
    isLoading: workflowsLoading,
    isError: workflowsError,
    error: workflowsQueryError,
    refetch: refetchWorkflows,
  } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
  });

  const loading = summaryLoading || workflowsLoading;
  const queryError = summaryError || workflowsError;

  const lastWorkflowId = useMemo(() => {
    const list = workflowData ?? [];
    if (!list.length) return null;
    return [...list].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0]?.id;
  }, [workflowData]);

  const filteredWorkflows = useMemo(() => {
    const workflows = workflowData ?? [];
    const query = workflowSearch.trim().toLowerCase();
    const filtered = workflows.filter((workflow) => {
      if (!query) return true;
      return (
        workflow.name.toLowerCase().includes(query) ||
        (workflow.description || "").toLowerCase().includes(query)
      );
    });
    return [...filtered]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6);
  }, [workflowData, workflowSearch]);

  const patchRunFromEvent = useCallback((event: Record<string, unknown>) => {
    if (event.type === "heartbeat" || !event.run_id) return;
    const runId = String(event.run_id);
    setRuns((prev) => {
      const existing = prev.find((run) => run.id === runId);
      const status = String(event.status || existing?.status || "running") as DashboardRun["status"];
      const workflowName = String(event.workflow_name || existing?.workflow_name || "Workflow");
      const next: DashboardRun = {
        id: runId,
        workflow_name: workflowName,
        status,
        duration_ms:
          (event.latency_ms as number | null | undefined) ?? existing?.duration_ms ?? null,
        created_at: String(event.created_at || existing?.created_at || new Date().toISOString()),
      };
      const statusLabel =
        status === "running"
          ? "started"
          : status === "completed"
            ? "completed"
            : status === "failed"
              ? "failed"
              : status;
      queueMicrotask(() => setLiveAnnouncement(`${workflowName} run ${statusLabel}`));
      return [next, ...prev.filter((run) => run.id !== runId)].slice(0, 8);
    });
  }, []);

  useEffect(() => {
    return subscribe(patchRunFromEvent);
  }, [subscribe, patchRunFromEvent]);

  useEffect(() => {
    if (!observability) return;
    setRuns(observability.recent_runs.map(summaryRunToDashboardRun).slice(0, 8));
  }, [observability]);

  const totalRuns = observability?.run_count ?? 0;
  const passRate =
    observability?.quality.eval_pass_rate != null
      ? Math.round(observability.quality.eval_pass_rate * 100)
      : null;
  const avgLatency = observability?.avg_latency_ms ?? 0;
  const lastRunAt = observability?.recent_runs[0]?.created_at ?? null;

  const passRateNode =
    passRate != null ? (
      passRate >= 80 ? (
        <span className="text-gradient-primary">{passRate}%</span>
      ) : (
        <span>{passRate}%</span>
      )
    ) : (
      <span>—</span>
    );

  const sparkData = useMemo(() => {
    const latencies = (observability?.recent_runs ?? [])
      .map((run) => run.latency_ms)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0)
      .reverse();
    return latencies.length >= 2 ? latencies : [];
  }, [observability?.recent_runs]);

  if (loading) {
    return <LoadingState label="Loading workspace…" />;
  }

  if (queryError) {
    return (
      <PageEnter>
        <div className="page-container space-y-6">
          <ApiConnectionState
            description="Dashboard queries are pointed at the backend below. Start it on that address, then retry."
            error={summaryQueryError || workflowsQueryError}
            onRetry={() => {
              void refetchSummary();
              void refetchWorkflows();
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Runs", "Pass rate", "Latency", "Last run"].map((label) => (
              <GlassCard key={label} className="min-h-28 p-5">
                <div className="text-micro">{label}</div>
                <div className="skeleton mt-6 h-8 w-20" />
                <div className="skeleton mt-4 h-3 w-28" />
              </GlassCard>
            ))}
          </div>
        </div>
      </PageEnter>
    );
  }

  return (
    <PageEnter>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement ||
          (runs.length > 0
            ? `${runs.length} recent ${runs.length === 1 ? "run" : "runs"}. Latest status: ${runs[0]?.status ?? "unknown"}.`
            : "No recent runs.")}
      </p>
      <div className="page-container space-y-6">
        <HeroGreeting
          meta={
            (workflowData?.length ?? 0) > 0
              ? `${workflowData!.length} ${workflowData!.length === 1 ? "workflow" : "workflows"} in your workspace`
              : "Create your first workflow to get started"
          }
          lastWorkflowId={lastWorkflowId}
        />

        <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            eyebrow="TOTAL RUNS"
            value={<NumberTween value={totalRuns} />}
            icon={Activity}
          />
          <StatCard
            variant="highlight"
            eyebrow="PASS RATE"
            value={passRateNode}
            icon={CheckCircle2}
          />
          <StatCard
            eyebrow="AVG LATENCY"
            value={<NumberTween value={avgLatency} suffix="ms" />}
            icon={BarChart3}
            footer={
              sparkData.length >= 2 ? (
                <Sparkline data={sparkData} />
              ) : (
                <span className="text-xs text-muted">No 14d trend</span>
              )
            }
          />
          <StatCard
            eyebrow="LAST RUN"
            value={<RelativeTimeLabel ts={lastRunAt} />}
            icon={Clock3}
            footer={<LiveDot connected={sseConnected} />}
          />
        </StaggerList>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <GlassCard className="order-2 overflow-hidden p-0 lg:order-1">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-heading">Workflows</h2>
                <p className="text-caption">
                  {pluralize(workflowData?.length ?? 0, "workflow")}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/workflows/new">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New
                </Link>
              </Button>
            </div>
            {(workflowData?.length ?? 0) > 0 && (
              <div className="relative mx-4 mt-4 w-auto sm:mx-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={workflowSearch}
                  onChange={(e) => setWorkflowSearch(e.target.value)}
                  placeholder="Search workflows"
                  className="pl-9"
                  aria-label="Search workflows"
                />
              </div>
            )}
            {(workflowData?.length ?? 0) === 0 ? (
              <EmptyState
                compact
                className="m-4 sm:m-5"
                title="No workflows yet"
                description="Create your first workflow on the visual canvas."
                action={
                  <Button asChild size="sm">
                    <Link href="/workflows/new">Create workflow</Link>
                  </Button>
                }
              />
            ) : filteredWorkflows.length === 0 ? (
              <EmptyState
                compact
                className="m-4 sm:m-5"
                title="No matching workflows"
                description="Try a different search term."
                action={
                  <Button size="sm" variant="outline" onClick={() => setWorkflowSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <StaggerList className="space-y-2 p-4 sm:p-5">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ))}
              </StaggerList>
            )}
            {(workflowData?.length ?? 0) > 6 && (
              <Link
                href="/workflows"
                className="block border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-surface-hover sm:px-5"
              >
                View all {pluralize(workflowData!.length, "workflow")} →
              </Link>
            )}
          </GlassCard>

          <GlassCard className="order-1 overflow-hidden p-0 lg:order-2">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-heading">Recent runs</h2>
                <p className="text-caption">{pluralize(runs.length, "run")} loaded</p>
              </div>
              <LiveDot connected={sseConnected} />
            </div>
            {runs.length === 0 ? (
              <EmptyState
                compact
                className="m-4 sm:m-5"
                title="No runs yet"
                description="Execute a workflow to see activity here."
                action={
                  <Button asChild size="sm">
                    <Link href="/workflows/new">Create workflow</Link>
                  </Button>
                }
              />
            ) : (
              <StaggerList className="p-2 sm:p-3">
                {runs.map((run) => (
                  <RecentRunRow key={run.id} run={run} />
                ))}
              </StaggerList>
            )}
            {(observability?.run_count ?? runs.length) > 8 && (
              <Link
                href="/observability"
                className="block border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-surface-hover sm:px-5"
              >
                View all {pluralize(observability?.run_count ?? runs.length, "run")} →
              </Link>
            )}
          </GlassCard>
        </div>
      </div>
    </PageEnter>
  );
}
