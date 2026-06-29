"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { RunListItem, WorkflowListItem } from "@/types/workflow";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "warning" as const;
  return "outline" as const;
}

export function DashboardView() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listWorkflows(), api.listRuns()])
      .then(([workflowData, runData]) => {
        setWorkflows(workflowData);
        setRuns(runData);
      })
      .finally(() => setLoading(false));
  }, []);

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
        <Link href="/workflows/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-200">Workflows</h2>
        {workflows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              No workflows yet. Create your first agent workflow.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
                <Card className="transition hover:border-sky-500/40">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-sky-400" />
                      <CardTitle className="text-base">{workflow.name}</CardTitle>
                    </div>
                    <CardDescription>
                      v{workflow.latest_version_number ?? 1} · {workflow.version_count} versions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-slate-400">
                      {workflow.description || "No description"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
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