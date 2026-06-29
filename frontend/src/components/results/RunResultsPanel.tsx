"use client";

import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvalScores, NodeResult, WorkflowRun } from "@/types/workflow";

interface RunResultsPanelProps {
  run: WorkflowRun | null;
  liveEvents: Array<Record<string, unknown>>;
  isRunning: boolean;
  embedded?: boolean;
}

function statusVariant(status: string) {
  if (status === "completed" || status === "passed") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "running") return "warning" as const;
  return "outline" as const;
}

function extractEvalScores(run: WorkflowRun | null): EvalScores | null {
  if (!run) return null;

  const metrics = run.metrics_json;
  if (metrics?.eval_aggregate != null) {
    const scores = (metrics.eval_scores as EvalScores[] | undefined)?.[0];
    return {
      ...scores,
      aggregate_score: metrics.eval_aggregate as number,
    };
  }

  for (const result of run.node_results || []) {
    if (result.evaluation_scores) {
      const scores = result.evaluation_scores as EvalScores;
      if (
        scores.faithfulness != null ||
        scores.helpfulness != null ||
        scores.relevance != null
      ) {
        return scores;
      }
    }
  }

  return null;
}

export function RunResultsPanel({ run, liveEvents, isRunning, embedded = false }: RunResultsPanelProps) {
  const nodeResults = run?.node_results || [];
  const metrics = run?.metrics_json;
  const evalScores = extractEvalScores(run);
  const failedGuardrails = (metrics?.failed_guardrails as string[] | undefined) || [];

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-4 p-4"
          : "flex h-full w-96 flex-col gap-4 overflow-y-auto border-l border-slate-800 bg-slate-950/90 p-4"
      }
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Run Results</h2>
        <p className="text-sm text-slate-400">
          {isRunning ? "Workflow executing..." : run?.status || "No run yet"}
        </p>
      </div>

      {evalScores && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluation Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <EvalScoresChart scores={evalScores} />
          </CardContent>
        </Card>
      )}

      {failedGuardrails.length > 0 && (
        <Card className="border-rose-500/40">
          <CardHeader>
            <CardTitle className="text-base text-rose-300">Guardrail Failures</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-rose-200/80">
            {failedGuardrails.map((nodeId) => (
              <p key={nodeId}>Node {nodeId} failed guardrail check</p>
            ))}
          </CardContent>
        </Card>
      )}

      {run?.final_output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final Output</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{run.final_output}</p>
          </CardContent>
        </Card>
      )}

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-300">
            <p>Latency: {String(metrics.latency_ms ?? "—")} ms</p>
            <p>Tokens: {String(metrics.total_tokens ?? "—")}</p>
            <p>Nodes: {String(metrics.node_count ?? "—")}</p>
            {metrics.eval_aggregate != null && (
              <p>Eval Aggregate: {String(metrics.eval_aggregate)}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Node Results</h3>
        {nodeResults.map((result: NodeResult) => (
          <Card key={result.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{result.node_label}</CardTitle>
                <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-400">
              {result.output && <p className="whitespace-pre-wrap">{result.output}</p>}
              {result.evaluation_scores && (
                <div className="rounded-md bg-amber-500/10 p-2">
                  <EvalScoresChart
                    scores={result.evaluation_scores as EvalScores}
                    compact
                  />
                </div>
              )}
              {result.guardrail_status && (
                <Badge variant={statusVariant(result.guardrail_status)}>
                  Guardrail: {result.guardrail_status}
                </Badge>
              )}
              {result.latency_ms != null && <p>Latency: {result.latency_ms} ms</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {liveEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-400">
            {liveEvents.slice(-8).map((event, index) => (
              <p key={index}>
                [{String(event.type)}] {String(event.node_label || event.node_id || "")}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}