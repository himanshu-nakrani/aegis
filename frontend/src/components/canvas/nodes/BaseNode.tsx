"use client";

import { memo, type ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Copy, Plus, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeData } from "@/types/workflow";
import { useGlowPulse } from "@/components/motion";
import { categorize, type NodeCategory } from "./category";

export type NodeRuntimeState =
  | "idle"
  | "selected"
  | "running"
  | "completed"
  | "failed"
  | "awaiting_approval";

type ExtendedNodeData = NodeData & {
  isActive?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  runtimeState?: NodeRuntimeState;
  startedAt?: number;
  category?: NodeCategory;
  diffKind?: "added" | "removed" | "changed";
  // Canvas-injected interaction hooks (present on display nodes only).
  onQuickAdd?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

type Props = NodeProps & {
  icon: ReactNode;
  footer?: ReactNode;
};

const BORDER_BY_STATE: Record<NodeRuntimeState, string> = {
  idle: "border-border",
  selected: "border-primary/40",
  running: "border-warning/40",
  completed: "border-success",
  failed: "border-destructive/50",
  awaiting_approval: "border-warning border-dashed",
};

const SHADOW_BY_STATE: Record<NodeRuntimeState, string> = {
  idle: "shadow-elev-1",
  selected: "shadow-glow-primary",
  running: "shadow-glow-warning",
  completed: "shadow-glow-success",
  failed: "shadow-glow-destructive",
  awaiting_approval: "shadow-glow-warning",
};

function CSSVar(name: string): string {
  return `var(--${name})`;
}

function resolveRuntimeState(data: ExtendedNodeData, selected: boolean): NodeRuntimeState {
  if (selected) return "selected";
  if (data.runtimeState) return data.runtimeState;
  if (data.hasError) return "failed";
  if (data.isActive) return "running";
  return "idle";
}

export const BaseNode = memo(function BaseNode({ id, data, selected, icon, footer }: Props) {
  const nodeData = data as unknown as ExtendedNodeData;
  const isNote = nodeData.nodeType === "note";
  // Only true triggers lack a target handle; input_schema receives edges
  // (the starter templates wire trigger -> input_schema).
  const isTrigger = nodeData.nodeType === "trigger";
  const isEnd = nodeData.nodeType === "end";

  const cat: NodeCategory = nodeData.category ?? categorize(nodeData.nodeType);
  const runtimeState = resolveRuntimeState(nodeData, selected);
  const pulse = useGlowPulse(runtimeState === "running" ? "warning" : "primary");
  const animate = runtimeState === "running" ? pulse : "";

  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (runtimeState !== "running") return;
    const startedAt = nodeData.startedAt ?? Date.now();
    const tick = () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runtimeState, nodeData.startedAt]);

  if (isNote) {
    return (
      <div
        className={cn(
          "max-w-[220px] rounded-xl border border-dashed border-border bg-surface-elevated px-4 py-3",
          selected && "ring-1 ring-primary",
          nodeData.diffKind === "added" && "ring-2 ring-success/70",
          nodeData.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
          nodeData.diffKind === "changed" && "ring-2 ring-warning/70"
        )}
      >
        <div className="flex items-start gap-2">
          <StickyNote className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="max-w-full break-words text-sm font-medium text-foreground">{nodeData.label}</p>
            <p className="mt-1 max-w-full break-words text-xs leading-relaxed text-muted">
              {nodeData.noteText || "Add a note…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout="size"
      className={cn(
        // No overflow-hidden: it would clip the connection handles' outer
        // half, shrinking their hit area to a sliver.
        "group relative min-h-[84px] w-[200px] rounded-lg border bg-surface shadow-elev-1",
        "transition-[border-color,box-shadow] duration-fast hover:border-border-strong",
        BORDER_BY_STATE[runtimeState],
        SHADOW_BY_STATE[runtimeState],
        animate,
        nodeData.diffKind === "added" && "ring-2 ring-success/70",
        nodeData.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
        nodeData.diffKind === "changed" && "ring-2 ring-warning/70"
      )}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-lg"
        style={{ background: CSSVar(`cat-${cat}`) }}
        aria-hidden
      />

      {(nodeData.onDuplicate || nodeData.onDelete) && (
        <div
          className={cn(
            "nodrag nopan absolute -top-9 right-0 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface-elevated p-0.5 shadow-elev-2 transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {nodeData.onDuplicate && (
            <button
              type="button"
              title="Duplicate (⌘D)"
              aria-label="Duplicate node"
              onClick={(e) => {
                e.stopPropagation();
                nodeData.onDuplicate?.(id);
              }}
              className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
          {nodeData.onDelete && (
            <button
              type="button"
              title="Delete"
              aria-label="Delete node"
              onClick={(e) => {
                e.stopPropagation();
                nodeData.onDelete?.(id);
              }}
              className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {!isEnd && nodeData.onQuickAdd && (
        <button
          type="button"
          title="Add next node"
          aria-label="Add next node"
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onQuickAdd?.(id);
          }}
          className={cn(
            "nodrag nopan absolute -right-7 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted shadow-elev-1 transition-[opacity,color,border-color]",
            "hover:border-border-strong hover:text-foreground",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!border-2 !bg-surface-elevated !shadow-elev-1"
          style={{ borderColor: CSSVar(`cat-${cat}`) }}
        />
      )}

      <div className="p-3.5 pl-4">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              background: `color-mix(in srgb, ${CSSVar(`cat-${cat}`)} 14%, transparent)`,
              color: CSSVar(`cat-${cat}`),
            }}
          >
            {icon}
          </div>
          <span className="font-mono text-2xs lowercase text-subtle">
            {nodeData.nodeType}
          </span>
        </div>
        <div className="mt-2.5 max-w-full break-words line-clamp-2 text-sm font-medium leading-5 text-foreground">
          {nodeData.label || "Untitled"}
        </div>
        {runtimeState === "running" && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
            <span className="font-mono text-2xs text-warning">{elapsedSec}s</span>
          </div>
        )}
        {footer && <div className="mt-2">{footer}</div>}
        {nodeData.diffKind && (
          <div
            className={cn(
              "mt-2 font-mono text-2xs uppercase tracking-widest",
              nodeData.diffKind === "added" && "text-success",
              nodeData.diffKind === "removed" && "text-destructive",
              nodeData.diffKind === "changed" && "text-warning"
            )}
          >
            {nodeData.diffKind}
          </div>
        )}
      </div>

      <AnimatePresence>
        {runtimeState === "failed" && nodeData.errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="text-caption pointer-events-none absolute -bottom-2 left-2 right-2 translate-y-full rounded-md border border-destructive/40 bg-surface-elevated p-2 shadow-elev-2"
          >
            {nodeData.errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className="!border-2 !bg-surface-elevated !shadow-elev-1"
          style={{ borderColor: CSSVar(`cat-${cat}`) }}
        />
      )}
    </motion.div>
  );
});
