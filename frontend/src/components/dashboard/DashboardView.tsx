"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Copy, LayoutTemplate, Plus, Shield, Star, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { ListRow } from "@/components/ui/list-row";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import { useObservabilityStream } from "@/providers/ObservabilityStreamProvider";
import type { RunListItem } from "@/types/workflow";

type RunQualityFilter = "all" | "eval_failed" | "guardrail_blocked" | "has_eval";

const RUN_FILTER_OPTIONS: { id: RunQualityFilter; label: string }[] = [
  { id: "all", label: "All runs" },
  { id: "eval_failed", label: "Eval failed" },
  { id: "guardrail_blocked", label: "Guardrail blocked" },
  { id: "has_eval", label: "Has eval" },
];

function summaryRunToListItem(run: {
  run_id: string;
  workflow_id?: string | null;
  workflow_name?: string | null;
  status: string;
  created_at: string;
  eval_aggregate?: number | null;
  eval_passed?: boolean | null;
  guardrail_blocked?: boolean;
  input_text?: string;
}): RunListItem {
  return {
    id: run.run_id,
    workflow_version_id: "",
    workflow_id: run.workflow_id ?? null,
    workflow_name: run.workflow_name ?? null,
    status: run.status,
    input_text: run.input_text || "",
    final_output: null,
    created_at: run.created_at,
    completed_at: null,
    eval_aggregate: run.eval_aggregate ?? null,
    eval_passed: run.eval_passed ?? null,
    guardrail_blocked: Boolean(run.guardrail_blocked),
  };
}

export function DashboardView() {
  const { subscribe } = useObservabilityStream();
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runFilter, setRunFilter] = useState<RunQualityFilter>("all");
  const { data: observability, isLoading: summaryLoading } = useQuery({
    queryKey: ["observability-summary"],
    queryFn: api.getObservabilitySummary,
  });
  const { data: workflowData, isLoading: workflowsLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
  });
  const { data: evalSnippetData } = useQuery({
    queryKey: ["eval-snippets"],
    queryFn: () => api.getEvalSnippets(3),
    enabled: Boolean(workflowData?.length),
  });
  const evalSnippets = evalSnippetData?.snippets ?? {};
  const loading = summaryLoading || workflowsLoading;
  const [runsLoading, setRunsLoading] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const workflows = workflowData ?? [];
  const qualitySummary = useMemo(() => {
    if (!observability) return null;
    return {
      evalPassRate: observability.quality.eval_pass_rate,
      guardrailBlocks: observability.quality.guardrail_stats.blocked_runs,
      avgEval: observability.avg_eval_score,
      activeRuns: observability.active_runs,
    };
  }, [observability]);

  const patchRunFromEvent = useCallback((event: Record<string, unknown>) => {
    if (event.type === "heartbeat" || !event.run_id) return;
    const runId = String(event.run_id);
    setRuns((prev) => {
      const existing = prev.find((run) => run.id === runId);
      const next: RunListItem = {
        id: runId,
        workflow_version_id: existing?.workflow_version_id || "",
        workflow_id: (event.workflow_id as string | undefined) ?? existing?.workflow_id ?? null,
        workflow_name: String(event.workflow_name || existing?.workflow_name || "Workflow"),
        status: String(event.status || existing?.status || "running"),
        input_text: String(event.input_text || existing?.input_text || ""),
        final_output: existing?.final_output ?? null,
        created_at: String(event.created_at || existing?.created_at || new Date().toISOString()),
        completed_at: existing?.completed_at ?? null,
        eval_aggregate:
          (event.eval_aggregate as number | null | undefined) ?? existing?.eval_aggregate ?? null,
        eval_passed:
          (event.eval_passed as boolean | null | undefined) ?? existing?.eval_passed ?? null,
        guardrail_blocked:
          (event.guardrail_blocked as boolean | undefined) ?? existing?.guardrail_blocked,
      };
      return [next, ...prev.filter((run) => run.id !== runId)].slice(0, 50);
    });
  }, []);

  useEffect(() => {
    return subscribe(patchRunFromEvent);
  }, [subscribe, patchRunFromEvent]);

  useEffect(() => {
    if (!observability || runFilter !== "all") return;
    setRuns(observability.recent_runs.map(summaryRunToListItem));
  }, [observability, runFilter]);

  useEffect(() => {
    if (runFilter === "all") return;
    setRunsLoading(true);
    const filters =
      runFilter === "eval_failed"
        ? { eval_passed: false }
        : runFilter === "guardrail_blocked"
          ? { guardrail_blocked: true }
          : runFilter === "has_eval"
            ? { has_eval: true }
            : undefined;

    api
      .listRuns(filters)
      .then(setRuns)
      .finally(() => setRunsLoading(false));
  }, [runFilter]);

  const handleDuplicate = async (workflowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDuplicatingId(workflowId);
    try {
      const copy = await api.duplicateWorkflow(workflowId);
      toast.success(`Duplicated as "${copy.name}"`);
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate");
    } finally {
      setDuplicatingId(null);
    }
  };

  if (loading) {
    return <LoadingState label="Loading workspace…" />;
  }

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Dashboard"
        description="Build agent workflows, run them against real inputs, and track quality with built-in evaluation."
        actions={
          <>
            <Link href="/templates">
              <Button variant="outline">
                <LayoutTemplate className="h-4 w-4" />
                Templates
              </Button>
            </Link>
            <Link href="/workflows/new">
              <Button>
                <Plus className="h-4 w-4" />
                New Workflow
              </Button>
            </Link>
          </>
        }
      />

      <div
        className="section-block grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "40ms" }}
      >
        <StatCard label="Workflows" value={workflows.length} icon={Workflow} />
        <StatCard
          label="Active Runs"
          value={`${qualitySummary?.activeRuns ?? 0}`}
          icon={Zap}
          trend="Live executions"
        />
        <StatCard
          label="Avg Eval"
          value={qualitySummary?.avgEval?.toFixed(2) ?? "—"}
          icon={Star}
        />
        <Link href="/observability" className="block">
          <StatCard
            label="Eval Pass Rate"
            value={
              qualitySummary?.evalPassRate != null
                ? `${Math.round(qualitySummary.evalPassRate * 100)}%`
                : "—"
            }
            icon={Shield}
            trend={`${qualitySummary?.guardrailBlocks ?? 0} guardrail blocks`}
          />
        </Link>
      </div>

      <section className="section-block space-y-4" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between">
          <h2 className="section-heading">Workflows</h2>
          <span className="text-sm text-muted">{workflows.length} total</span>
        </div>

        {workflows.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Workflow}
                title="Create your first workflow"
                description="Start from a template or build a custom agent pipeline on the visual canvas."
                action={
                  <Link href="/workflows/new">
                    <Button>Create workflow</Button>
                  </Link>
                }
                secondaryAction={
                  <Link href="/templates">
                    <Button variant="outline">Browse templates</Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow, index) => {
              const latestScore = evalSnippets[workflow.id]?.[0]?.scores?.aggregate_score;

              return (
                <div
                  key={workflow.id}
                  className="group relative stagger-item"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Link href={`/workflows/${workflow.id}`}>
                    <Card className="interactive-card h-full">
                      <CardHeader>
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
                            <Workflow className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="truncate text-base">{workflow.name}</CardTitle>
                            <CardDescription className="mt-1">
                              Version {workflow.latest_version_number ?? 1} · {workflow.version_count}{" "}
                              saved
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-sm text-muted">
                          {workflow.description || "No description provided"}
                        </p>
                        {latestScore != null && (
                          <Badge variant="accent" className="mt-3">
                            Eval {latestScore.toFixed(2)}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover-reveal absolute right-2 top-2 opacity-70 transition group-hover:opacity-100 sm:opacity-0"
                    onClick={(e) => handleDuplicate(workflow.id, e)}
                    disabled={duplicatingId === workflow.id}
                    title="Duplicate workflow"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section-block space-y-4" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">Recent activity</h2>
          <Link href="/observability" className="text-sm font-medium text-primary hover:underline">
            Full observability →
          </Link>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter runs by quality"
        >
          {RUN_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={runFilter === option.id}
              onClick={() => setRunFilter(option.id)}
            />
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {runsLoading ? (
              <LoadingState variant="list" />
            ) : runs.length === 0 ? (
              <EmptyState
                compact
                icon={Activity}
                title={
                  runFilter === "all" ? "No runs yet" : "No matching runs"
                }
                description={
                  runFilter === "all"
                    ? "Execute a workflow to see activity here."
                    : "Try a different quality filter."
                }
                action={
                  runFilter === "all" ? (
                    <Link href="/workflows/new">
                      <Button size="sm">Create workflow</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {runs.slice(0, 8).map((run) => (
                  <ListRow key={run.id} href={`/runs/${run.id}`}>
                    <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {run.workflow_name || "Workflow"}
                      </p>
                      <p className="truncate text-xs text-muted">{run.input_text}</p>
                    </div>
                    {run.guardrail_blocked && (
                      <Badge variant="destructive">guardrail</Badge>
                    )}
                    {run.eval_aggregate != null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-accent">Eval {run.eval_aggregate.toFixed(2)}</span>
                        {run.eval_passed === false && <Badge variant="destructive">fail</Badge>}
                      </div>
                    )}
                    <time
                      className="shrink-0 text-xs text-muted"
                      dateTime={run.created_at}
                      title={formatFullTimestamp(run.created_at)}
                    >
                      {formatRelativeTime(run.created_at)}
                    </time>
                  </ListRow>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}