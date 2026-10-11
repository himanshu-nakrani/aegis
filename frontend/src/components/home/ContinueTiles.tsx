"use client";
import Link from "next/link";
import { ArrowUpRight, Pin } from "lucide-react";
import { stageLabel, stageTone, versionLabel } from "@/lib/home-desk";
import { toneTextClass } from "@/lib/run-status";
import { workflowLifecycleStage } from "@/lib/workflow-lifecycle";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/status-dot";
import type { WorkflowListItem } from "@/types/workflow";

export function ContinueTiles({
  items,
  onTogglePin,
  isPinned,
}: {
  items: Array<{ workflow: WorkflowListItem; meta: string }>;
  onTogglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Continue building">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Continue building</h2>
          <p className="mt-0.5 text-xs text-muted">Pick up where you left off</p>
        </div>
        <Link href="#library" className="focus-ring shrink-0 rounded text-xs text-muted hover:text-foreground">
          All workflows
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {items.map(({ workflow, meta }) => {
          const stage = workflowLifecycleStage(workflow);
          const pinned = isPinned(workflow.id);
          return (
            <li key={workflow.id} className="min-w-0">
              <div className="relative h-full">
                <Link
                  href={`/workflows/${workflow.id}`}
                  className="surface-card group block h-full min-w-0 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:p-4"
                >
                  <span className="flex items-center gap-1.5 pr-9">
                    <StatusDot tone={stageTone(stage)} />
                    <span
                      className={cn(
                        "truncate text-2xs font-semibold",
                        toneTextClass(stageTone(stage))
                      )}
                    >
                      {stageLabel(stage)}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-sm font-semibold tracking-tight text-foreground">
                    {workflow.name}
                  </span>
                  {workflow.description ? (
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted">
                      {workflow.description}
                    </span>
                  ) : null}
                  <span className="mt-2.5 flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate font-mono text-2xs text-subtle tabular-nums">
                      {versionLabel(workflow)}
                      {meta ? ` · ${meta}` : ""}
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-foreground"
                      aria-hidden
                    />
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={pinned ? `Unpin ${workflow.name}` : `Pin ${workflow.name}`}
                  aria-pressed={pinned}
                  onClick={() => onTogglePin(workflow.id)}
                  className={cn(
                    "absolute right-2 top-2 rounded-md p-2 text-muted transition-colors",
                    "hover:bg-surface-hover hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    pinned && "text-foreground"
                  )}
                >
                  <Pin className={cn("h-4 w-4", pinned && "fill-current")} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
