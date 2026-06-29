"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Copy, LayoutTemplate, Plus, Workflow, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import type { EvalHistoryEntry, RunListItem, WorkflowListItem } from "@/types/workflow";

export function DashboardView() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [evalSnippets, setEvalSnippets] = useState<Record<string, EvalHistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listWorkflows(), api.listRuns()])
      .then(async ([workflowData, runData]) => {
        setWorkflows(workflowData);
        setRuns(runData);

        const snippets: Record<string, EvalHistoryEntry[]> = {};
        await Promise.all(
          workflowData.slice(0, 6).map(async (wf) => {
            try {
              const history = await api.getEvalHistory(wf.id);
              if (history.length > 0) snippets[wf.id] = history.slice(0, 3);
            } catch {
              // ignore
            }
          })
        );
        setEvalSnippets(snippets);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDuplicate = async (workflowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDuplicatingId(workflowId);
    try {
      const copy = await api.duplicateWorkflow(workflowId);
      toast.success(`Duplicated as "${copy.name}"`);
      setWorkflows((prev) => [
        {
          id: copy.id,
          name: copy.name,
          description: copy.description,
          created_at: copy.created_at,
          updated_at: copy.updated_at,
          version_count: 1,
          latest_version_number: copy.latest_version?.version_number ?? 1,
        },
        ...prev,
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate");
    } finally {
      setDuplicatingId(null);
    }
  };

  if (loading) {
    return <LoadingState label="Loading workspace…" />;
  }

  const runningCount = runs.filter((r) => r.status === "running").length;
  const completedCount = runs.filter((r) => r.status === "completed").length;

  return (
    <div className="page-container space-y-8">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Workflows" value={workflows.length} icon={Workflow} />
        <StatCard label="Total Runs" value={runs.length} icon={Activity} />
        <StatCard label="Running" value={runningCount} icon={Zap} trend="Live executions" />
        <StatCard label="Completed" value={completedCount} trend="Successful runs" />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-heading">Workflows</h2>
          <span className="text-sm text-muted">{workflows.length} total</span>
        </div>

        {workflows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-muted">
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Create your first workflow</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Start from a template or build a custom agent pipeline on the visual canvas.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/templates">
                  <Button variant="outline">Browse templates</Button>
                </Link>
                <Link href="/workflows/new">
                  <Button>Create workflow</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow) => {
              const latestScore = evalSnippets[workflow.id]?.[0]?.scores?.aggregate_score;

              return (
                <div key={workflow.id} className="group relative">
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
                    className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100"
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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-heading">Recent activity</h2>
          <Link href="/observability" className="text-sm font-medium text-primary hover:underline">
            View observability
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No runs yet. Execute a workflow to see activity here.</p>
            ) : (
              <div className="divide-y divide-border">
                {runs.slice(0, 8).map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-hover"
                  >
                    <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {run.workflow_name || "Workflow"}
                      </p>
                      <p className="truncate text-xs text-muted">{run.input_text}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted">
                      {new Date(run.created_at).toLocaleString()}
                    </time>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}