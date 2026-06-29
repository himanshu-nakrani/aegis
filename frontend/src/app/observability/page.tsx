"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    return <div className="p-8 text-slate-400">Loading observability...</div>;
  }

  if (!summary) {
    return <div className="p-8 text-slate-400">Failed to load observability data.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Observability</h1>
          <p className="text-slate-400">Run metrics, eval trends, and platform health</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Workflows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-100">
            {summary.workflow_count}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-100">{summary.run_count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1 text-sm text-slate-400">
              <Star className="h-3 w-3" /> Avg Eval
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-200">
            {summary.avg_eval_score?.toFixed(2) ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1 text-sm text-slate-400">
              <Clock className="h-3 w-3" /> Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-100">
            {summary.avg_latency_ms != null ? `${summary.avg_latency_ms} ms` : "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-400" />
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
        <CardContent className="divide-y divide-slate-800 p-0">
          {summary.recent_runs.map((run) => (
            <Link
              key={run.run_id}
              href={`/runs/${run.run_id}`}
              className="flex items-center gap-4 px-6 py-4 transition hover:bg-slate-900/50"
            >
              <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
              <div className="flex-1 text-sm text-slate-300">
                {new Date(run.created_at).toLocaleString()}
              </div>
              {run.eval_aggregate != null && (
                <span className="text-sm text-amber-200">Eval {run.eval_aggregate.toFixed(2)}</span>
              )}
              {run.latency_ms != null && (
                <span className="text-sm text-slate-500">{run.latency_ms} ms</span>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}