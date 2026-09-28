import { categorize, CATEGORY_COLOR_VAR } from "@/components/canvas/nodes/category";
import { cn } from "@/lib/utils";

export interface PreviewNode {
  id: string;
  nodeType: string;
  label?: string;
  /** Percent coordinates inside the preview box (0-100 on both axes). */
  x: number;
  y: number;
}

export interface PreviewEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

interface GraphLike {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: { nodeType?: string; label?: string };
  }>;
  edges: Array<{ id?: string; source: string; target: string; label?: string }>;
}

/**
 * Scale a graph's first nodes into percent coordinates for the mini preview.
 * One geometry for every preview surface (template cards, workflows/new), so
 * the dot-and-line language never drifts per caller.
 */
export function previewLayout(graph: GraphLike, maxNodes = 7): PreviewNode[] {
  const nodes = graph.nodes.slice(0, maxNodes);
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);

  return nodes.map((node, index) => {
    const fallbackX = nodes.length <= 1 ? 50 : 14 + (index / (nodes.length - 1)) * 72;
    const x = xRange > 1 ? 12 + ((node.position.x - minX) / xRange) * 76 : fallbackX;
    const y = yRange > 1 ? 18 + ((node.position.y - minY) / yRange) * 58 : 24 + (index % 3) * 22;
    return {
      id: node.id,
      nodeType: node.data.nodeType ?? "unknown",
      label: node.data.label,
      x: Math.min(82, Math.max(8, x)),
      y: Math.min(74, Math.max(12, y)),
    };
  });
}

/** Edges whose endpoints survived the layout, capped for legibility. */
export function previewEdges(
  graph: GraphLike,
  nodes: PreviewNode[],
  limit = 8
): PreviewEdge[] {
  const visible = new Set(nodes.map((node) => node.id));
  return graph.edges
    .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    .slice(0, limit);
}

const SIZE_CLASS = {
  sm: "h-36",
  md: "h-44",
  lg: "min-h-[220px] sm:min-h-[260px]",
} as const;

/**
 * The house mini graph: dot grid, straight mono edges (dashed when routed),
 * category-hued node dots. Chroma lives only in the ≤10px dots — the preview
 * stays chrome-monochrome otherwise (globals.css invariant 1).
 */
export function GraphPreview({
  nodes,
  edges,
  size = "md",
  className,
}: {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-bg",
        SIZE_CLASS[size],
        className
      )}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {edges.map((edge, index) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={edge.id ?? `${edge.source}-${edge.target}-${index}`}
              x1={`${source.x}%`}
              y1={`${source.y}%`}
              x2={`${target.x}%`}
              y2={`${target.y}%`}
              stroke="var(--canvas-edge)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray={edge.label ? "3 4" : undefined}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0">
        {nodes.map((node, index) => {
          const catColor = CATEGORY_COLOR_VAR[categorize(node.nodeType)];
          const at = { left: `${node.x}%`, top: `${node.y}%`, zIndex: 10 + index };
          /* The lg preview is a reading surface: name each step. sm/md stay
             dots — card-sized boxes would collide at thumbnail scale. */
          return size === "lg" ? (
            <div
              key={node.id}
              className="absolute w-[104px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-surface px-2 py-2 shadow-elev-1 sm:w-[124px] sm:px-3"
              style={at}
            >
              <span
                className="absolute inset-y-0 left-0 w-0.5"
                style={{ background: catColor }}
                aria-hidden
              />
              <p className="truncate text-xs font-medium text-foreground">
                {node.label || node.nodeType}
              </p>
              <p className="truncate font-mono text-2xs lowercase text-subtle">
                {node.nodeType}
              </p>
            </div>
          ) : (
            <span
              key={node.id}
              title={node.label || node.nodeType}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border shadow-elev-1"
              style={{ ...at, background: catColor }}
            />
          );
        })}
      </div>
    </div>
  );
}
