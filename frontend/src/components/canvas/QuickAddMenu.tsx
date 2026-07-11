"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NODE_REGISTRY, type NodeDefinition } from "@/lib/node-registry";
import { categorize, CATEGORY_COLOR_VAR, CATEGORY_LABEL } from "@/components/canvas/nodes/category";
import type { NodeData } from "@/types/workflow";

interface QuickAddMenuProps {
  /** Screen (client) coordinates to anchor the menu at. */
  position: { x: number; y: number };
  /** When adding the first node, surface triggers at the top. */
  preferTriggers?: boolean;
  onSelect: (data: NodeData) => void;
  onClose: () => void;
}

const MENU_W = 288;
const MENU_H = 380;

/**
 * n8n-style node picker: opened from a node's "+" button, by dropping a
 * connection on empty canvas, or from the empty-state CTA. Selecting an item
 * places the node and (when opened from a source) auto-connects it.
 */
export function QuickAddMenu({ position, preferTriggers = false, onSelect, onClose }: QuickAddMenuProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = NODE_REGISTRY;
    if (q) {
      list = list.filter(
        (def) =>
          def.label.toLowerCase().includes(q) ||
          def.description.toLowerCase().includes(q) ||
          def.type.toLowerCase().includes(q)
      );
    }
    if (preferTriggers) {
      list = [...list].sort((a, b) => {
        const at = categorize(a.type) === "trigger" ? 0 : 1;
        const bt = categorize(b.type) === "trigger" ? 0 : 1;
        return at - bt;
      });
    }
    return list;
  }, [query, preferTriggers]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  const clampedX = Math.max(8, Math.min(position.x, window.innerWidth - MENU_W - 8));
  const clampedY = Math.max(8, Math.min(position.y, window.innerHeight - MENU_H - 8));

  const pick = (def: NodeDefinition) => onSelect(def.defaultData);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? Math.min(highlight + 1, items.length - 1)
          : Math.max(highlight - 1, 0);
      setHighlight(next);
      listRef.current
        ?.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" && items[highlight]) {
      e.preventDefault();
      pick(items[highlight]);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex w-72 flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-elev-3"
      style={{ left: clampedX, top: clampedY, maxHeight: MENU_H }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label="Add node"
    >
      <div className="relative border-b border-border p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={preferTriggers ? "Search for a trigger…" : "Search nodes…"}
          className="h-8 border-0 bg-transparent pl-7 text-xs shadow-none focus-visible:ring-0"
          aria-label="Search nodes"
        />
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-1">
        {items.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted">No matching nodes.</p>
        )}
        {items.map((def, index) => {
          const cat = categorize(def.type);
          const catColor = CATEGORY_COLOR_VAR[cat];
          return (
            <button
              key={`${def.type}-${def.label}`}
              type="button"
              data-index={index}
              onClick={() => pick(def)}
              onMouseEnter={() => setHighlight(index)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                index === highlight ? "bg-surface-hover" : ""
              }`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                style={{
                  background: `color-mix(in srgb, ${catColor} 14%, transparent)`,
                  color: catColor,
                }}
              >
                <def.icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {def.label}
                </span>
                <span className="block truncate text-xs text-muted">{def.description}</span>
              </span>
              <span className="shrink-0 font-mono text-2xs lowercase text-subtle">
                {CATEGORY_LABEL[cat]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
