"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Waypoints } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/format-date";
import { runStatusLabel, runStatusVariant } from "@/lib/run-status";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { api, type TraceSearchFilters, type TraceSearchHit } from "@/lib/api";

const PAGE_SIZE = 50;

const KIND_OPTIONS = [
  "node",
  "agent_step",
  "tool_call",
  "llm_call",
  "guardrail",
  "eval",
];

const STATUS_OPTIONS = ["completed", "failed", "cancelled", "blocked", "warn"];

interface DraftFilters {
  workflowId: string;
  source: string;
  kind: string;
  status: string;
  model: string;
  nodeId: string;
  minLatency: string;
  maxLatency: string;
  minTokens: string;
  maxTokens: string;
}

const EMPTY_DRAFT: DraftFilters = {
  workflowId: "all",
  source: "all",
  kind: "any",
  status: "any",
  model: "",
  nodeId: "",
  minLatency: "",
  maxLatency: "",
  minTokens: "",
  maxTokens: "",
};

function toApiFilters(draft: DraftFilters, offset: number): TraceSearchFilters {
  const num = (s: string) => {
    const n = Number(s);
    return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
  };
  return {
    workflow_id: draft.workflowId !== "all" ? draft.workflowId : undefined,
    source: (draft.source as TraceSearchFilters["source"]) || "all",
    kind: draft.kind !== "any" ? draft.kind : undefined,
    status: draft.status !== "any" ? draft.status : undefined,
    model: draft.model.trim() || undefined,
    node_id: draft.nodeId.trim() || undefined,
    min_latency_ms: num(draft.minLatency),
    max_latency_ms: num(draft.maxLatency),
    min_tokens: num(draft.minTokens),
    max_tokens: num(draft.maxTokens),
    limit: PAGE_SIZE,
    offset,
  };
}

/** Stable string for the query key — order-independent. */
function filtersHash(filters: TraceSearchFilters): string {
  return JSON.stringify(
    Object.keys(filters)
      .sort()
      .map((k) => [k, (filters as Record<string, unknown>)[k]])
  );
}

function HitRow({ hit }: { hit: TraceSearchHit }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xs uppercase tracking-wide text-subtle">
            {hit.record === "llm_call" ? "llm" : hit.kind}
          </span>
          <p className="truncate text-sm font-medium text-foreground">{hit.name}</p>
          {hit.status && (
            <Badge variant={runStatusVariant(hit.status)}>
              {runStatusLabel(hit.status)}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {hit.workflow_name}
          {hit.node_id ? ` · ${hit.node_id}` : ""}
          {hit.model ? ` · ${hit.model}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-2xs text-subtle tabular-nums">
          {hit.latency_ms != null ? `${hit.latency_ms}ms` : "—"}
          {hit.total_tokens != null ? ` · ${hit.total_tokens} tok` : ""}
        </span>
        <span className="hidden font-mono text-2xs text-subtle sm:inline">
          {hit.created_at ? formatRelativeTime(hit.created_at) : ""}
        </span>
        <Link
          href={`/runs/${hit.run_id}`}
          className="focus-ring text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          Open trace
        </Link>
      </div>
    </li>
  );
}

export function TraceSearch() {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<DraftFilters | null>(null);
  const [offset, setOffset] = useState(0);

  const { data: workflows = [] } = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: api.listWorkflows,
  });

  const filters = useMemo(
    () => (applied ? toApiFilters(applied, offset) : null),
    [applied, offset]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: queryKeys.traceSearch(filters ? filtersHash(filters) : "idle"),
    queryFn: () => api.searchObservabilitySpans(filters ?? {}),
    enabled: filters !== null,
    placeholderData: (prev) => prev,
  });

  const set = (patch: Partial<DraftFilters>) =>
    setDraft((cur) => ({ ...cur, ...patch }));

  const submit = () => {
    setOffset(0);
    setApplied({ ...draft });
  };

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(null);
    setOffset(0);
  };

  const total = data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <SectionCard
      title="Trace search"
      flush
      actions={
        <span className="font-mono text-2xs text-muted tabular-nums">
          {filters ? `${total} hits` : ""}
        </span>
      }
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Select
          value={draft.workflowId}
          onValueChange={(v) => set({ workflowId: v })}
        >
          <SelectTrigger size="sm" className="w-44" aria-label="Workflow">
            <SelectValue placeholder="All workflows" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workflows</SelectItem>
            {workflows.map((wf) => (
              <SelectItem key={wf.id} value={wf.id}>
                {wf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={draft.source} onValueChange={(v) => set({ source: v })}>
          <SelectTrigger size="sm" className="w-32" aria-label="Record type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Spans + calls</SelectItem>
            <SelectItem value="spans">Spans only</SelectItem>
            <SelectItem value="llm_calls">LLM calls only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={draft.kind} onValueChange={(v) => set({ kind: v })}>
          <SelectTrigger size="sm" className="w-32" aria-label="Span kind">
            <SelectValue placeholder="Any kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any kind</SelectItem>
            {KIND_OPTIONS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={draft.status} onValueChange={(v) => set({ status: v })}>
          <SelectTrigger size="sm" className="w-32" aria-label="Status">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          size="sm"
          value={draft.model}
          onChange={(e) => set({ model: e.target.value })}
          placeholder="model…"
          aria-label="Model"
          className="w-36"
        />
        <Input
          size="sm"
          value={draft.nodeId}
          onChange={(e) => set({ nodeId: e.target.value })}
          placeholder="node id…"
          aria-label="Node id"
          className="w-28"
        />
        <span className="flex items-center gap-1">
          <Input
            size="sm"
            type="number"
            min={0}
            value={draft.minLatency}
            onChange={(e) => set({ minLatency: e.target.value })}
            placeholder="min ms"
            aria-label="Min latency ms"
            className="w-20"
          />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <Input
            size="sm"
            type="number"
            min={0}
            value={draft.maxLatency}
            onChange={(e) => set({ maxLatency: e.target.value })}
            placeholder="max ms"
            aria-label="Max latency ms"
            className="w-20"
          />
        </span>
        <span className="flex items-center gap-1">
          <Input
            size="sm"
            type="number"
            min={0}
            value={draft.minTokens}
            onChange={(e) => set({ minTokens: e.target.value })}
            placeholder="min tok"
            aria-label="Min tokens"
            className="w-20"
          />
          <span className="text-muted" aria-hidden>
            –
          </span>
          <Input
            size="sm"
            type="number"
            min={0}
            value={draft.maxTokens}
            onChange={(e) => set({ maxTokens: e.target.value })}
            placeholder="max tok"
            aria-label="Max tokens"
            className="w-20"
          />
        </span>

        {/* Action pinned to the bar's end so a wrapped row never strands the
            submit button mid-line, away from the filters it applies. */}
        <span className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            onClick={submit}
            disabled={isFetching}
            className="gap-1.5"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            Search
          </Button>
          {applied && (
            <Button size="sm" variant="ghost" onClick={clear}>
              Clear
            </Button>
          )}
        </span>
      </div>

      {/* Results */}
      {!applied ? (
        <EmptyState
          compact
          icon={Waypoints}
          title="Search every span and model call"
          description="Filter by workflow, node, kind, status, latency, model, or tokens — across all runs, then open the run's trace."
        />
      ) : isLoading ? (
        <LoadingState variant="list" label="Searching traces…" />
      ) : isError ? (
        <div className="px-4 py-3">
          <InlineQueryError
            message="Trace search failed."
            onRetry={() => void refetch()}
          />
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          compact
          icon={Search}
          title="No matching records"
          description="Loosen a filter — the search only covers recorded spans and model calls."
        />
      ) : (
        <>
          <ul
            className={cn(
              "divide-y divide-border",
              isFetching && "opacity-60 transition-opacity"
            )}
          >
            {data?.items.map((hit) => (
              <HitRow key={`${hit.record}:${hit.id}`} hit={hit} />
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="font-mono text-2xs text-subtle tabular-nums">
              {pageStart}–{pageEnd} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={!canPrev || isFetching}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canNext || isFetching}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
