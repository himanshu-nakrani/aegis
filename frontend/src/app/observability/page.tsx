"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "warning" as const;
  return "outline" as const;
}

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(summary.status_counts).map(([status, count]) => (
            <Badge key={status} variant={statusVariant(status)}>
              {status}: {count}
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
              <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
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