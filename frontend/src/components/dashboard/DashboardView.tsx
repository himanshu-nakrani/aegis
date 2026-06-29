"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, LayoutTemplate, Plus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { EvalHistoryEntry, RunListItem, WorkflowListItem } from "@/types/workflow";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "warning" as const;
  return "outline" as const;
}

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
              // ignore workflows without eval history
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
    return <div className="p-8 text-slate-400">Loading dashboard...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400">Manage workflows and review past runs</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-200">Workflows</h2>
        {workflows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              No workflows yet.{" "}
              <Link href="/templates" className="text-sky-400 hover:underline">
                Browse templates
              </Link>{" "}
              or create your first agent workflow.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => {
              const history = evalSnippets[workflow.id];
              const latestScore = history?.[0]?.scores?.aggregate_score;

              return (
                <div key={workflow.id} className="relative">
                  <Link href={`/workflows/${workflow.id}`}>
                    <Card className="transition hover:border-sky-500/40">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Workflow className="h-4 w-4 text-sky-400" />
                          <CardTitle className="text-base">{workflow.name}</CardTitle>
                        </div>
                        <CardDescription>
                          v{workflow.latest_version_number ?? 1} · {workflow.version_count}{" "}
                          versions
                          {latestScore != null && (
                            <span> · Eval {latestScore.toFixed(2)}</span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-sm text-slate-400">
                          {workflow.description || "No description"}
                        </p>
                        {history && history.length > 0 && (
                          <div className="mt-3 flex gap-1">
                            {history.map((entry) => (
                              <span
                                key={entry.run_id}
                                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-200"
                                title={entry.input_text}
                              >
                                {entry.scores.aggregate_score?.toFixed(1) ?? "—"}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-8 w-8 p-0 text-slate-500 hover:text-slate-200"
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
        <h2 className="text-xl font-semibold text-slate-200">Recent Runs</h2>
        <Card>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="p-6 text-slate-400">No runs yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-4 px-6 py-4 transition hover:bg-slate-900/50"
                  >
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {run.workflow_name || "Workflow"}
                      </p>
                      <p className="truncate text-xs text-slate-500">{run.input_text}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(run.created_at).toLocaleString()}
                    </p>
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