"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowCard } from "@/components/ui/glow-card";

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
  const router = useRouter();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [traceUiBase, setTraceUiBase] = useState<string | null>(null);
  const streamAttached = useRef(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!run?.status) return;
    if (prevStatusRef.current && prevStatusRef.current !== run.status) {
      setStatusAnnouncement(`Run status: ${runStatusLabel(run.status)}`);
    }
    prevStatusRef.current = run.status;
  }, [run?.status]);

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

  const loadRun = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getRun(runId, signal ? { signal } : undefined),
      api.getTracingConfig().catch(() => null),
    ])
      .then(([runData, tracing]) => {
        setRun(runData);
        setTraceUiBase(tracing?.ui_base_url ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof Error && error.name === "AbortError") return;
        setRun(null);
        setLoadError(error);
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
        }
      });
  }, [runId]);

  useEffect(() => {
    const controller = new AbortController();
    loadRun(controller.signal);
    return () => controller.abort();
  }, [loadRun]);

  const streamableStatus = run?.status;
  const [streamEpoch, setStreamEpoch] = useState(0);

  useEffect(() => {
    if (
      !streamableStatus ||
      !["pending", "running", "awaiting_approval"].includes(streamableStatus)
    ) {
      streamAttached.current = false;
      return;
    }
    if (streamAttached.current) return;
    streamAttached.current = true;

    const stream = api.streamRun(
      runId,
      applyStreamEvent,
      () => {
        streamAttached.current = false;
        setStreamEpoch((n) => n + 1);
        toast.error("Lost connection to run stream");
      }
    );

    return () => {
      stream.close();
      streamAttached.current = false;
    };
  }, [runId, streamableStatus, applyStreamEvent, streamEpoch]);

  if (loading) {
    return <LoadingState label="Loading run…" />;
  }

  if (loadError) {
    return (
      <div className="page-container">
        <ApiConnectionState
          title="Run request failed"
          description="Run details could not be loaded. Check the API target, then retry."
          error={loadError}
          onRetry={() => loadRun()}
        />
      </div>
    );
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

  const guardrailEvents =
    (run.metrics_json?.guardrail_events as Array<{
      node_id: string;
      node_label?: string;
      status: string;
      message?: string;
    }>) || [];
  const hasGuardrails =
    guardrailEvents.length > 0 ||
    ((run.metrics_json?.failed_guardrails as string[] | undefined)?.length ?? 0) > 0;
  const evalPassed = run.metrics_json?.eval_passed;

  return (
    <div className="page-container space-y-6">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement || `Run status: ${runStatusLabel(run.status)}`}
      </p>
      <PageHeader
        title="Run details"
        description={<span className="font-mono text-xs text-muted">{run.id}</span>}
        back={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push("/observability");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
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
              <Button variant="outline">Dashboard</Button>
            </Link>
          </>
        }
      />

      <div className="dashboard-panel flex flex-wrap gap-x-6 gap-y-2 rounded-xl p-4 text-xs text-muted">
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
        <GlowCard variant="warning" className="mb-6 p-4">
          <h2 className="text-heading mb-2">Approval required</h2>
          <div className="space-y-4">
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
                    toast.success("Approval sent");
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
                      current ? { ...current, status: "failed" } : current
                    );
                    toast.message("Run rejected");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Rejection failed");
                  }
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </GlowCard>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Input</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{run.input_text}</p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-heading">Node timeline</h2>
              <Badge variant="outline">{(run.node_results || []).length} results</Badge>
            </div>
            {(run.node_results || []).length === 0 && ["pending", "running"].includes(run.status) && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                Waiting for node results…
              </div>
            )}
            {(run.node_results || []).map((node) => (
              <GlassCard key={node.id} className="overflow-hidden p-0">
                <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {node.node_label}
                    </h3>
                    <p className="text-caption">{node.node_type}</p>
                  </div>
                  <Badge variant={runStatusVariant(node.status)}>{runStatusLabel(node.status)}</Badge>
                </div>
                <div className="space-y-3 px-4 py-3 text-sm text-muted">
                  {node.output && (
                    <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-input p-3 text-foreground/90">
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
                      Guardrail: {runStatusLabel(node.guardrail_status)}
                    </Badge>
                  )}
                  {node.latency_ms != null && <p className="text-xs">Latency: {node.latency_ms} ms</p>}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {run.metrics_json && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: "Latency", value: `${String(run.metrics_json.latency_ms ?? "—")} ms` },
                { label: "Tokens", value: String(run.metrics_json.total_tokens ?? "—") },
                { label: "Nodes", value: String(run.metrics_json.node_count ?? "—") },
              ].map((metric) => (
                <GlassCard key={metric.label} className="p-4">
                  <p className="text-micro">{metric.label}</p>
                  <p className="text-body-lg mt-1 font-semibold">{metric.value}</p>
                </GlassCard>
              ))}
            </div>
          )}

          {run.metrics_json?.eval_aggregate != null && (
            <GlassCard className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-heading">Evaluation</h3>
                {evalPassed === true && <Badge variant="success">Threshold passed</Badge>}
                {evalPassed === false && <Badge variant="destructive">Below threshold</Badge>}
              </div>
              <EvalScoresChart
                scores={{
                  ...((run.metrics_json.eval_scores as EvalScores[] | undefined)?.[0] || {}),
                  aggregate_score: run.metrics_json.eval_aggregate as number,
                }}
              />
            </GlassCard>
          )}

          {hasGuardrails && (
            <GlassCard className="p-4">
              <h3 className="text-heading mb-3">Guardrails</h3>
              <GuardrailEventsPanel
                events={guardrailEvents}
                failedNodeIds={(run.metrics_json?.failed_guardrails as string[]) || []}
              />
            </GlassCard>
          )}

          {run.final_output &&
            (evalPassed === true ? (
              <GlowCard variant="primary" className="p-4">
                <h3 className="text-heading mb-2">Final output</h3>
                <pre className="text-body whitespace-pre-wrap font-mono">{run.final_output}</pre>
              </GlowCard>
            ) : (
              <GlassCard className="p-4">
                <h3 className="text-heading mb-2">Final output</h3>
                <pre className="text-body whitespace-pre-wrap font-mono">{run.final_output}</pre>
              </GlassCard>
            ))}
        </aside>
      </div>
    </div>
  );
}
