"use client";

import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { actionTone, type NextAction } from "@/lib/home-desk";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineQueryError } from "@/components/ui/inline-error";
import { LoadingState } from "@/components/ui/loading-state";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";

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
  return (
    <SectionCard
      title="Needs attention"
      description="Recent failures, approvals, alerts, and review backlog"
      flush
      actions={
        actions.length > 0 ? (
          <span className="font-mono text-2xs text-muted tabular-nums">
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
        <div className="px-3 py-4">
          <LoadingState variant="inline" label="Loading attention items…" />
        </div>
      ) : null}
      {isEmpty ? (
        <div className="p-3">
          <EmptyState
            compact
            title="Nothing in the queue"
            description="No attention items in recent activity."
          />
        </div>
      ) : actions.length > 0 ? (
        <>
          <ul id={listId} className="grid grid-cols-1 md:grid-cols-2">
          {visibleActions.map((action) => (
            <li key={action.id} className="min-w-0 border-b border-border last:border-b-0 md:odd:border-r md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
              <Row href={action.href} gutter="rail" className="group h-full min-w-0 gap-3">
                <StatusDot tone={actionTone(action.kind)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {action.title}
                  </span>
                  <span className="line-clamp-2 text-2xs text-subtle">
                    {action.detail}
                  </span>
                </span>
                {action.meta && (
                  <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                    {action.meta}
                  </span>
                )}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
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
