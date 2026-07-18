"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-date";
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
}: {
  workflow: WorkflowListItem;
  stage: WorkflowLifecycleStage;
}) {
  const when = workflow.updated_at
    ? formatRelativeTime(workflow.updated_at)
    : "—";

  return (
    <li>
      <Link
        href={`/workflows/${workflow.id}`}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
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
    </li>
  );
}

function LifecycleColumn({
  stage,
  label,
  description,
  items,
  total,
}: {
  stage: WorkflowLifecycleStage;
  label: string;
  description: string;
  items: WorkflowListItem[];
  total: number;
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
            <WorkflowLifecycleRow key={w.id} workflow={w} stage={stage} />
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
  const total =
    columns.draft.length + columns.in_review.length + columns.published.length;

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3 md:gap-4">
      {LIFECYCLE_STAGES.map(({ id, label, description }) => (
        <LifecycleColumn
          key={id}
          stage={id}
          label={label}
          description={description}
          items={columns[id]}
          total={total}
        />
      ))}
    </div>
  );
}
