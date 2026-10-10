"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pin, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
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
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  partitionByLifecycle,
  workflowLifecycleStage,
  type WorkflowLifecycleStage,
} from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

type StageFilter = "all" | WorkflowLifecycleStage;

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

  const sortedWorkflows = useMemo(
    () => [...workflows].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
    ),
    [workflows]
  );
  const columns = useMemo(() => partitionByLifecycle(sortedWorkflows), [sortedWorkflows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list =
      stage === "all"
        ? sortedWorkflows
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
  }, [sortedWorkflows, columns, stage, search]);

  // Reset pagination when filters change.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [stage, search]);

  const visibleItems = filtered.slice(0, visible);
  const remaining = filtered.length - visibleItems.length;

  return (
    <>
      <SectionCard
        id="library"
        title="Workflow library"
        description="Search, filter, and open your graphs."
        flush
        actions={
          <span className="font-mono text-2xs text-muted tabular-nums">
            {filtered.length}
            <span className="text-subtle"> / </span>
            {workflows.length}
          </span>
        }
      >
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="relative w-full max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              id="workflow-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="scroll-mt-20 pl-9 pr-10 lg:scroll-mt-6"
              aria-label="Search workflows"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear workflow search"
                onClick={() => {
                  setSearch("");
                  document.getElementById("workflow-search")?.focus();
                }}
                className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by lifecycle stage"
          >
            <FilterChip
              label={`All ${workflows.length}`}
              active={stage === "all"}
              onClick={() => setStage("all")}
            />
            <FilterChip
              label={`Live ${columns.published.length}`}
              active={stage === "published"}
              onClick={() => setStage("published")}
            />
            <FilterChip
              label={`In review ${columns.in_review.length}`}
              active={stage === "in_review"}
              onClick={() => setStage("in_review")}
            />
            <FilterChip
              label={`Drafts ${columns.draft.length}`}
              active={stage === "draft"}
              onClick={() => setStage("draft")}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              compact
              title={search.trim() ? "No matching workflows" : "No workflows in this filter"}
              description={search.trim() ? "Try a different search term." : undefined}
              action={
                <Button variant="outline" size="sm" onClick={() => {
                  setSearch("");
                  setStage("all");
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
                  <Row href={`/workflows/${w.id}`} className="pr-20">
                    <StatusDot tone={stageTone(st)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {w.name}
                      </span>
                      <span className="block truncate font-mono text-2xs text-subtle tabular-nums">
                        {stageLabel(st)}
                        {" · "}
                        {versionLabel(w)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                      {w.updated_at ? formatRelativeTime(w.updated_at, now) : "—"}
                    </span>
                  </Row>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={pinned ? `Unpin ${w.name}` : `Pin ${w.name}`}
                      onClick={() => onTogglePin(w.id)}
                      className={cn(
                        "rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        pinned && "text-foreground"
                      )}
                    >
                      <Pin
                        className={cn("h-3.5 w-3.5", pinned && "fill-current")}
                      />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${w.name}`}
                          className="rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => onTogglePin(w.id)}
                        >
                          <Pin className="h-3.5 w-3.5" />
                          {pinned ? "Unpin" : "Pin to desk"}
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
              className="text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Show {Math.min(PAGE_SIZE, remaining)} more
              <span className="ml-1 font-mono text-2xs tabular-nums text-subtle">
                ({remaining} left)
              </span>
            </button>
          </div>
        )}
      </SectionCard>

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
