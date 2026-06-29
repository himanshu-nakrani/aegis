"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { Input } from "@/components/ui/input";
import {
  EXPRESSION_HINT,
  NODE_CATEGORIES,
  NODE_REGISTRY,
} from "@/lib/node-registry";
import { cn } from "@/lib/utils";

export const DRAG_TYPE = "application/aegis-node";

interface NodePaletteProps {
  onAddNode: (data: NodeData) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NODE_REGISTRY;
    return NODE_REGISTRY.filter(
      (def) =>
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        def.category.toLowerCase().includes(q)
    );
  }, [query]);

  const onDragStart = (event: React.DragEvent, data: NodeData) => {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted">
          Build agentic pipelines: Trigger → steps → End. Drag or click to add.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {NODE_CATEGORIES.map((group) => {
        const items = filtered.filter((item) => item.category === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {items.map((item) => (
                <button
                  key={`${item.type}-${item.label}`}
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(e, item.defaultData)}
                  onClick={() => onAddNode(item.defaultData)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2.5",
                    "text-left transition hover:border-accent hover:bg-surface-hover"
                  )}
                >
                  <div className={cn("rounded-md p-1.5", item.accent.icon)}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="truncate text-[11px] text-muted">{item.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <p className="text-center text-xs text-muted">No nodes match &ldquo;{query}&rdquo;</p>
      )}

      <p className="rounded-lg border border-dashed border-border bg-surface px-2.5 py-2 text-[10px] leading-relaxed text-muted">
        {EXPRESSION_HINT}
      </p>
    </div>
  );
}