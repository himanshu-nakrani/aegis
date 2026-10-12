"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Page } from "@/components/layout/Page";
import { Activity, ClipboardList, Download, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { ApiConnectionState } from "@/components/ui/connection-state";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { OutputBlock } from "@/components/ui/output-block";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatCard } from "@/components/ui/stat-card";
import { EvalScoresChart } from "@/components/results/EvalScoresChart";
import { GuardrailEventsPanel } from "@/components/results/GuardrailEventsPanel";
import { TraceIdBadge } from "@/components/observability/TraceIdBadge";
import { TraceTimeline } from "@/components/runs/TraceTimeline";
import { ExplainFailureCallout } from "@/components/runs/ExplainFailureCallout";
import { ApprovalMetadata, type PendingApprovalMetadata } from "@/components/runs/ApprovalMetadata";
import { DatasetExamples } from "@/components/runs/DatasetExamples";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatCostUsd, formatDurationMs } from "@/lib/format";
import { formatFullTimestamp, formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import type { EvalScores, LlmCall, NodeResult, WorkflowRun } from "@/types/workflow";
import { cn } from "@/lib/utils";

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
  return formatDurationMs(durationMs);
}

/** Total execution attempts. `trace_attempts` is a bounded window, so prefer the
 *  persisted running count and fall back to the window length for older runs. */
function traceAttemptCount(metrics?: Record<string, unknown> | null): number {
  const total = metrics?.trace_attempt_count;
  if (typeof total === "number") return total;
  const window = metrics?.trace_attempts;
  return Array.isArray(window) ? window.length : 0;
}

export function RunDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [traceUiBase, setTraceUiBase] = useState<string | null>(null);
  const [llmCalls, setLlmCalls] = useState<LlmCall[]>([]);
  const [feedbackGiven, setFeedbackGiven] = useState<1 | -1 | null>(null);
  const queryClient = useQueryClient();
  const [selectedDataset, setSelectedDataset] = useState("");
  const [copiedDataset, setCopiedDataset] = useState("");
  const [addingRun, setAddingRun] = useState(false);
  const [queueingReview, setQueueingReview] = useState(false);
  const [queuedForReview, setQueuedForReview] = useState(false);
  useEffect(() => {
    setSelectedDataset("");
    setCopiedDataset("");
    setFeedbackGiven(null);
    setQueuedForReview(false);
  }, [runId]);
  // In-flight approval decision — gates BOTH buttons so a double-click (or an
  // Approve-then-Reject) can't race two contradictory decisions on the gate.
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
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

  // Real span geometry for the true waterfall. Fetched once the run has
  // loaded; refetched when a live run settles into a terminal status so the
  // axis reflects final offsets/durations.
  const runStatus = run?.status;
  const timelineQuery = useQuery({
    queryKey: queryKeys.runTimeline(runId),
    queryFn: () => api.getRunTimeline(runId),
    enabled: Boolean(run),
    retry: 1,
    staleTime: 30_000,
  });
  // Nested trace tree (node → llm_call / tool_call) for the agent-step
  // drill-down; only meaningful once the run is terminal (spans are persisted
  // at finalization), so it is gated on a non-live run.
  const traceQuery = useQuery({
    queryKey: queryKeys.runTrace(runId),
    queryFn: () => api.getRunTrace(runId),
    enabled: Boolean(run),
    retry: 1,
    staleTime: 30_000,
  });
  const workflowId = run?.workflow_id || "";
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets(workflowId),
    queryFn: () => api.listDatasets(workflowId),
    enabled: Boolean(workflowId),
  });
  const refreshDataset = (id: string) => {
    setCopiedDataset(id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workflowId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(id) });
  };
  const { refetch: refetchTimeline } = timelineQuery;
  const { refetch: refetchTrace } = traceQuery;
  useEffect(() => {
    if (!runStatus) return;
    if (["completed", "failed", "cancelled"].includes(runStatus)) {
      refetchTimeline();
      refetchTrace();
    }
  }, [runStatus, refetchTimeline, refetchTrace]);

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

      if (event.type === "approval_required" || event.type === "approval_escalated") {
        const pending = {
          ...(current.metrics_json?.pending_approval as PendingApprovalMetadata | undefined),
          ...event,
          approval_id: typeof event.approval_id === "string" ? event.approval_id : "",
          node_id: String(event.node_id || ""),
          review: String(event.review || (current.metrics_json?.pending_approval as PendingApprovalMetadata | undefined)?.review || ""),
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
  // Debounce reconnect toasts — while the backend is unreachable the stream
  // loops every ~3s; surface the warning at most once per 30s.
  const lastDisconnectToastAt = useRef(0);

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
        const now = Date.now();
        if (now - lastDisconnectToastAt.current >= 30_000) {
          lastDisconnectToastAt.current = now;
          toast.error("Lost connection to run stream");
        }
      }
    );

    return () => {
      stream.close();
      streamAttached.current = false;
    };
  }, [runId, streamableStatus, applyStreamEvent, streamEpoch]);

  if (loading) {
    return <RunDetailSkeleton />;
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
  // metrics_json is untyped API JSON; name the pending-approval shape once.
  const pendingApproval = run.metrics_json?.pending_approval as
    | PendingApprovalMetadata
    | undefined;

  const submitFeedback = (rating: 1 | -1) => {
    setFeedbackGiven(rating);
    api
      .submitFeedback({ run_id: run.id, rating, ...(rating === -1 && selectedDataset ? { dataset_id: selectedDataset } : {}) })
      .then((result) => {
        if (result.dataset) {
          refreshDataset(result.dataset.dataset_id);
          toast.success(`Feedback recorded · ${result.dataset.added ? "added to" : "already in"} ${result.dataset.dataset_name}`);
        } else toast.success("Feedback recorded");
      })
      .catch((error) => {
        setFeedbackGiven(null);
        toast.error(error instanceof Error ? error.message : "Failed to record feedback");
      });
  };

  const queueForReview = async () => {
    if (queueingReview || queuedForReview) return;
    setQueueingReview(true);
    try {
      const result = await api.enqueueAnnotation({ run_id: run.id });
      setQueuedForReview(true);
      void queryClient.invalidateQueries({ queryKey: ["annotation-queue"] });
      toast.success(result.created ? "Run queued for review" : "Run already in review queue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue run for review");
    } finally {
      setQueueingReview(false);
    }
  };


  const addViewedRun = async () => {
    if (addingRun) return;
    setAddingRun(true);
    try {
      const datasetId = selectedDataset || (datasetsQuery.data || []).find((dataset) => dataset.name === "Run examples")?.id || (await api.createDataset(workflowId, "Run examples")).id;
      setSelectedDataset(datasetId);
      const result = await api.addRunToDataset(datasetId, run.id);
      refreshDataset(datasetId);
      toast.success(result.added ? "Run added to dataset" : "Run already in dataset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add run");
    } finally {
      setAddingRun(false);
    }
  };

  const decide = async (approved: boolean) => {
    if (!pendingApproval?.approval_id) return;
    setDeciding(approved ? "approve" : "reject");
    try {
      await api.approveRun(runId, {
        approval_id: pendingApproval.approval_id,
        approved,
        ...(approved ? {} : { comment: "Rejected by reviewer" }),
      });
      setRun((current) =>
        current?.id === run.id &&
        (current.metrics_json?.pending_approval as PendingApprovalMetadata | undefined)?.approval_id === pendingApproval.approval_id
          ? { ...current, status: approved ? "running" : "failed" }
          : current
      );
      if (approved) toast.success("Approval sent");
      else toast.message("Run rejected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : approved ? "Approval failed" : "Rejection failed"
      );
    } finally {
      setDeciding(null);
    }
  };

  const hasSidePanel =
    run.status === "failed" || evalAggregate != null || hasGuardrails;

  return (
    <Page>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {statusAnnouncement || `Run status: ${runStatusLabel(run.status)}`}
      </p>
      <PageHeader
        title="Run details"
        description={<span className="font-mono text-xs text-muted">{run.id}</span>}
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: "Observability", href: "/observability" },
              { label: "Run" },
            ]}
          />
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
            {traceAttemptCount(run.metrics_json) > 1 && (
              <Badge
                variant="outline"
                title="Each resume is a separate, linked trace"
              >
                {traceAttemptCount(run.metrics_json)} execution attempts
              </Badge>
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
          </>
        }
      />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Status" value={runStatusLabel(run.status)} />
          <StatCard label="Duration" value={duration} />
          <StatCard label="Nodes" value={String(metrics.node_count ?? resultCount)} />
          <StatCard
            label="Tokens"
            value={
              typeof metrics.total_tokens === "number" && metrics.total_tokens > 0
                ? metrics.total_tokens.toLocaleString()
                : "—"
            }
          />
          <StatCard
            label="Cost"
            value={formatCostUsd(metrics.total_cost_usd as number | undefined)}
          />
          {/* Aggregates may be 0..1 (normalized) or 1..5 (rubric scale). */}
          <StatCard
            label="Eval"
            value={
              evalAggregate == null
                ? "—"
                : evalAggregate <= 1
                  ? evalAggregate.toFixed(2)
                  : `${evalAggregate.toFixed(2)} / 5`
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-background/20 px-4 py-2.5 font-mono text-xs text-muted">
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
          <span className="ml-auto flex items-center gap-2">
            <span className="font-sans text-2xs uppercase tracking-[0.06em] text-subtle">
              Rate this run
            </span>
            <SegmentedControl
              ariaLabel="Rate this run"
              value={feedbackGiven === 1 ? "up" : feedbackGiven === -1 ? "down" : null}
              onChange={(side) => submitFeedback(side === "up" ? 1 : -1)}
              options={[
                { value: "up", label: "Good result", hideLabel: true, icon: ThumbsUp, disabled: feedbackGiven !== null },
                { value: "down", label: "Bad result", hideLabel: true, icon: ThumbsDown, disabled: feedbackGiven !== null },
              ]}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={queueingReview || queuedForReview}
              onClick={() => void queueForReview()}
            >
              <ClipboardList className="h-4 w-4" />
              {queuedForReview ? "Queued for review" : "Queue for review"}
            </Button>
          </span>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedDataset || "default"} onValueChange={(value) => { setSelectedDataset(value === "default" ? "" : value); setCopiedDataset(""); }}>
              <SelectTrigger size="sm" className="w-64" aria-label="Run dataset target"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default dataset for this workflow</SelectItem>
                {(datasetsQuery.data || []).map((dataset) => <SelectItem key={dataset.id} value={dataset.id}>{dataset.name} ({dataset.item_count})</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={addingRun || !workflowId || !run.input_text.trim() || datasetsQuery.isError || datasetsQuery.isPending} onClick={() => void addViewedRun()}>
              {addingRun ? "Adding…" : "Add run to dataset"}
            </Button>
            {datasetsQuery.isError && <Button variant="outline" size="sm" onClick={() => void datasetsQuery.refetch()}>Retry datasets</Button>}
          </div>
          <p className="text-xs text-subtle">Add uses completed output as expected; failed runs stay unlabelled. Thumbs-down saves an unlabelled example to the selected dataset, or the workflow&apos;s Negative feedback dataset. Existing source runs and labels are retained, not copied twice.</p>
          {(copiedDataset || selectedDataset) && <DatasetExamples datasetId={copiedDataset || selectedDataset} />}
        </div>
      </div>

      {run.status === "awaiting_approval" && (
        <Alert
          variant="warning"
          title="Approval required"
          description={
            <>
              Node{" "}
              <span className="font-medium text-foreground">
                {String(pendingApproval?.node_id || "human_approval")}
              </span>{" "}
              is waiting for your decision.
              <ApprovalMetadata approval={pendingApproval} />
              {pendingApproval?.review && (
                <OutputBlock maxHeight="md" className="mt-2 w-full">
                  {String(pendingApproval.review)}
                </OutputBlock>
              )}
            </>
          }
          actions={
            <>
              <Button disabled={deciding !== null || !pendingApproval?.approval_id} onClick={() => decide(true)}>
                {deciding === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button variant="outline" disabled={deciding !== null || !pendingApproval?.approval_id} onClick={() => decide(false)}>
                {deciding === "reject" ? "Rejecting…" : "Reject"}
              </Button>
            </>
          }
        />
      )}

      {run.final_output && (
        <SectionCard
          title="Final output"
          actions={
            <Badge variant="outline">
              {run.final_output.length.toLocaleString()} chars
            </Badge>
          }
        >
          <OutputBlock copyValue={run.final_output} maxHeight="md">
            {run.final_output}
          </OutputBlock>
        </SectionCard>
      )}

      <div
        className={cn(
          "grid grid-cols-1 gap-5",
          hasSidePanel ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1"
        )}
      >
        <div className="space-y-4">
          <TraceTimeline
            nodes={nodeResults}
            llmCalls={llmCalls}
            timeline={timelineQuery.data}
            trace={traceQuery.data}
            runLive={["pending", "running", "awaiting_approval"].includes(run.status)}
            awaitingResults={
              resultCount === 0 && ["pending", "running"].includes(run.status)
            }
          />

          <SectionCard
            title="Input"
            description="Payload used for this run"
            actions={
              <Badge variant="outline">
                {run.input_text.length.toLocaleString()} chars
              </Badge>
            }
          >
            <OutputBlock maxHeight="md">{run.input_text}</OutputBlock>
          </SectionCard>
        </div>

        {hasSidePanel && (
          <aside className="space-y-4">
            {run.status === "failed" && <ExplainFailureCallout runId={run.id} />}

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
          </aside>
        )}
      </div>
    </Page>
  );
}

/** Layout-accurate loading state: mirrors the header, stat grid, input card,
 *  and the span waterfall (left glyph column + staggered bars) so nothing
 *  reflows when the real data lands. Static under reduced motion via .skeleton. */
function RunDetailSkeleton() {
  // Staggered widths + offsets evoke a real waterfall without faking numbers.
  const bars = [
    { left: 0, width: 34 },
    { left: 30, width: 22 },
    { left: 30, width: 40 },
    { left: 66, width: 20 },
    { left: 82, width: 16 },
  ];
  return (
    <div className="page-container space-y-6" aria-busy="true" aria-label="Loading run…">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-9 w-20" />
          <div className="skeleton h-9 w-24" />
        </div>
      </div>


      {/* Stat grid */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dashboard-panel space-y-2 rounded-lg p-4">
              <div className="skeleton h-3 w-14" />
              <div className="skeleton h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="flex gap-6 rounded-lg border border-border bg-background/20 px-4 py-2.5">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>

      {/* Body: only what every run has. Reserving optional sections (output,
          eval, guardrails) here would shift the loaded page just as much. */}
      <div className="space-y-4">
          {/* Waterfall */}
          <div className="dashboard-panel space-y-3 rounded-lg p-4">
            <div className="skeleton h-4 w-32" />
            {/* Axis tick row */}
            <div className="ml-10 flex justify-between">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-3 w-8" />
              ))}
            </div>
            {bars.map((bar, i) => (
              <div key={i} className="flex items-center gap-3">
                {/* Left glyph column */}
                <div className="flex w-7 shrink-0 justify-center">
                  <div className="skeleton h-7 w-7 rounded-full" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-4 w-40 max-w-full" />
                  {/* Bar on the shared axis */}
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
                    <div
                      className="skeleton absolute inset-y-0 rounded-full"
                      style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input card */}
          <div className="dashboard-panel space-y-3 rounded-lg p-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-16 w-full" />
          </div>
      </div>
    </div>
  );
}
