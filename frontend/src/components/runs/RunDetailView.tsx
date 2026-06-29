"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { WorkflowRun } from "@/types/workflow";

function statusVariant(status: string) {
  if (status === "completed" || status === "passed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "destructive" as const;
  if (status === "running") return "warning" as const;
  return "outline" as const;
}

export function RunDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getRun(runId)
      .then(setRun)
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading run...</div>;
  }

  if (!run) {
    return <div className="p-8 text-slate-400">Run not found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Run Details</h1>
          <p className="font-mono text-xs text-slate-500">{run.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const blob = await api.exportRun(runId);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `run-${runId}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Run exported");
              } catch {
                toast.error("Export failed");
              }
            }}
          >
            <Download className="h-4 w-4" />
            Export JSON
          </Button>
          <Link href="/">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-slate-300">{run.input_text}</p>
        </CardContent>
      </Card>

      {run.final_output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final Output</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{run.final_output}</p>
          </CardContent>
        </Card>
      )}

      {run.metrics_json && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm text-slate-300">
            <div>Latency: {String(run.metrics_json.latency_ms ?? "—")} ms</div>
            <div>Tokens: {String(run.metrics_json.total_tokens ?? "—")}</div>
            <div>Nodes: {String(run.metrics_json.node_count ?? "—")}</div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">Node Timeline</h2>
        {(run.node_results || []).map((node) => (
          <Card key={node.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{node.node_label}</CardTitle>
                <Badge variant={statusVariant(node.status)}>{node.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-400">
              <p className="text-xs uppercase text-slate-500">{node.node_type}</p>
              {node.output && <p className="whitespace-pre-wrap">{node.output}</p>}
              {node.evaluation_scores && (
                <div className="rounded bg-amber-500/10 p-2 text-amber-200">
                  Faithfulness: {String(node.evaluation_scores.faithfulness ?? "—")} · Helpfulness:{" "}
                  {String(node.evaluation_scores.helpfulness ?? "—")}
                </div>
              )}
              {node.guardrail_status && (
                <Badge variant={statusVariant(node.guardrail_status)}>
                  Guardrail: {node.guardrail_status}
                </Badge>
              )}
              {node.latency_ms != null && <p>Latency: {node.latency_ms} ms</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}