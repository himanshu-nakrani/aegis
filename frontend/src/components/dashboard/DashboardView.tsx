"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    const message =
      (summaryQueryError instanceof Error ? summaryQueryError.message : null) ||
      (workflowsQueryError instanceof Error ? workflowsQueryError.message : null) ||
      "Failed to load dashboard";
    return (
      <div className="page-container">
        <EmptyState
          variant="error"
          title="Couldn't load dashboard"
          description={message}
          action={
            <Button
              variant="outline"
              onClick={() => {
                void refetchSummary();
                void refetchWorkflows();
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
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
      <div className="page-container space-y-8">
        <HeroGreeting
          meta={
            (workflowData?.length ?? 0) > 0
              ? `${workflowData!.length} ${workflowData!.length === 1 ? "workflow" : "workflows"} in your workspace`
              : "Create your first workflow to get started"
          }
          lastWorkflowId={lastWorkflowId}
        />

        <StaggerList className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            eyebrow="TOTAL RUNS"
            value={<NumberTween value={totalRuns} />}
          />
          <StatCard
            variant="highlight"
            eyebrow="PASS RATE"
            value={passRateNode}
          />
          <StatCard
            eyebrow="AVG LATENCY"
            value={<NumberTween value={avgLatency} suffix="ms" />}
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
            footer={<LiveDot connected={sseConnected} />}
          />
        </StaggerList>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GlassCard className="order-2 p-5 lg:order-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-micro">WORKFLOWS</span>
              <Button asChild size="sm" variant="outline">
                <Link href="/workflows/new">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New
                </Link>
              </Button>
            </div>
            {(workflowData?.length ?? 0) > 0 && (
              <div className="relative mb-4">
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
                title="No workflows yet"
                description="Create your first workflow on the visual canvas."
                action={
                  <Link href="/workflows/new">
                    <Button size="sm">Create workflow</Button>
                  </Link>
                }
              />
            ) : filteredWorkflows.length === 0 ? (
              <EmptyState
                compact
                title="No matching workflows"
                description="Try a different search term."
                action={
                  <Button size="sm" variant="outline" onClick={() => setWorkflowSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <StaggerList className="space-y-3">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ))}
              </StaggerList>
            )}
            {(workflowData?.length ?? 0) > 6 && (
              <Link
                href="/workflows"
                className="mt-4 block text-sm font-medium text-primary hover:underline"
              >
                View all {pluralize(workflowData!.length, "workflow")} →
              </Link>
            )}
          </GlassCard>

          <GlassCard className="order-1 p-5 lg:order-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-micro">RECENT RUNS</span>
              <LiveDot connected={sseConnected} />
            </div>
            {runs.length === 0 ? (
              <EmptyState
                compact
                title="No runs yet"
                description="Execute a workflow to see activity here."
                action={
                  <Link href="/workflows/new">
                    <Button size="sm">Create workflow</Button>
                  </Link>
                }
              />
            ) : (
              <StaggerList className="space-y-1">
                {runs.map((run) => (
                  <RecentRunRow key={run.id} run={run} />
                ))}
              </StaggerList>
            )}
            {(observability?.run_count ?? runs.length) > 8 && (
              <Link
                href="/observability"
                className="mt-4 block text-sm font-medium text-primary hover:underline"
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