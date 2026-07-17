"use client";

import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { TraceNodeRow } from "@/components/runs/TraceNodeRow";
import type { LlmCall, NodeResult } from "@/types/workflow";

interface TraceTimelineProps {
  nodes: NodeResult[];
  llmCalls: LlmCall[];
  /** True while the run is still live (pending/running/awaiting_approval). */
  runLive: boolean;
  /** True when no results yet but the run is still producing them. */
  awaitingResults: boolean;
}

export function TraceTimeline({
  nodes,
  llmCalls,
  runLive,
  awaitingResults,
}: TraceTimelineProps) {
  const totalLatency = nodes.reduce(
    (sum, node) => sum + (node.latency_ms ?? 0),
    0
  );

  return (
    <SectionCard
      title="Node timeline"
      description="bar = share of run time"
      actions={<Badge variant="outline">{nodes.length} results</Badge>}
    >
      {awaitingResults && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-surface-input px-3 py-2.5 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          Waiting for node results…
        </div>
      )}
      {nodes.length === 0 && !awaitingResults ? (
        <p className="text-sm text-subtle">No node results recorded for this run.</p>
      ) : (
        <ol className="relative">
          {nodes.map((node, index) => (
            <TraceNodeRow
              key={node.id}
              node={node}
              llmCalls={llmCalls}
              durationShare={
                totalLatency > 0 ? (node.latency_ms ?? 0) / totalLatency : 0
              }
              isLast={index === nodes.length - 1}
              runLive={runLive}
            />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
