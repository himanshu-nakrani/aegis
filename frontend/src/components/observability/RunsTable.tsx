"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { VirtualList } from "@/components/ui/virtual-list";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";
import { RunColumnHeader, StreamRunRow, type RecentRun } from "./run-row";

const ROW_HEIGHT = 48;
export type RunFilter = "all" | "failed" | "running";
const filters: { value: RunFilter; label: string }[] = [
  { value: "all", label: "All runs" },
  { value: "failed", label: "Issues" },
  { value: "running", label: "Active" },
];

interface RunsTableProps {
  runs: RecentRun[];
  search: string;
  onSearchChange: (value: string) => void;
  isSearchResults: boolean;
  totalRunCount: number;
  recentCount: number;
  loading?: boolean;
  filter: RunFilter;
  onFilterChange: (value: RunFilter) => void;
}

export function RunsTable({ runs, search, onSearchChange, isSearchResults, totalRunCount, recentCount, loading = false, filter, onFilterChange }: RunsTableProps) {
  const items = useMemo(() => {
    if (filter === "all") return runs;
    if (filter === "running") return runs.filter((run) => ["running", "pending", "queued", "awaiting_approval"].includes(run.status));
    return runs.filter((run) => run.status === "failed" || run.status === "cancelled" || run.guardrail_blocked || run.eval_passed === false);
  }, [runs, filter]);
  const countLabel = filter !== "all"
    ? `${items.length} of ${runs.length} ${isSearchResults ? "matches" : "recent runs"}`
    : isSearchResults ? `${runs.length} matching runs`
    : recentCount < totalRunCount ? `${recentCount} most recent of ${totalRunCount} runs`
    : `${recentCount} ${recentCount === 1 ? "run" : "runs"}`;

  return (
    <section aria-label="Run history" className="min-w-0">
      <div className="flex flex-col justify-between gap-4 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1" role="group" aria-label="Filter runs">
          {filters.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilterChange(value)} className={cn("focus-ring rounded-md px-3 py-2 text-sm transition-colors", filter === value ? "bg-surface-hover font-medium text-foreground" : "text-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <Input size="sm" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search run inputs…" aria-label="Search all runs" className="pl-9" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <RunColumnHeader runs={loading ? undefined : items} />
        {loading ? <TableSkeleton rows={6} rowHeight={ROW_HEIGHT} label="Loading runs…" /> : (
          <VirtualList items={items} itemHeight={ROW_HEIGHT} maxHeight={480} getItemKey={(run) => run.run_id} renderItem={(run) => <StreamRunRow run={run} />} emptyState={
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-foreground">{isSearchResults ? "No matching runs" : filter === "failed" ? "No issues in recent runs" : filter === "running" ? "No active runs" : "No runs recorded"}</p>
              <p className="mt-2 text-xs text-muted">{isSearchResults ? "Try another search or switch the status filter." : filter === "failed" ? "Failed, blocked, and unsuccessful evaluations appear here." : filter === "running" ? "In-progress runs and pending approvals appear here." : "Run a workflow to start recording activity."}</p>
            </div>
          } />
        )}
      </div>
      <p className="mt-3 text-xs text-subtle" aria-live="polite">{countLabel}</p>
    </section>
  );
}
