"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, GripVertical, PackageSearch, Plus, Search, X } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaggerList } from "@/components/motion";
import {
  categorize,
  CATEGORY_COLOR_VAR,
  CATEGORY_LABEL,
} from "@/components/canvas/nodes/category";
import {
  EXPRESSION_HINT,
  NODE_CATEGORIES,
  NODE_REGISTRY,
  type NodeDefinition,
} from "@/lib/node-registry";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const DRAG_TYPE = "application/aegis-node";

const CORE_NODE_TYPES = ["trigger", "agent", "end"] as const;
const CORE_ITEMS = CORE_NODE_TYPES.flatMap((type) => {
  const item = NODE_REGISTRY.find((definition) => definition.type === type);
  return item ? [item] : [];
});
const CATEGORY_SECTIONS = NODE_CATEGORIES.map((category) => ({
  ...category,
  items: NODE_REGISTRY.filter((definition) => definition.category === category.id),
}));

type LibraryCategory = (typeof NODE_CATEGORIES)[number]["id"];
type NodeDragStart = (event: React.DragEvent<HTMLButtonElement>, data: NodeData) => void;

interface NodePaletteProps {
  onAddNode: (data: NodeData) => void;
}

function NodeRow({
  item,
  onAddNode,
  onDragStart,
}: {
  item: NodeDefinition;
  onAddNode: NodePaletteProps["onAddNode"];
  onDragStart: NodeDragStart;
}) {
  const categoryColor = CATEGORY_COLOR_VAR[categorize(item.type)];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, item.defaultData)}
          onClick={() => onAddNode(item.defaultData)}
          aria-label={"Add " + item.label}
          className={cn(
            "focus-ring group relative flex min-h-9 w-full cursor-grab items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-foreground active:cursor-grabbing",
            "transition-colors duration-1 hover:bg-surface-hover focus-visible:bg-surface-hover"
          )}
        >
          <span
            className="absolute inset-y-1 left-0 w-0.5 rounded-full opacity-75 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ background: categoryColor }}
            aria-hidden
          />
          <GripVertical
            className="size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
            aria-hidden
          />
          <item.icon className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
          <Plus
            className="size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-[240px] items-start">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{item.label}</p>
          <p className="text-xs font-normal leading-5 text-muted">{item.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const searchHintId = useId();
  const sectionId = useId();
  const searchRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<LibraryCategory>>(
    () => new Set()
  );

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const filtered = useMemo(() => {
    if (!normalizedQuery) return NODE_REGISTRY;
    return NODE_REGISTRY.filter((definition) => {
      const categoryName =
        NODE_CATEGORIES.find((category) => category.id === definition.category)?.label ??
        definition.category;
      const searchable = [
        definition.label,
        definition.type,
        definition.type.replace(/_/g, " "),
        definition.description,
        definition.category,
        categoryName,
        CATEGORY_LABEL[categorize(definition.type)],
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedQuery]);
  const searchSections = useMemo(
    () =>
      NODE_CATEGORIES.map((category) => ({
        ...category,
        items: filtered.filter((definition) => definition.category === category.id),
      })).filter((category) => category.items.length > 0),
    [filtered]
  );

  const onDragStart: NodeDragStart = (event, data) => {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";

    if (typeof document !== "undefined") {
      const catColor = CATEGORY_COLOR_VAR[categorize(data.nodeType)];
      const ghost = document.createElement("div");
      ghost.className =
        "pointer-events-none relative flex items-center overflow-hidden rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-elev-2";
      ghost.style.position = "fixed";
      ghost.style.top = "-1000px";
      ghost.style.left = "-1000px";
      ghost.style.width = "var(--node-w)";

      const strip = document.createElement("span");
      strip.style.position = "absolute";
      strip.style.insetBlock = "0";
      strip.style.left = "0";
      strip.style.width = "2px";
      strip.style.background = "color-mix(in srgb, " + catColor + " 72%, var(--border-strong))";
      ghost.appendChild(strip);

      const label = document.createElement("span");
      label.className = "truncate pl-2 font-medium";
      label.textContent = data.label;
      ghost.appendChild(label);

      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 24, 24);
      setTimeout(() => {
        ghost.remove();
      }, 0);
    }
  };

  const toggleCategory = (category: LibraryCategory) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const coreHeadingId = sectionId + "-core-heading";

  return (
    <div className="space-y-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Node library</h3>
        <span className="font-mono text-2xs uppercase tracking-wide text-subtle">
          {NODE_REGISTRY.length} types
        </span>
      </div>

      <div className="space-y-1.5">
        <div ref={searchRef} className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            aria-describedby={searchHintId}
            autoComplete="off"
            spellCheck={false}
            className="pl-9 pr-9"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Clear node search"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => {
                setQuery("");
                searchRef.current?.querySelector("input")?.focus();
              }}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
        <p id={searchHintId} className="text-2xs leading-4 text-muted">
          Search by name, type, or description. Click to add · drag to canvas.
        </p>
      </div>

      {hasQuery ? (
        <div className="space-y-3">
          <div
            role="status"
            className="flex items-center justify-between px-2 text-2xs text-muted"
          >
            <h4 className="font-semibold text-foreground">Search results</h4>
            <span className="font-mono tabular-nums">
              {filtered.length} {filtered.length === 1 ? "match" : "matches"}
            </span>
          </div>
          {filtered.length > 0 ? (
            <div className="space-y-3">
              {searchSections.map((category) => (
                <section
                  key={category.id}
                  aria-labelledby={sectionId + "-" + category.id + "-results"}
                >
                  <div className="mb-1 flex items-center justify-between px-2">
                    <h5
                      id={sectionId + "-" + category.id + "-results"}
                      className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted"
                    >
                      {category.label}
                    </h5>
                    <span className="font-mono text-2xs tabular-nums text-subtle">
                      {category.items.length}
                    </span>
                  </div>
                  <StaggerList className="space-y-px" max={5}>
                    {category.items.map((item) => (
                      <NodeRow
                        key={item.type + "-" + item.label}
                        item={item}
                        onAddNode={onAddNode}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </StaggerList>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={PackageSearch}
              title="No nodes found"
              description="Try a name, type, or phrase from a node description."
            />
          )}
        </div>
      ) : (
        <>
          <section aria-labelledby={coreHeadingId} className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <h4
                id={coreHeadingId}
                className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted"
              >
                Core building blocks
              </h4>
              <span className="font-mono text-2xs tabular-nums text-subtle">
                {CORE_ITEMS.length}
              </span>
            </div>
            <StaggerList className="space-y-px" max={3}>
              {CORE_ITEMS.map((item) => (
                <NodeRow
                  key={"core-" + item.type}
                  item={item}
                  onAddNode={onAddNode}
                  onDragStart={onDragStart}
                />
              ))}
            </StaggerList>
          </section>

          <div className="divide-y divide-border/70 border-y border-border/70">
            {CATEGORY_SECTIONS.map((category) => {
              const expanded = expandedCategories.has(category.id);
              const headingId = sectionId + "-" + category.id + "-heading";
              const contentId = sectionId + "-" + category.id + "-content";
              return (
                <section key={category.id}>
                  <h4>
                    <button
                      type="button"
                      id={headingId}
                      aria-expanded={expanded}
                      aria-controls={contentId}
                      onClick={() => toggleCategory(category.id)}
                      className="focus-ring flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-surface-hover"
                    >
                      <ChevronDown
                        className={cn(
                          "size-3.5 shrink-0 text-subtle transition-transform",
                          expanded && "rotate-180"
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {category.label}
                      </span>
                      <span className="font-mono text-2xs tabular-nums text-subtle">
                        {category.items.length}
                      </span>
                    </button>
                  </h4>
                  <div
                    id={contentId}
                    aria-labelledby={headingId}
                    hidden={!expanded}
                    className="pb-1 pt-0.5"
                  >
                    {expanded && (
                      <StaggerList className="space-y-px" max={5}>
                        {category.items.map((item) => (
                          <NodeRow
                            key={item.type + "-" + item.label}
                            item={item}
                            onAddNode={onAddNode}
                            onDragStart={onDragStart}
                          />
                        ))}
                      </StaggerList>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      <p className="border-t border-border pt-3 text-caption leading-relaxed text-muted">
        {EXPRESSION_HINT}
      </p>
    </div>
  );
}
