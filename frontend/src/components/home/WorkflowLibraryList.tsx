"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pin, Search, SearchX, Trash2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format-date";
import {
  stageTone,
  stageLabel,
  versionLabel,
} from "@/lib/home-desk";
import { toneTextClass } from "@/lib/run-status";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  partitionByLifecycle,
  workflowLifecycleStage,
  type WorkflowLifecycleStage,
} from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

type StageFilter = "all" | "pinned" | WorkflowLifecycleStage;

const PAGE_SIZE = 24;

export function WorkflowLibraryList({
  workflows,
  onTogglePin,
  isPinned,
  initialStage = "all",
}: {
  workflows: WorkflowListItem[];
  onTogglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
  initialStage?: StageFilter;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageFilter>(initialStage);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  // Input doesn't forward a DOM ref (plain function component), so the clear
  // button refocuses through the wrapper instead of getElementById.
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const clearSearch = () => {
    setSearch("");
    searchWrapRef.current?.querySelector("input")?.focus();
  };

  const sortedWorkflows = useMemo(
    () => [...workflows].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
    ),
    [workflows]
  );
  const columns = useMemo(() => partitionByLifecycle(sortedWorkflows), [sortedWorkflows]);

  const pinned = useMemo(() => sortedWorkflows.filter((workflow) => isPinned(workflow.id)), [sortedWorkflows, isPinned]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list =
      stage === "all"
        ? sortedWorkflows
        : stage === "pinned"
          ? pinned
        : stage === "draft"
          ? columns.draft
          : stage === "in_review"
            ? columns.in_review
            : columns.published;

    if (q) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [sortedWorkflows, columns, stage, search, pinned]);

  // Reset pagination when filters change.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [stage, search]);

  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visibleItems.length;

  return (
    <>
      <section id="library" aria-label="Workflow library" className="min-w-0 scroll-mt-6">
        <div className="flex flex-col gap-4 pb-5 sm:flex-row-reverse sm:flex-wrap sm:items-center sm:justify-between">
          <div ref={searchWrapRef} className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              id="workflow-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && search) clearSearch();
              }}
              placeholder="Search workflows…"
              className="scroll-mt-20 pl-9 pr-10 lg:scroll-mt-6"
              aria-label="Search workflows"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear workflow search"
                onClick={clearSearch}
                className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter workflows"
          >
            {([
              { value: "all", label: "All workflows", count: workflows.length },
              { value: "published", label: "Live", count: columns.published.length },
              { value: "in_review", label: "In review", count: columns.in_review.length },
              { value: "draft", label: "Drafts", count: columns.draft.length },
              ...(pinned.length > 0 || stage === "pinned" ? [{ value: "pinned", label: "Pinned", count: pinned.length }] : []),
            ] as { value: StageFilter; label: string; count: number }[]).map(({ value, label, count }) => (
              <button key={value} type="button" aria-pressed={stage === value} onClick={() => setStage(value)} className={cn("focus-ring rounded-md px-3 py-2 text-xs transition-colors", stage === value ? "bg-surface-hover font-medium text-foreground" : "text-muted hover:text-foreground")}>
                {label}{" "}<span className="ml-2 font-mono text-2xs text-subtle tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border bg-surface-input px-4 py-3 pr-20 text-xs text-subtle" aria-hidden>
          <span className="min-w-0 flex-1">Workflow</span>
          <span className="hidden w-20 shrink-0 sm:block">Status</span>
          <span className="hidden w-20 shrink-0 text-right lg:block">Updated</span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              compact
              icon={search.trim() ? SearchX : Workflow}
              title={search.trim() ? "No matching workflows" : "No workflows in this filter"}
              description={
                search.trim()
                  ? `Nothing matches "${search.trim()}" — try a different term.`
                  : stage === "all"
                    ? "The library is empty."
                    : stage === "pinned" ? "Pin a workflow from its row actions to keep it here." : `No ${stage === "in_review" ? "in-review" : stage === "published" ? "live" : "draft"} workflows yet.`
              }
              action={
                <Button variant="outline" size="sm" onClick={() => {
                  setSearch("");
                  setStage("all");
                  // This button unmounts when results return — hand focus to
                  // the search field so keyboard users aren't dumped on body.
                  searchWrapRef.current?.querySelector("input")?.focus();
                }}>
                  Reset filters
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleItems.map((w) => {
              const st = workflowLifecycleStage(w);
              const pinned = isPinned(w.id);
              return (
                <li key={w.id} className="group relative">
                  <Row href={`/workflows/${w.id}`} className="gap-3 py-4 pr-20">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{w.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{w.description || versionLabel(w)}</span>
                      {w.description && <span className="sr-only">{versionLabel(w)}</span>}
                    </span>
                    <span className={cn("sr-only w-20 shrink-0 items-center gap-1.5 text-2xs sm:not-sr-only sm:flex", toneTextClass(stageTone(st)))}>
                      <StatusDot tone={stageTone(st)} />{stageLabel(st)}
                    </span>
                    <span className="hidden w-20 shrink-0 text-right font-mono text-2xs text-subtle tabular-nums lg:block">
                      {w.updated_at ? formatRelativeTime(w.updated_at, now) : "—"}
                    </span>
                  </Row>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={pinned ? `Unpin ${w.name}` : `Pin ${w.name}`}
                      aria-pressed={pinned}
                      onClick={() => onTogglePin(w.id)}
                      className={cn(
                        "rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
                        "focus-ring md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                        pinned && "text-foreground md:opacity-100"
                      )}
                    >
                      <Pin
                        className={cn("h-3.5 w-3.5", pinned && "fill-current")}
                        aria-hidden
                      />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${w.name}`}
                          className="rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
                        >
                          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => onTogglePin(w.id)}
                        >
                          <Pin className="h-3.5 w-3.5" />
                          {pinned ? "Unpin" : "Pin workflow"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteTarget(w)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete workflow
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {remaining > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="text-xs font-medium text-muted transition-colors hover:text-foreground focus-ring"
            >
              Show {Math.min(PAGE_SIZE, remaining)} more
              <span className="ml-1 font-mono text-2xs tabular-nums text-subtle">
                ({remaining} left)
              </span>
            </button>
          </div>
        )}
        </div>
        <p className="mt-3 text-xs text-subtle" aria-live="polite">{filtered.length} {filtered.length === 1 ? "workflow" : "workflows"}{search.trim() ? ` matching “${search.trim()}”` : ""}</p>
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete workflow?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" and its versions will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel={
          deleteTarget ? `Delete '${deleteTarget.name}'` : "Delete workflow"
        }
        loadingLabel="Deleting workflow…"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api.deleteWorkflow(deleteTarget.id);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.observabilitySummary,
              }),
            ]);
            toast.success(`Deleted "${deleteTarget.name}"`);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Failed to delete workflow"
            );
          }
        }}
      />
    </>
  );
}
