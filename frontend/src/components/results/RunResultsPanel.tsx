"use client";

import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlowCard } from "@/components/ui/glow-card";
import { api } from "@/lib/api";
import { runStatusVariant } from "@/lib/run-status";
import type { EvalScores, NodeResult, WorkflowRun } from "@/types/workflow";
import { toast } from "sonner";

interface RunResultsPanelProps {
  run: WorkflowRun | null;
  liveEvents: Array<Record<string, unknown>>;
  isRunning: boolean;
  embedded?: boolean;
  onRunUpdate?: (run: WorkflowRun) => void;
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

export function RunResultsPanel({
  run,
  liveEvents,
  isRunning,
  embedded = false,
  onRunUpdate,
}: RunResultsPanelProps) {
  const nodeResults = run?.node_results || [];
  const metrics = run?.metrics_json;
  const evalScores = extractEvalScores(run);
  const failedGuardrails = (metrics?.failed_guardrails as string[] | undefined) || [];
  const guardrailEvents =
    (metrics?.guardrail_events as Array<{
      node_id: string;
      node_label?: string;
      status: string;
      message?: string;
      mode?: string;
    }>) || [];
  const evalPassed = metrics?.eval_passed as boolean | null | undefined;

  return (
    <div className={embedded ? "flex flex-col gap-4 p-4" : "flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4 sm:w-96"}>
      <div>
        <h2 className="text-base font-semibold text-foreground">Run results</h2>
        <p className="text-sm text-muted">
          {isRunning ? "Executing workflow…" : run?.status || "No run yet"}
        </p>
      </div>

      {run?.status === "awaiting_approval" && (
        <GlowCard variant="warning" className="p-4">
          <h3 className="mb-2 text-base font-semibold text-foreground">Approval required</h3>
          <p className="mb-3 text-sm text-muted">
            Node{" "}
            <span className="font-medium text-foreground">
              {String(
                (run.metrics_json?.pending_approval as { node_id?: string } | undefined)?.node_id ||
                  "human_approval"
              )}
            </span>{" "}
            is waiting for your decision.
          </p>
          {(run.metrics_json?.pending_approval as { review?: string } | undefined)?.review && (
            <p className="mb-3 whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">
              {String((run.metrics_json?.pending_approval as { review?: string }).review)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await api.approveRun(run.id, { approved: true });
                  onRunUpdate?.({ ...run, status: "running" });
                  toast.success("Approval sent");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Approval failed");
                }
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await api.approveRun(run.id, {
                    approved: false,
                    comment: "Rejected by reviewer",
                  });
                  onRunUpdate?.({ ...run, status: "failed" });
                  toast.message("Run rejected");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Rejection failed");
                }
              }}
            >
              Reject
            </Button>
          </div>
        </GlowCard>
      )}

      {evalScores && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Evaluation scores</CardTitle>
            {evalPassed === true && <Badge variant="success">Threshold passed</Badge>}
            {evalPassed === false && <Badge variant="destructive">Below threshold</Badge>}
          </CardHeader>
          <CardContent>
            <EvalScoresChart scores={evalScores} />
          </CardContent>
        </Card>
      )}

      {(guardrailEvents.length > 0 || failedGuardrails.length > 0) && (
        <Card className={failedGuardrails.length > 0 ? "border-destructive/30" : undefined}>
          <CardHeader>
            <CardTitle className={failedGuardrails.length > 0 ? "text-destructive" : undefined}>
              Guardrail checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GuardrailEventsPanel events={guardrailEvents} failedNodeIds={failedGuardrails} compact />
          </CardContent>
        </Card>
      )}

      {run?.final_output && (
        <Card>
          <CardHeader>
            <CardTitle>Final output</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-sm text-foreground">
              {run.final_output}
            </p>
          </CardContent>
        </Card>
      )}

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 text-sm text-muted sm:grid-cols-2">
            <p>Latency: {String(metrics.latency_ms ?? "—")} ms</p>
            <p>Tokens: {String(metrics.total_tokens ?? "—")}</p>
            <p>Nodes: {String(metrics.node_count ?? "—")}</p>
            {metrics.eval_aggregate != null && (
              <p>Eval: {String(metrics.eval_aggregate)}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Node results</h3>
        {nodeResults.map((result: NodeResult) => (
          <Card key={result.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{result.node_label}</CardTitle>
                <Badge variant={runStatusVariant(result.status)}>{result.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted">
              {result.output && (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-2 text-foreground">
                  {result.output}
                </p>
              )}
              {result.evaluation_scores && (
                <div className="rounded-lg bg-accent-muted p-2">
                  <EvalScoresChart scores={result.evaluation_scores as EvalScores} compact />
                </div>
              )}
              {result.guardrail_status && (
                <Badge variant={runStatusVariant(result.guardrail_status)}>
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
            <CardTitle>Live progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-muted">
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