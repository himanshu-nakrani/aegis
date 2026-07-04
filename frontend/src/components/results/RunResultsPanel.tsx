"use client";

import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowCard } from "@/components/ui/glow-card";
import { api } from "@/lib/api";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import { cn } from "@/lib/utils";
import type { EvalScores, NodeResult, WorkflowRun } from "@/types/workflow";
import { Activity, FileText, ListChecks, Radio, ShieldCheck } from "lucide-react";
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
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface-input/85 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/55 via-accent/35 to-transparent" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Run results</h2>
              <p className="text-caption">
                {isRunning ? "Executing workflow…" : run ? runStatusLabel(run.status) : "No run yet"}
              </p>
            </div>
          </div>
          <Badge variant={run ? runStatusVariant(run.status) : "outline"}>
            {run ? runStatusLabel(run.status) : "Idle"}
          </Badge>
        </div>
      </div>

      {run?.status === "awaiting_approval" && (
        <GlowCard variant="warning" className="rounded-lg p-4">
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
        <GlassCard className="overflow-hidden p-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 bg-surface-input/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-warning/25 bg-warning/10 text-warning">
                <ListChecks className="h-4 w-4" />
              </span>
              <CardTitle>Evaluation scores</CardTitle>
            </div>
            {evalPassed === true && <Badge variant="success" className="whitespace-nowrap">Threshold passed</Badge>}
            {evalPassed === false && <Badge variant="destructive" className="whitespace-nowrap">Below threshold</Badge>}
          </CardHeader>
          <CardContent>
            <EvalScoresChart scores={evalScores} />
          </CardContent>
        </GlassCard>
      )}

      {(guardrailEvents.length > 0 || failedGuardrails.length > 0) && (
        <GlassCard
          className={failedGuardrails.length > 0 ? "overflow-hidden border-destructive/30 p-0" : "overflow-hidden p-0"}
        >
          <CardHeader className="bg-surface-input/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border",
                  failedGuardrails.length > 0
                    ? "border-destructive/25 bg-destructive/10 text-destructive"
                    : "border-success/25 bg-success/10 text-success"
                )}
              >
                <ShieldCheck className="h-4 w-4" />
              </span>
              <CardTitle className={failedGuardrails.length > 0 ? "text-destructive" : undefined}>
                Guardrail checks
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <GuardrailEventsPanel events={guardrailEvents} failedNodeIds={failedGuardrails} compact />
          </CardContent>
        </GlassCard>
      )}

      {run?.final_output && (
        <GlassCard className="overflow-hidden p-0">
          <CardHeader className="bg-surface-input/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <CardTitle>Final output</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-sm leading-6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              {run.final_output}
            </p>
          </CardContent>
        </GlassCard>
      )}

      {metrics && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Latency", value: `${String(metrics.latency_ms ?? "—")} ms` },
            { label: "Tokens", value: String(metrics.total_tokens ?? "—") },
            { label: "Nodes", value: String(metrics.node_count ?? "—") },
            { label: "Eval", value: String(metrics.eval_aggregate ?? "—") },
          ].map((metric) => (
            <GlassCard key={metric.label} className="p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <p className="text-micro">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{metric.value}</p>
            </GlassCard>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Node results</h3>
          <span className="text-caption">{nodeResults.length} entries</span>
        </div>
        {nodeResults.map((result: NodeResult) => (
          <GlassCard key={result.id} className="overflow-hidden p-0">
            <CardHeader className="bg-surface-input/80 pb-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate">{result.node_label}</CardTitle>
                  <p className="text-caption">{result.node_type}</p>
                </div>
                <Badge variant={runStatusVariant(result.status)}>
                  {runStatusLabel(result.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted">
              {result.output && (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 leading-6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
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
                  Guardrail: {runStatusLabel(result.guardrail_status)}
                </Badge>
              )}
              {result.latency_ms != null && <p>Latency: {result.latency_ms} ms</p>}
            </CardContent>
          </GlassCard>
        ))}
      </div>

      {liveEvents.length > 0 && (
        <GlassCard className="overflow-hidden p-0">
          <CardHeader className="bg-surface-input/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/25 bg-accent-muted text-accent">
                <Radio className="h-4 w-4" />
              </span>
              <CardTitle>Event stream</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 font-mono text-xs text-muted">
            {liveEvents.slice(-8).map((event, index) => (
              <p key={index}>
                [{String(event.type)}] {String(event.node_label || event.node_id || "")}
              </p>
            ))}
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
