"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { NodeData } from "@/types/workflow";

/**
 * Grouping frame (v1, no collapse). Renders BEHIND its member nodes as a
 * labeled hairline frame — a very-low-alpha surface tint, a small mono label
 * top-left, rounded-lg. Members carry `parentId` pointing at this node, so
 * React Flow moves them when the frame is dragged.
 *
 * This is its OWN node component (registered as the "group" type) rather than a
 * branch inside BaseNode: a frame has no run state, no handles, and no telemetry
 * chrome. The frame fills the node box (sized via node.style width/height, kept
 * in data.groupWidth/groupHeight so it round-trips through the graph save).
 *
 * Rename reuses the canvas-injected rename hooks (isRenaming / onRenameCommit /
 * onRenameCancel) that displayNodes layers onto every node's data, driven by the
 * shared onNodeDoubleClick → renamingNodeId flow.
 */
type FrameData = NodeData & {
  isRenaming?: boolean;
  onRenameCommit?: (id: string, label: string) => void;
  onRenameCancel?: () => void;
  diffKind?: "added" | "removed" | "changed";
};

export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps) {
  const frame = data as FrameData;

  return (
    <div
      className={cn(
        "relative h-full w-full rounded-lg border border-border/80 bg-surface/[0.03] transition-[border-color] duration-fast",
        "hover:border-border-strong",
        selected && "border-primary/50 ring-1 ring-primary/40",
        frame.diffKind === "added" && "ring-2 ring-success/70",
        frame.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
        frame.diffKind === "changed" && "ring-2 ring-warning/70"
      )}
    >
      <div className="pointer-events-none absolute left-2 top-1.5 max-w-[calc(100%-1rem)]">
        {frame.isRenaming ? (
          <input
            autoFocus
            defaultValue={frame.label ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                const next = e.currentTarget.value.trim();
                if (next) frame.onRenameCommit?.(id, next);
                else frame.onRenameCancel?.();
              } else if (e.key === "Escape") {
                e.preventDefault();
                frame.onRenameCancel?.();
              }
            }}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next) frame.onRenameCommit?.(id, next);
              else frame.onRenameCancel?.();
            }}
            className="nodrag pointer-events-auto w-40 border-b border-primary/40 bg-transparent font-mono text-2xs uppercase tracking-wide text-muted focus:outline-none"
          />
        ) : (
          <span className="font-mono text-2xs uppercase tracking-wide text-subtle">
            {frame.label || "Group"}
          </span>
        )}
      </div>
    </div>
  );
});
