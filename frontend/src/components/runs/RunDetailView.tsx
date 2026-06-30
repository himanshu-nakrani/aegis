"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { TraceIdBadge } from "@/components/observability/TraceIdBadge";
import { api } from "@/lib/api";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import type { EvalScores, NodeResult, WorkflowRun } from "@/types/workflow";

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
  const [traceUiBase, setTraceUiBase] = useState<string | null>(null);
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

      if (event.type === "run_started" && typeof event.trace_id === "string") {
        return {
          ...current,
          metrics_json: {
            ...(current.metrics_json || {}),
            trace_id: event.trace_id,
          },
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

      if (event.type === "approval_required") {
        const pending = {
          node_id: String(event.node_id || ""),
          review: String(event.review || ""),
        };
        return {
          ...current,
          status: "awaiting_approval",
          metrics_json: {
            ...(current.metrics_json || {}),
            pending_approval: pending,
          },
        };
      }

      return current;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getRun(runId), api.getTracingConfig().catch(() => null)])
      .then(([runData, tracing]) => {
        setRun(runData);
        setTraceUiBase(tracing?.ui_base_url ?? null);
      })
      .catch(() => setRun(null))
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!run || !["pending", "running", "awaiting_approval"].includes(run.status)) {
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
    return <LoadingState label="Loading run…" />;
  }

  if (!run) {
    return (
      <div className="page-container">
        <EmptyState
          icon={Activity}
          title="Run not found"
          description="This run may have been deleted or you may not have access."
          action={
            <Link href="/">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container max-w-4xl space-y-8">
      <PageHeader
        title="Run details"
        description={<span className="font-mono text-xs text-muted">{run.id}</span>}
        actions={
          <>
            <Badge variant={runStatusVariant(run.status)}>{runStatusLabel(run.status)}</Badge>
            {typeof run.metrics_json?.trace_id === "string" && (
              <TraceIdBadge
                traceId={run.metrics_json.trace_id}
                uiBaseUrl={traceUiBase}
              />
            )}
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
              Export
            </Button>
            <Link href="/">
              <Button variant="secondary">Dashboard</Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>
          Created{" "}
          <time dateTime={run.created_at} title={formatFullTimestamp(run.created_at)} className="text-foreground">
            {formatRelativeTime(run.created_at)}
          </time>
        </span>
        {run.started_at && (
          <span>
            Started{" "}
            <time dateTime={run.started_at} title={formatFullTimestamp(run.started_at)} className="text-foreground">
              {formatRelativeTime(run.started_at)}
            </time>
          </span>
        )}
        {run.completed_at && (
          <span>
            Completed{" "}
            <time
              dateTime={run.completed_at}
              title={formatFullTimestamp(run.completed_at)}
              className="text-foreground"
            >
              {formatRelativeTime(run.completed_at)}
            </time>
          </span>
        )}
      </div>

      {run.status === "awaiting_approval" && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">Approval required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted">
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
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm text-foreground/90">
                {String((run.metrics_json?.pending_approval as { review?: string }).review)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    await api.approveRun(runId, { approved: true });
                    setRun((current) =>
                      current ? { ...current, status: "running" } : current
                    );
                    toast.success("Approved — run continuing");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Approval failed");
                  }
                }}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api.approveRun(runId, { approved: false, comment: "Rejected by reviewer" });
                    setRun((current) =>
                      current ? { ...current, status: "running" } : current
                    );
                    toast.message("Rejected — run will fail at approval node");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Rejection failed");
                  }
                }}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{run.input_text}</p>
        </CardContent>
      </Card>

      {run.final_output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final Output</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 font-mono text-sm text-foreground/90">
              {run.final_output}
            </p>
          </CardContent>
        </Card>
      )}

      {run.metrics_json && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Latency", value: `${String(run.metrics_json.latency_ms ?? "—")} ms` },
            { label: "Tokens", value: String(run.metrics_json.total_tokens ?? "—") },
            { label: "Nodes", value: String(run.metrics_json.node_count ?? "—") },
          ].map((metric) => (
            <Card key={metric.label}>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{metric.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {run.metrics_json?.eval_aggregate != null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Evaluation</CardTitle>
            {run.metrics_json.eval_passed === true && <Badge variant="success">Threshold passed</Badge>}
            {run.metrics_json.eval_passed === false && <Badge variant="destructive">Below threshold</Badge>}
          </CardHeader>
          <CardContent>
            <EvalScoresChart
              scores={{
                ...((run.metrics_json.eval_scores as EvalScores[] | undefined)?.[0] || {}),
                aggregate_score: run.metrics_json.eval_aggregate as number,
              }}
            />
          </CardContent>
        </Card>
      )}

      {(((run.metrics_json?.guardrail_events as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((run.metrics_json?.failed_guardrails as string[] | undefined)?.length ?? 0) > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardrails</CardTitle>
          </CardHeader>
          <CardContent>
            <GuardrailEventsPanel
              events={
                (run.metrics_json?.guardrail_events as Array<{
                  node_id: string;
                  node_label?: string;
                  status: string;
                  message?: string;
                }>) || []
              }
              failedNodeIds={(run.metrics_json?.failed_guardrails as string[]) || []}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <h2 className="section-heading">Node Timeline</h2>
        {(run.node_results || []).length === 0 && ["pending", "running"].includes(run.status) && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
            Waiting for node results…
          </div>
        )}
        {(run.node_results || []).map((node) => (
          <Card key={node.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-sm">{node.node_label}</CardTitle>
                <Badge variant={runStatusVariant(node.status)}>{node.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <p className="text-xs font-medium uppercase tracking-wider text-muted/80">
                {node.node_type}
              </p>
              {node.output && (
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-foreground/90">
                  {node.output}
                </p>
              )}
              {node.evaluation_scores && (
                <div className="rounded-lg border border-accent/20 bg-accent-muted p-3 text-accent">
                  Faithfulness: {String(node.evaluation_scores.faithfulness ?? "—")} · Helpfulness:{" "}
                  {String(node.evaluation_scores.helpfulness ?? "—")}
                </div>
              )}
              {node.guardrail_status && (
                <Badge variant={runStatusVariant(node.guardrail_status)}>
                  Guardrail: {node.guardrail_status}
                </Badge>
              )}
              {node.latency_ms != null && <p className="text-xs">Latency: {node.latency_ms} ms</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}