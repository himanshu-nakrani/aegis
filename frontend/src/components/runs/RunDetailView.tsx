"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, Download, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { TraceIdBadge } from "@/components/observability/TraceIdBadge";
import { TraceTimeline } from "@/components/runs/TraceTimeline";
import { api } from "@/lib/api";
import { formatCostUsd } from "@/lib/format";
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
    status: (event.status as string | undefined) ?? "completed",
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
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
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
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                type="button"
                aria-label="Good result"
                aria-pressed={feedbackGiven === 1}
                title="Good result"
                disabled={feedbackGiven !== null}
                onClick={() => {
                  setFeedbackGiven(1);
                  api
                    .submitFeedback({ run_id: run.id, rating: 1 })
                    .then(() => toast.success("Feedback recorded"))
                    .catch(() => {
                      setFeedbackGiven(null);
                      toast.error("Failed to record feedback");
                    });
                }}
                className={`rounded px-2 py-1 transition-colors ${
                  feedbackGiven === 1 ? "bg-success/15 text-success" : "text-muted hover:text-foreground"
                } focus-ring disabled:cursor-default`}
              >
                <ThumbsUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Bad result"
                aria-pressed={feedbackGiven === -1}
                title="Bad result"
                disabled={feedbackGiven !== null}
                onClick={() => {
                  setFeedbackGiven(-1);
                  api
                    .submitFeedback({ run_id: run.id, rating: -1 })
                    .then(() => toast.success("Feedback recorded"))
                    .catch(() => {
                      setFeedbackGiven(null);
                      toast.error("Failed to record feedback");
                    });
                }}
                className={`rounded px-2 py-1 transition-colors ${
                  feedbackGiven === -1 ? "bg-destructive/15 text-destructive" : "text-muted hover:text-foreground"
                } focus-ring disabled:cursor-default`}
              >
                <ThumbsDown className="h-4 w-4" aria-hidden />
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
                formatCostUsd(metrics.total_cost_usd as number | undefined),
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
        <div className="mb-6 rounded-lg border border-warning/50 bg-surface p-4">
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
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <SectionCard
            title="Input"
            description="Payload used for this run"
            actions={
              <Badge variant="outline">
                {run.input_text.length.toLocaleString()} chars
              </Badge>
            }
          >
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-6 text-foreground/90">
              {run.input_text}
            </p>
          </SectionCard>

          <TraceTimeline
            nodes={nodeResults}
            llmCalls={llmCalls}
            runLive={["pending", "running", "awaiting_approval"].includes(run.status)}
            awaitingResults={
              resultCount === 0 && ["pending", "running"].includes(run.status)
            }
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {evalAggregate != null && (
            <SectionCard
              title="Evaluation"
              actions={
                <>
                  {evalPassed === true && <Badge variant="success">Threshold passed</Badge>}
                  {evalPassed === false && <Badge variant="destructive">Below threshold</Badge>}
                </>
              }
            >
              <EvalScoresChart
                scores={{
                  ...((metrics.eval_scores as EvalScores[] | undefined)?.[0] || {}),
                  aggregate_score: evalAggregate,
                }}
              />
            </SectionCard>
          )}

          {hasGuardrails && (
            <SectionCard title="Guardrails">
              <GuardrailEventsPanel
                events={guardrailEvents}
                failedNodeIds={failedGuardrails}
              />
            </SectionCard>
          )}

          {run.final_output && (
            <SectionCard title="Final output">
              <pre className="text-body whitespace-pre-wrap font-mono">{run.final_output}</pre>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}
