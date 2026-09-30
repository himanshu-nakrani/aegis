"use client";

import { useId, useState } from "react";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import { actionTone, type NextAction } from "@/lib/home-desk";
import { toneTextClass } from "@/lib/run-status";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

/** Placeholder rows matched to the real row geometry (dot · text · meta). */
function ActionSkeleton() {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2"
      aria-busy="true"
      aria-label="Loading attention items…"
      role="status"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-3 py-2.5 md:[&:nth-child(odd):not(:last-child)]:border-r md:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
        >
          <span className="skeleton h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="skeleton block h-3" style={{ width: `${52 + ((i * 11) % 30)}%` }} />
            <span className="skeleton block h-2.5" style={{ width: `${30 + ((i * 7) % 25)}%` }} />
          </span>
          <span className="skeleton h-2.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function NextActionsPanel({
  actions,
  loading,
  unavailable,
  onRetry,
}: {
  actions: NextAction[];
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const isEmpty = actions.length === 0 && !loading && !unavailable;
  const visibleActions = expanded ? actions : actions.slice(0, 4);
  const urgent = actions.filter(
    (a) => a.kind === "failed" || a.kind === "blocked"
  ).length;
  return (
    <SectionCard
      title="Needs attention"
      description="Recent failures, approvals, alerts, and review backlog"
      flush
      actions={
        actions.length > 0 ? (
          <span className="flex items-baseline gap-1.5 font-mono text-2xs text-muted tabular-nums">
            {urgent > 0 && (
              <span className="text-destructive">
                {urgent} {urgent === 1 ? "failure" : "failures"}
                <span className="text-subtle"> · </span>
              </span>
            )}
            {actions.length} surfaced
          </span>
        ) : null
      }
    >
      {unavailable ? (
        <div className="p-3">
          <InlineQueryError message="Some attention items are unavailable." onRetry={onRetry} />
        </div>
      ) : null}
      {loading ? (
        <ActionSkeleton />
      ) : null}
      {isEmpty ? (
        <div className="p-3">
          <EmptyState
            compact
            icon={CircleCheck}
            title="Nothing in the queue"
            description="No attention items in recent activity."
          />
        </div>
      ) : actions.length > 0 ? (
        <>
          <ul id={listId} className="grid grid-cols-1 md:grid-cols-2">
          {visibleActions.map((action) => (
            <li key={action.id} className="min-w-0 border-b border-border last:border-b-0 md:[&:nth-child(odd):not(:last-child)]:border-r md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
              <Row href={action.href} gutter="rail" className="group h-full min-w-0 gap-3">
                <StatusDot tone={actionTone(action.kind)} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {action.title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-2xs font-semibold",
                        toneTextClass(actionTone(action.kind))
                      )}
                    >
                      {action.status}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-2xs text-subtle">
                    {action.detail}
                  </span>
                </span>
                {action.meta && (
                  <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                    {action.meta}
                  </span>
                )}
                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-foreground"
                  aria-hidden
                />
              </Row>
            </li>
          ))}
          </ul>
          {actions.length > 4 ? (
            <div className="border-t border-border px-3 py-1">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? "Show less" : `Show ${actions.length - 4} more`}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}
