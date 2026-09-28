"use client";

import { actionTone, type NextAction } from "@/lib/home-desk";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Row } from "@/components/ui/row";
import { StatusDot } from "@/components/ui/status-dot";

export function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  return (
    <SectionCard
      title="Next"
      description="Failures, approvals, alerts, review backlog"
      flush
      actions={
        actions.length > 0 ? (
          <span className="font-mono text-2xs text-muted tabular-nums">
            {actions.length}
          </span>
        ) : null
      }
    >
      {actions.length === 0 ? (
        <div className="p-3">
          <EmptyState
            compact
            title="Nothing in the queue"
            description="Runs and review items will land here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {actions.map((action) => (
            <li key={action.id}>
              <Row href={action.href} gutter="rail" className="group gap-3">
                <StatusDot tone={actionTone(action.kind)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {action.title}
                  </span>
                  <span className="block truncate text-2xs text-subtle">
                    {action.detail}
                  </span>
                </span>
                {action.meta && (
                  <span className="shrink-0 font-mono text-2xs text-muted tabular-nums">
                    {action.meta}
                  </span>
                )}
                <span className="shrink-0 text-2xs text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Open
                </span>
              </Row>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
