"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-date";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LIFECYCLE_STAGES,
  type WorkflowLifecycleStage,
} from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

/** One-line contextual hint shown in a column's ghost when it is empty. */
const EMPTY_HINTS: Record<WorkflowLifecycleStage, string> = {
  draft: "Saved but unversioned workflows land here",
  in_review: "Versioned workflows await publish here",
  published: "Live workflows served by the Invoke API",
};

/** Share-bar fill token per stage (pure divs, no chart lib). */
const SHARE_FILL: Record<WorkflowLifecycleStage, string> = {
  draft: "bg-muted/40",
  in_review: "bg-warning/60",
  published: "bg-success/60",
};

function versionLabel(w: WorkflowListItem, stage: WorkflowLifecycleStage): string {
  if (stage === "draft") return "unsaved";
  if (w.latest_version_number != null) {
    return stage === "published"
      ? `live · v${w.latest_version_number}`
      : `v${w.latest_version_number}`;
  }
  return stage === "published" ? "live" : "saved";
}

function WorkflowLifecycleRow({
  workflow,
  stage,
  onDelete,
}: {
  workflow: WorkflowListItem;
  stage: WorkflowLifecycleStage;
  onDelete: (workflow: WorkflowListItem) => void;
}) {
  const now = useNow();
  const when = workflow.updated_at
    ? formatRelativeTime(workflow.updated_at, now)
    : "—";

  return (
    <li className="group relative">
      <Link
        href={`/workflows/${workflow.id}`}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 pr-8 transition-colors",
          "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            stage === "published" && "bg-success/80",
            stage === "in_review" && "bg-warning/80",
            stage === "draft" && "bg-muted/80"
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {workflow.name}
        </span>
        <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
          {versionLabel(workflow, stage)}
        </span>
        <span className="shrink-0 font-mono text-2xs text-subtle tabular-nums">{when}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${workflow.name}`}
            className="focus-ring absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(workflow)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete workflow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function LifecycleColumn({
  stage,
  label,
  description,
  items,
  total,
  onDelete,
}: {
  stage: WorkflowLifecycleStage;
  label: string;
  description: string;
  items: WorkflowListItem[];
  total: number;
  onDelete: (workflow: WorkflowListItem) => void;
}) {
  const share = total > 0 ? (items.length / total) * 100 : 0;

  return (
    <section
      className="flex min-w-0 flex-col self-start rounded-lg border border-border bg-surface shadow-elev-1"
      aria-labelledby={`lifecycle-${stage}-heading`}
    >
      <header className="border-b border-border px-3 py-3 sm:px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            id={`lifecycle-${stage}-heading`}
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            {label}
          </h2>
          <span className="font-mono text-2xs text-muted tabular-nums">{items.length}</span>
        </div>
        <p className="mt-0.5 text-2xs text-subtle">{description}</p>
        {/* Hairline share bar — this column's fraction of the total library. */}
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className={cn("h-full rounded-full", SHARE_FILL[stage])}
            style={{ width: `${share}%` }}
            aria-hidden
          />
        </div>
      </header>

      {items.length === 0 ? (
        <div className="p-1.5">
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-2xs leading-5 text-subtle">
            {EMPTY_HINTS[stage]}
          </p>
        </div>
      ) : (
        <ul className="max-h-[min(60vh,520px)] space-y-0.5 overflow-y-auto p-1.5 [scrollbar-width:thin]">
          {items.map((w) => (
            <WorkflowLifecycleRow key={w.id} workflow={w} stage={stage} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PublishLifecycleBoard({
  columns,
}: {
  columns: Record<WorkflowLifecycleStage, WorkflowListItem[]>;
}) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);

  const total =
    columns.draft.length + columns.in_review.length + columns.published.length;

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3 md:gap-4">
        {LIFECYCLE_STAGES.map(({ id, label, description }) => (
          <LifecycleColumn
            key={id}
            stage={id}
            label={label}
            description={description}
            items={columns[id]}
            total={total}
            onDelete={setDeleteTarget}
          />
        ))}
      </div>

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
