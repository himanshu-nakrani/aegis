"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { Input } from "@/components/ui/input";
import { StaggerList } from "@/components/motion";
import {
  categorize,
  CATEGORY_COLOR_VAR,
  CATEGORY_LABEL,
  type NodeCategory,
} from "@/components/canvas/nodes/category";
import { EXPRESSION_HINT, NODE_REGISTRY } from "@/lib/node-registry";
import { cn } from "@/lib/utils";

export const DRAG_TYPE = "application/aegis-node";

const ALL_CATS: NodeCategory[] = [
  "trigger",
  "logic",
  "llm",
  "data",
  "integration",
  "quality",
  "flow",
];

const pillClasses =
  "shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover";
const pillActive = "border-border-strong bg-surface-hover text-foreground";

interface NodePaletteProps {
  onAddNode: (data: NodeData) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<NodeCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = NODE_REGISTRY;
    if (activeCat !== "all") {
      list = list.filter((def) => categorize(def.type) === activeCat);
    }
    if (!q) return list;
    return list.filter(
      (def) =>
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        def.category.toLowerCase().includes(q)
    );
  }, [query, activeCat]);

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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex gap-2 overflow-x-auto border-b border-border px-1 py-3">
        <button
          type="button"
          onClick={() => setActiveCat("all")}
          className={cn(pillClasses, activeCat === "all" && pillActive)}
        >
          All
        </button>
        {ALL_CATS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCat(c)}
            className={cn(pillClasses, activeCat === c && pillActive)}
            style={
              activeCat === c
                ? {
                    background: `color-mix(in srgb, ${CATEGORY_COLOR_VAR[c]} 14%, transparent)`,
                    color: CATEGORY_COLOR_VAR[c],
                    borderColor: CATEGORY_COLOR_VAR[c],
                  }
                : undefined
            }
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <StaggerList key={activeCat} className="space-y-1.5">
        {filtered.map((item) => {
          const cat = categorize(item.type);
          const catColor = CATEGORY_COLOR_VAR[cat];
          return (
            <button
              key={`${item.type}-${item.label}`}
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, item.defaultData)}
              onClick={() => onAddNode(item.defaultData)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5",
                "text-left transition hover:bg-surface-hover"
              )}
            >
              <div
                className="rounded-md p-1.5"
                style={{
                  background: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                  color: catColor,
                }}
              >
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="truncate text-[11px] text-muted">{item.description}</p>
              </div>
            </button>
          );
        })}
      </StaggerList>

      {filtered.length === 0 && (
        <p className="text-center text-xs text-muted">No nodes match &ldquo;{query}&rdquo;</p>
      )}

      <p className="rounded-lg border border-dashed border-border bg-surface px-2.5 py-2 text-[10px] leading-relaxed text-muted">
        {EXPRESSION_HINT}
      </p>
    </div>
  );
}