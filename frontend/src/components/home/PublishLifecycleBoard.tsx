"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-date";
import {
  LIFECYCLE_STAGES,
  type WorkflowLifecycleStage,
} from "@/lib/workflow-lifecycle";
import type { WorkflowListItem } from "@/types/workflow";

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
          "group block rounded-md px-2.5 py-2.5 transition-colors",
          "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              stage === "published" && "bg-success/80",
              stage === "in_review" && "bg-warning/80",
              stage === "draft" && "bg-muted/80"
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
              {workflow.name}
            </p>
            <p className="mt-0.5 truncate font-mono text-2xs text-muted">
              {versionLabel(workflow, stage)}
              <span className="text-subtle"> · </span>
              {when}
              {workflow.is_external && (
                <>
                  <span className="text-subtle"> · </span>
                  external
                </>
              )}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function LifecycleColumn({
  stage,
  label,
  description,
  items,
}: {
  stage: WorkflowLifecycleStage;
  label: string;
  description: string;
  items: WorkflowListItem[];
}) {
  return (
    <section
      className="flex min-h-[280px] min-w-0 flex-col rounded-lg border border-border bg-surface shadow-elev-1"
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
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-subtle">None</p>
      ) : (
        <ul className="max-h-[min(60vh,520px)] flex-1 space-y-0.5 overflow-y-auto p-1.5 [scrollbar-width:thin]">
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
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {LIFECYCLE_STAGES.map(({ id, label, description }) => (
        <LifecycleColumn
          key={id}
          stage={id}
          label={label}
          description={description}
          items={columns[id]}
        />
      ))}
    </div>
  );
}
