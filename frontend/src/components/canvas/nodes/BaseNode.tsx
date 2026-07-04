"use client";

import { memo, type ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";
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

export const BaseNode = memo(function BaseNode({ data, selected, icon, footer }: Props) {
  const nodeData = data as unknown as ExtendedNodeData;
  const isNote = nodeData.nodeType === "note";
  const isTrigger = nodeData.nodeType === "trigger" || nodeData.nodeType === "input_schema";
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
        "group relative min-h-[92px] w-[248px] overflow-hidden rounded-lg border bg-surface shadow-elev-1 backdrop-blur-md",
        BORDER_BY_STATE[runtimeState],
        SHADOW_BY_STATE[runtimeState],
        animate,
        nodeData.diffKind === "added" && "ring-2 ring-success/70",
        nodeData.diffKind === "removed" && "ring-2 ring-destructive/70 opacity-80",
        nodeData.diffKind === "changed" && "ring-2 ring-warning/70"
      )}
    >
      <span
        className="absolute bottom-0 left-0 top-0 w-1"
        style={{
          background:
            runtimeState === "selected"
              ? `linear-gradient(180deg, ${CSSVar(`cat-${cat}`)}, var(--accent-500))`
              : CSSVar(`cat-${cat}`),
        }}
        aria-hidden
      />

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-border !bg-surface-elevated"
          style={{ borderColor: CSSVar(`cat-${cat}`) }}
        />
      )}

      <div className="p-3.5 pl-4">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border"
            style={{
              background: `color-mix(in srgb, ${CSSVar(`cat-${cat}`)} 12%, transparent)`,
              color: CSSVar(`cat-${cat}`),
            }}
          >
            {icon}
          </div>
          <span className="rounded border border-border bg-surface-input px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ color: CSSVar(`cat-${cat}`) }}>
            {nodeData.nodeType}
          </span>
        </div>
        <div className="mt-2 max-w-full break-words line-clamp-2 text-sm font-semibold leading-5 text-foreground">
          {nodeData.label || "Untitled"}
        </div>
        {runtimeState === "running" && (
          <div className="text-caption mt-2 font-mono">{elapsedSec}s</div>
        )}
        {footer && <div className="mt-2">{footer}</div>}
        {nodeData.diffKind && (
          <div
            className={cn(
              "mt-2 font-mono text-[9px] uppercase tracking-widest",
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
            className="text-caption pointer-events-none absolute -bottom-2 left-2 right-2 translate-y-full rounded-md border border-destructive/40 bg-surface-elevated p-2 shadow-elev-2 backdrop-blur-md"
          >
            {nodeData.errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {!isEnd && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-border !bg-surface-elevated"
          style={{ borderColor: CSSVar(`cat-${cat}`) }}
        />
      )}
    </motion.div>
  );
});
