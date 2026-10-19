"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ui/section-card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { OutputBlock } from "@/components/ui/output-block";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type AnnotationFilters, type AnnotationTask } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const RATING_OPTIONS = ["1", "2", "3", "4", "5"];
const STATUS_FILTERS = ["pending", "labeled", "skipped", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const SOURCE_LABELS: Record<string, string> = {
  negative_feedback: "Thumbs-down",
  low_eval: "Low eval",
  failed: "Failed run",
  manual: "Manual review",
};

function excerpt(text: string | null | undefined, max = 280): string {
  const value = (text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

interface LabelDraft {
  expectedOutput: string;
  notes: string;
  rating: string;
  category: string;
  datasetId: string;
}

const EMPTY_DRAFT: LabelDraft = {
  expectedOutput: "",
  notes: "",
  rating: "",
  category: "",
  datasetId: "default",
};

/** Label form for one pending queue item. Mounted only when expanded so each
 * item lazily fetches the datasets of its own workflow. */
function LabelForm({
  task,
  onDone,
}: {
  task: AnnotationTask;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LabelDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets(task.workflow_id),
    queryFn: () => api.listDatasets(task.workflow_id),
  });

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await api.labelAnnotation(task.id, {
        ...(draft.expectedOutput.trim()
          ? { expected_output: draft.expectedOutput }
          : {}),
        ...(draft.notes.trim() ? { notes: draft.notes } : {}),
        ...(draft.rating ? { rating: Number(draft.rating) } : {}),
        ...(draft.category.trim() ? { category: draft.category.trim() } : {}),
        ...(draft.datasetId !== "default" ? { dataset_id: draft.datasetId } : {}),
      });
      // N6: the queue is offset-paginated over a self-mutating list — labeling
      // changes total/order, so a stale higher offset would skip/duplicate
      // rows. resetQueries drops loaded pages and refetches from offset 0.
      await queryClient.resetQueries({ queryKey: ["annotation-queue"] });
      if (result.dataset) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.dataset(result.dataset.dataset_id),
        });
        toast.success(
          `Label saved to ${result.dataset.dataset_name ?? "dataset"}`
        );
      } else {
        toast.success("Label saved");
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save label");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border px-4 py-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          value={draft.datasetId}
          onValueChange={(value) => setDraft((d) => ({ ...d, datasetId: value }))}
        >
          <SelectTrigger size="sm" aria-label="Target dataset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Review queue dataset (default)</SelectItem>
            {(datasetsQuery.data ?? []).map((dataset) => (
              <SelectItem key={dataset.id} value={dataset.id}>
                {dataset.name} ({dataset.item_count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={draft.rating || "none"}
          onValueChange={(value) =>
            setDraft((d) => ({ ...d, rating: value === "none" ? "" : value }))
          }
        >
          <SelectTrigger size="sm" aria-label="Quality rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No rating</SelectItem>
            {RATING_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value} / 5
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={draft.category}
          onChange={(event) =>
            setDraft((d) => ({ ...d, category: event.target.value }))
          }
          placeholder="Category (e.g. wrong_format)"
          aria-label="Label category"
          maxLength={64}
        />
      </div>
      <Textarea
        value={draft.expectedOutput}
        onChange={(event) =>
          setDraft((d) => ({ ...d, expectedOutput: event.target.value }))
        }
        placeholder="Expected output — when set, the labeled row is written to the target dataset"
        aria-label="Expected output"
        rows={4}
      />
      <Textarea
        value={draft.notes}
        onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
        placeholder="Notes (optional)"
        aria-label="Review notes"
        rows={2}
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={submitting}>
          {submitting ? "Saving…" : "Save label"}
        </Button>
      </div>
    </div>
  );
}

function QueueItem({
  task,
  expanded,
  onToggleLabel,
}: {
  task: AnnotationTask;
  expanded: boolean;
  onToggleLabel: () => void;
}) {
  const queryClient = useQueryClient();
  const [skipping, setSkipping] = useState(false);
  const pending = task.status === "pending";

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await api.skipAnnotation(task.id);
      // N6: same self-mutating-list fix as label — reset drops loaded pages
      // and refetches from offset 0 so a shifted offset can't skip/duplicate.
      await queryClient.resetQueries({ queryKey: ["annotation-queue"] });
      toast.message("Task skipped");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to skip task");
    } finally {
      setSkipping(false);
    }
  };

  return (
    <li>
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {task.run && (
              <Badge variant={runStatusVariant(task.run.status)}>
                {runStatusLabel(task.run.status)}
              </Badge>
            )}
            <Badge variant="outline">
              {SOURCE_LABELS[task.created_by] ?? task.created_by}
            </Badge>
            {task.status !== "pending" && (
              <Badge variant={task.status === "labeled" ? "success" : "outline"}>
                {task.status}
              </Badge>
            )}
            {task.workflow_name && (
              <span className="truncate text-sm font-medium text-foreground">
                {task.workflow_name}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {excerpt(task.run?.input_text, 140) || "Run input unavailable"}
          </p>
          <p className="mt-0.5 font-mono text-2xs text-subtle">
            {task.created_at && (
              <time dateTime={task.created_at}>
                {formatRelativeTime(task.created_at)}
              </time>
            )}
            {typeof task.run?.eval_aggregate === "number" &&
              ` · eval ${task.run.eval_aggregate.toFixed(2)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={`/runs/${task.run_id}`}
            className="focus-ring text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            View run
          </Link>
          {pending && (
            <>
              <Button variant="outline" size="sm" onClick={onToggleLabel}>
                {expanded ? "Close" : "Label"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void skip()}
                disabled={skipping}
              >
                {skipping ? "Skipping…" : "Skip"}
              </Button>
            </>
          )}
        </div>
      </div>
      {task.run?.final_output && (
        <div className="px-4 pb-3">
          <OutputBlock maxHeight="sm">{excerpt(task.run.final_output, 2000)}</OutputBlock>
        </div>
      )}
      {expanded && pending && <LabelForm task={task} onDone={onToggleLabel} />}
      {!pending && task.expected_output && (
        <div className="px-4 pb-3">
          <p className="mb-1 font-mono text-2xs uppercase tracking-wide text-subtle">
            Labeled expected output
          </p>
          <OutputBlock maxHeight="sm">{task.expected_output}</OutputBlock>
        </div>
      )}
    </li>
  );
}

/** Runs staged for a human label before they join a golden dataset. Fed by
 * thumbs-down feedback, low-eval/failed capture and manual "queue for review". */
export function AnnotationQueue() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const filters = useMemo<Omit<AnnotationFilters, "offset">>(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      workflow_id: workflowFilter === "all" ? undefined : workflowFilter,
      unlabeled_first: statusFilter === "all",
      limit: PAGE_SIZE,
    }),
    [statusFilter, workflowFilter]
  );
  const filtersHash = JSON.stringify(filters);

  // Offset paging: the backend applies offset+limit server-side
  // (GET /api/annotation/queue), so older reviews stay reachable via
  // "Load more" instead of being cut off at the first page.
  const queueQuery = useInfiniteQuery({
    queryKey: queryKeys.annotationQueue(filtersHash),
    queryFn: ({ pageParam }) =>
      api.listAnnotationQueue({ ...filters, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.items.length < PAGE_SIZE
        ? undefined
        : allPages.reduce((sum, page) => sum + page.items.length, 0),
    placeholderData: (prev) => prev,
  });
  const workflowsQuery = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: api.listWorkflows,
  });
  const bulkCapture = useMutation({
    // O10: stage recent failed / low-eval runs for review in one click. Backend
    // accepts `workflow_id` + `filter` (failed|low_eval) + a `limit` cap.
    mutationFn: (filter: "failed" | "low_eval") =>
      api.enqueueAnnotation({
        workflow_id: workflowFilter !== "all" ? workflowFilter : "",
        filter,
        limit: 20,
      }),
    onSuccess: async (result) => {
      // N6: the bulk enqueue mutates the queue — reset so stale offsets go.
      await queryClient.resetQueries({ queryKey: ["annotation-queue"] });
      const bulk = result as { enqueued?: number; already_queued?: number };
      toast.success(
        bulk.enqueued !== undefined
          ? `Queued ${bulk.enqueued} run${bulk.enqueued === 1 ? "" : "s"} for review`
          : "Runs queued"
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Capture failed"),
  });

  const tasks = queueQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = queueQuery.data?.pages[0]?.total ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5" role="group" aria-label="Queue status filter">
          {STATUS_FILTERS.map((value) => (
            <FilterChip
              key={value}
              label={value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
              active={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            />
          ))}
        </div>
        <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
          <SelectTrigger size="sm" className="w-56" aria-label="Workflow filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workflows</SelectItem>
            {(workflowsQuery.data ?? []).map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SectionCard
        title="Review queue"
        flush
        actions={
          <div className="flex items-center gap-2">
            {/* O10: bulk-stage recent failed / low-eval runs for review */}
            {(["failed", "low_eval"] as const).map((filter) => (
              <Button
                key={filter}
                variant="outline"
                size="sm"
                disabled={bulkCapture.isPending || workflowFilter === "all"}
                title={
                  workflowFilter === "all"
                    ? "Pick a workflow to bulk-capture runs"
                    : filter === "failed"
                      ? "Queue recent failed runs"
                      : "Queue recent low-eval runs"
                }
                onClick={() => bulkCapture.mutate(filter)}
              >
                {bulkCapture.isPending ? "Queueing…" : filter === "failed" ? "Failed" : "Low eval"}
              </Button>
            ))}
            <span className="font-mono text-2xs text-muted tabular-nums">
              {queueQuery.isPending
                ? "…"
                : `${total} items${tasks.length < total ? ` · showing ${tasks.length}` : ""}`}
            </span>
          </div>
        }
      >
        {queueQuery.isPending ? (
          <div className="px-4 py-6">
            <LoadingState variant="inline" label="Loading review queue…" />
          </div>
        ) : queueQuery.isError ? (
          <div className="p-3">
            <InlineQueryError
              message="The review queue could not be loaded."
              detail={
                queueQuery.error instanceof Error ? queueQuery.error.message : undefined
              }
              onRetry={() => void queueQuery.refetch()}
            />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={ClipboardList}
              title="Nothing to review"
              description="Thumbs-down feedback and queued runs will appear here for labeling."
            />
          </div>
        ) : (
          <>
            <ul className={cn("divide-y divide-border")}>
              {tasks.map((task) => (
                <QueueItem
                  key={task.id}
                  task={task}
                  expanded={expandedId === task.id}
                  onToggleLabel={() =>
                    setExpandedId((current) => (current === task.id ? null : task.id))
                  }
                />
              ))}
            </ul>
            {queueQuery.hasNextPage && (
              <div className="flex justify-center border-t border-border px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void queueQuery.fetchNextPage()}
                  disabled={queueQuery.isFetchingNextPage}
                >
                  {queueQuery.isFetchingNextPage ? "Loading…" : `Load more (${tasks.length} of ${total})`}
                </Button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
