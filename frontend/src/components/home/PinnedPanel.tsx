"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/lib/format-date";
import { stageDotClass, versionLabel } from "@/lib/home-desk";
import { workflowLifecycleStage } from "@/lib/workflow-lifecycle";
import { cn } from "@/lib/utils";
import type { WorkflowListItem } from "@/types/workflow";

/**
 * Pinned shortcuts in the desk rail. Hidden entirely when nothing is pinned —
 * pinning is discoverable from the library and Continue tiles, and an empty
 * card here would just push the activity feed down.
 */
export function PinnedPanel({
  pinned,
  onTogglePin,
}: {
  pinned: WorkflowListItem[];
  onTogglePin: (id: string) => void;
}) {
  const now = useNow();

  if (pinned.length === 0) return null;

  return (
    <SectionCard
      title="Pinned"
      description="Your shortcuts"
      flush
      actions={
        <span className="font-mono text-2xs text-muted tabular-nums">
          {pinned.length}
        </span>
      }
    >
      <ul className="divide-y divide-border">
        {pinned.map((w) => {
          const stage = workflowLifecycleStage(w);
          return (
            <li key={w.id} className="group relative">
              {/* Flush list row: inset ring keeps the focus halo inside the card edge. */}
              <Link
                href={`/workflows/${w.id}`}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 pr-10 transition-colors",
                  "hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stageDotClass(stage))}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {w.name}
                </span>
                <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                  {w.updated_at ? formatRelativeTime(w.updated_at, now) : versionLabel(w)}
                </span>
              </Link>
              <button
                type="button"
                aria-label={`Unpin ${w.name}`}
                onClick={() => onTogglePin(w.id)}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-foreground transition-colors",
                  "hover:bg-surface-hover",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                )}
              >
                <Pin className="h-3.5 w-3.5 fill-current" />
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
