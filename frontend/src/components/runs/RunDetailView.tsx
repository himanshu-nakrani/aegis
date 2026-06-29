"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { NodeResult, WorkflowRun } from "@/types/workflow";

function statusVariant(status: string) {
  if (status === "completed" || status === "passed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "destructive" as const;
  if (status === "running" || status === "pending") return "warning" as const;
  return "outline" as const;
}

function mergeNodeResult(existing: NodeResult[], event: Record<string, unknown>): NodeResult[] {
  const nodeId = String(event.node_id);
  const next: NodeResult = {
    id: nodeId,
    node_id: nodeId,
    node_type: "unknown",
    node_label: String(event.node_label || nodeId),
    status: "completed",
    output: (event.output as string | null | undefined) ?? null,
    evaluation_scores: (event.evaluation_scores as Record<string, unknown> | null) ?? null,
    guardrail_status: (event.guardrail_status as string | null) ?? null,
    latency_ms: (event.latency_ms as number | null) ?? null,
  };
  const without = existing.filter((item) => item.node_id !== nodeId);
  return [...without, next];
}

export function RunDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const streamAttached = useRef(false);

  const applyStreamEvent = useCallback((event: Record<string, unknown>) => {
    setRun((current) => {
      if (!current) return current;

      if (event.type === "node_completed") {
        return {
          ...current,
          node_results: mergeNodeResult(current.node_results || [], event),
        };
      }

      if (event.type === "run_completed") {
        return {
          ...current,
          status: "completed",
          final_output: (event.final_output as string | null) ?? current.final_output,
          metrics_json: (event.metrics as Record<string, unknown> | null) ?? current.metrics_json,
          node_results:
            (event.node_results as NodeResult[] | undefined) ?? current.node_results,
        };
      }

      if (event.type === "run_failed") {
        return {
          ...current,
          status: "failed",
          final_output: String(event.error || current.final_output || "Workflow failed"),
        };
      }

      if (event.type === "run_cancelled") {
        return { ...current, status: "cancelled" };
      }

      return current;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getRun(runId)
      .then(setRun)
      .catch(() => setRun(null))
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!run || !["pending", "running"].includes(run.status)) {
      streamAttached.current = false;
      return;
    }
    if (streamAttached.current) return;
    streamAttached.current = true;

    const source = api.streamRun(
      runId,
      applyStreamEvent,
      () => toast.error("Lost connection to run stream")
    );

    return () => {
      source.close();
      streamAttached.current = false;
    };
  }, [runId, run?.status, applyStreamEvent]);

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
        {(run.node_results || []).length === 0 && ["pending", "running"].includes(run.status) && (
          <p className="text-sm text-slate-500">Waiting for node results...</p>
        )}
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