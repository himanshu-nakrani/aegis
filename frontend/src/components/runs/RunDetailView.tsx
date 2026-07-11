"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, Download, FileInput } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { EvalScores, LlmCall, NodeResult, WorkflowRun } from "@/types/workflow";

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

function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return "—";
  const durationMs = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)} s`;
}

export function RunDetailView({ runId }: { runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [traceUiBase, setTraceUiBase] = useState<string | null>(null);
  const [llmCalls, setLlmCalls] = useState<LlmCall[]>([]);
  const [feedbackGiven, setFeedbackGiven] = useState<1 | -1 | null>(null);
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

  useEffect(() => {
    if (!run?.status || ["pending", "running"].includes(run.status)) return;
    api
      .getRunLlmCalls(runId)
      .then(setLlmCalls)
      .catch(() => setLlmCalls([]));
  }, [runId, run?.status]);

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
            <Button asChild variant="outline">
              <Link href="/">Back to workflows</Link>
            </Button>
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
  const metrics = run.metrics_json || {};
  const nodeResults = run.node_results || [];
  const duration = formatDuration(run.started_at, run.completed_at);
  const evalAggregate =
    typeof metrics.eval_aggregate === "number" ? metrics.eval_aggregate : null;
  const failedGuardrails = (metrics.failed_guardrails as string[] | undefined) || [];
  const resultCount = nodeResults.length;

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
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                type="button"
                aria-label="Good result"
                title="Good result"
                disabled={feedbackGiven !== null}
                onClick={() => {
                  setFeedbackGiven(1);
                  api.submitFeedback({ run_id: run.id, rating: 1 }).catch(() => setFeedbackGiven(null));
                }}
                className={`rounded px-2 py-1 text-sm transition-colors ${
                  feedbackGiven === 1 ? "bg-success/15 text-success" : "text-muted hover:text-foreground"
                } focus-ring disabled:cursor-default`}
              >
                👍
              </button>
              <button
                type="button"
                aria-label="Bad result"
                title="Bad result"
                disabled={feedbackGiven !== null}
                onClick={() => {
                  setFeedbackGiven(-1);
                  api.submitFeedback({ run_id: run.id, rating: -1 }).catch(() => setFeedbackGiven(null));
                }}
                className={`rounded px-2 py-1 text-sm transition-colors ${
                  feedbackGiven === -1 ? "bg-destructive/15 text-destructive" : "text-muted hover:text-foreground"
                } focus-ring disabled:cursor-default`}
              >
                👎
              </button>
            </div>
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
            <Button asChild variant="outline">
              <Link href="/">Workflows</Link>
            </Button>
          </>
        }
      />

      <div className="dashboard-panel overflow-hidden rounded-lg">
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Status", value: runStatusLabel(run.status) },
            { label: "Duration", value: duration },
            { label: "Nodes", value: String(metrics.node_count ?? resultCount) },
            {
              label: "Tokens",
              value:
                typeof metrics.total_tokens === "number" && metrics.total_tokens > 0
                  ? metrics.total_tokens.toLocaleString()
                  : "—",
            },
            {
              label: "Cost",
              value:
                typeof metrics.total_cost_usd === "number" && metrics.total_cost_usd > 0
                  ? `$${Number(metrics.total_cost_usd).toFixed(4)}`
                  : "—",
            },
            {
              label: "Eval",
              value: evalAggregate == null ? "—" : `${evalAggregate.toFixed(2)} / 5`,
            },
          ].map((item) => (
            <div key={item.label} className="px-4 py-3">
              <p className="text-micro">{item.label}</p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 bg-background/20 px-4 py-2.5 font-mono text-xs text-muted">
          <span>
            created{" "}
            <time dateTime={run.created_at} title={formatFullTimestamp(run.created_at)}>
              {formatRelativeTime(run.created_at)}
            </time>
          </span>
          {run.completed_at && (
            <span>
              completed{" "}
              <time dateTime={run.completed_at} title={formatFullTimestamp(run.completed_at)}>
                {formatRelativeTime(run.completed_at)}
              </time>
            </span>
          )}
          {typeof metrics.trace_id === "string" && (
            <span className="truncate">trace:{metrics.trace_id}</span>
          )}
        </div>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <GlassCard className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-input/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary-muted text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <FileInput className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Input</h2>
                  <p className="text-caption">Payload used for this run</p>
                </div>
              </div>
              <Badge variant="outline">{run.input_text.length.toLocaleString()} chars</Badge>
            </div>
            <div className="p-4">
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-6 text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                {run.input_text}
              </p>
            </div>
          </GlassCard>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-heading">Node timeline</h2>
              <Badge variant="outline">{resultCount} results</Badge>
            </div>
            {resultCount === 0 && ["pending", "running"].includes(run.status) && (
              <GlassCard className="flex items-center gap-3 p-4 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                Waiting for node results…
              </GlassCard>
            )}
            {nodeResults.map((node, index) => (
              <GlassCard key={node.id} className="overflow-hidden p-0">
                <div className="flex items-start gap-4 border-b border-border bg-surface-input/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary-muted font-mono text-xs font-semibold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {node.node_label}
                        </h3>
                        <p className="text-caption">{node.node_type}</p>
                      </div>
                      <Badge variant={runStatusVariant(node.status)}>{runStatusLabel(node.status)}</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 px-4 py-3 text-sm text-muted">
                  {node.output && (
                    <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 leading-6 text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                      {node.output}
                    </p>
                  )}
                  {node.evaluation_scores && (
                    <div className="rounded-lg border border-accent/20 bg-accent-muted p-3">
                      <EvalScoresChart scores={node.evaluation_scores as EvalScores} compact />
                    </div>
                  )}
                  {node.guardrail_status && (
                    <Badge variant={runStatusVariant(node.guardrail_status)}>
                      Guardrail: {runStatusLabel(node.guardrail_status)}
                    </Badge>
                  )}
                  {node.latency_ms != null && <p className="text-xs">Latency: {node.latency_ms} ms</p>}
                  {llmCalls
                    .filter((call) => call.node_id === node.node_id)
                    .map((call, callIndex) => (
                      <details
                        key={call.id}
                        className="rounded-lg border border-border bg-surface"
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-mono text-xs text-muted hover:text-foreground">
                          <span>
                            llm call {callIndex + 1} · {call.model ?? "model"}
                          </span>
                          <span>
                            {call.total_tokens ?? "—"} tok
                            {typeof call.cost_usd === "number" && call.cost_usd > 0
                              ? ` · $${call.cost_usd.toFixed(5)}`
                              : ""}
                            {call.latency_ms != null ? ` · ${call.latency_ms} ms` : ""}
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-border px-3 py-2">
                          {call.prompt_text && (
                            <div>
                              <p className="text-micro mb-1">Prompt</p>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-xs leading-5 text-foreground/85">{call.prompt_text}</pre>
                            </div>
                          )}
                          {call.completion_text && (
                            <div>
                              <p className="text-micro mb-1">Completion</p>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-xs leading-5 text-foreground/85">{call.completion_text}</pre>
                            </div>
                          )}
                          <p className="font-mono text-2xs text-subtle">
                            prompt {call.prompt_tokens ?? "—"} · completion {call.completion_tokens ?? "—"}
                            {call.thinking_tokens ? ` · thinking ${call.thinking_tokens}` : ""}
                          </p>
                        </div>
                      </details>
                    ))}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {evalAggregate != null && (
            <GlassCard className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-heading">Evaluation</h3>
                {evalPassed === true && <Badge variant="success">Threshold passed</Badge>}
                {evalPassed === false && <Badge variant="destructive">Below threshold</Badge>}
              </div>
              <EvalScoresChart
                scores={{
                  ...((metrics.eval_scores as EvalScores[] | undefined)?.[0] || {}),
                  aggregate_score: evalAggregate,
                }}
              />
            </GlassCard>
          )}

          {hasGuardrails && (
            <GlassCard className="p-4">
              <h3 className="text-heading mb-3">Guardrails</h3>
              <GuardrailEventsPanel
                events={guardrailEvents}
                failedNodeIds={failedGuardrails}
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
