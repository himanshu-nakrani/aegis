"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, BookOpen, Brain, Clock, Star, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";

export default function ObservabilityPage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getObservabilitySummary>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getObservabilitySummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Observability"
        description="Run metrics, evaluation trends, and workflow performance at a glance."
        back={
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-muted">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
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
          label="Avg Latency"
          value={summary.avg_latency_ms != null ? `${summary.avg_latency_ms} ms` : "—"}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="KB Documents" value={summary.knowledge_doc_count} icon={BookOpen} />
        <StatCard label="Memory Entries" value={summary.memory_entry_count} icon={Brain} />
        <StatCard label="Scheduled Flows" value={summary.scheduled_workflow_count} icon={Timer} />
        <StatCard
          label="Active Runs"
          value={`${summary.active_runs}/${summary.max_concurrent_runs}`}
          icon={Activity}
        />
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
        <CardContent className="divide-y divide-border p-0">
          {summary.recent_runs.map((run) => (
            <Link
              key={run.run_id}
              href={`/runs/${run.run_id}`}
              className="group flex items-center gap-4 px-6 py-4 transition hover:bg-surface-hover/60"
            >
              <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
              <div className="flex-1 text-sm text-foreground group-hover:text-primary">
                {new Date(run.created_at).toLocaleString()}
              </div>
              {run.eval_aggregate != null && (
                <span className="text-sm text-accent">Eval {run.eval_aggregate.toFixed(2)}</span>
              )}
              {run.latency_ms != null && (
                <span className="text-sm text-muted">{run.latency_ms} ms</span>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}