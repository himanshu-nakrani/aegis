"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { stageDotClass, stageLabel, versionLabel } from "@/lib/home-desk";
import { workflowLifecycleStage } from "@/lib/workflow-lifecycle";
import { cn } from "@/lib/utils";
import type { WorkflowListItem } from "@/types/workflow";

/**
 * Resume tiles at the top of the desk's main column — the fastest path back
 * into a canvas. Hidden entirely when there is nothing to resume.
 */
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
    <SectionCard
      title="Continue"
      description="Recently opened or updated"
      flush
      actions={
        <span className="font-mono text-2xs text-muted tabular-nums">
          {items.length}
        </span>
      }
    >
      <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ workflow, meta }) => {
          const stage = workflowLifecycleStage(workflow);
          const pinned = isPinned(workflow.id);
          return (
            <li key={workflow.id} className="group relative">
              {/* Bordered card: outset ring reads as a halo around the tile. */}
              <Link
                href={`/workflows/${workflow.id}`}
                className={cn(
                  "block rounded-md border border-border bg-surface-elevated px-3 py-2.5 pr-9 transition-colors",
                  "hover:border-border-strong",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      stageDotClass(stage)
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {workflow.name}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 font-mono text-2xs tabular-nums">
                  <span className="truncate text-subtle">
                    {stageLabel(stage)} · {versionLabel(workflow)}
                  </span>
                  <span className="shrink-0 text-muted">{meta}</span>
                </span>
              </Link>
              <button
                type="button"
                aria-label={pinned ? `Unpin ${workflow.name}` : `Pin ${workflow.name}`}
                onClick={() => onTogglePin(workflow.id)}
                className={cn(
                  "absolute right-1.5 top-1.5 rounded-md p-1 text-muted transition-colors",
                  "hover:bg-surface-hover hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  pinned
                    ? "opacity-100 text-foreground"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                )}
              >
                <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
