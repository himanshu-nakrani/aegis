"use client";

import { Badge } from "@/components/ui/badge";

export interface GuardrailEvent {
  node_id: string;
  node_label?: string;
  status: string;
  message?: string;
  mode?: string;
  fail_behavior?: string;
}

function guardrailVariant(status: string) {
  if (status === "passed") return "success" as const;
  if (status === "warned") return "warning" as const;
  if (status === "failed") return "destructive" as const;
  return "outline" as const;
}

interface GuardrailEventsPanelProps {
  events: GuardrailEvent[];
  failedNodeIds?: string[];
  compact?: boolean;
}

export function GuardrailEventsPanel({
  events,
  failedNodeIds = [],
  compact = false,
}: GuardrailEventsPanelProps) {
  const items: GuardrailEvent[] =
    events.length > 0
      ? events
      : failedNodeIds.map((nodeId) => ({
          node_id: nodeId,
          node_label: nodeId,
          status: "failed",
          message: "Guardrail check failed",
        }));

  if (items.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((event) => (
        <div
          key={`${event.node_id}-${event.status}`}
          className="rounded-lg border border-border bg-surface px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {event.node_label || event.node_id}
            </span>
            <Badge variant={guardrailVariant(event.status)}>{event.status}</Badge>
            {event.mode && (
              <span className="text-xs text-muted">{event.mode} mode</span>
            )}
          </div>
          {event.message && (
            <p className="mt-1 text-xs text-muted">{event.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}