"use client";

import { useId, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { categorize, CATEGORY_COLOR_VAR } from "../nodes/category";
import { cn } from "@/lib/utils";

type EdgeData = {
  active?: boolean;
  failed?: boolean;
  route?: string;
  sourceNodeType?: string;
  targetNodeType?: string;
};

export function GradientEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  selected,
  interactionWidth,
}: EdgeProps) {
  const rawId = useId();
  const markerId = `${rawId}-arrow`;
  const drawId = `${rawId}-draw`;
  const [hovered, setHovered] = useState(false);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as EdgeData | undefined;
  const sCat = edgeData?.sourceNodeType ? categorize(edgeData.sourceNodeType) : "flow";
  const sColor = CATEGORY_COLOR_VAR[sCat];

  const active = !!edgeData?.active;
  const failed = !!edgeData?.failed;
  const emphasized = selected || active || hovered;

  // Quiet gray at rest; the source category color appears when the edge is
  // selected, hovered, or carrying a live run. Failed always reads red.
  const stroke = failed
    ? "var(--canvas-edge-failed)"
    : selected || active
      ? sColor
      : hovered
        ? "var(--canvas-edge-active)"
        : "var(--canvas-edge)";

  // Edge label comes from the branch route (IF/Switch/Router/Classifier).
  // WorkflowCanvas sets edge.label = route (see makeEdge/graphToEdges) and
  // mirrors it onto data.route; prefer the explicit label prop.
  const rawLabel =
    (typeof label === "string" ? label : undefined) ?? edgeData?.route ?? "";
  const labelText = rawLabel.trim();

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 z" fill={stroke} />
        </marker>
      </defs>

      {/* One-shot draw-in on mount; disabled under reduced motion. */}
      <style>{`
        @keyframes ${drawId} {
          from { stroke-dashoffset: var(--edge-draw-len); }
          to { stroke-dashoffset: 0; }
        }
        .edge-draw-${rawId.replace(/[:]/g, "")} {
          stroke-dasharray: var(--edge-draw-len);
          animation: ${drawId} 0.25s var(--ease-out, ease-out) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .edge-draw-${rawId.replace(/[:]/g, "")} {
            stroke-dasharray: none;
            animation: none;
          }
        }
      `}</style>

      {/* Wide invisible hit path — generous hover/selection affordance. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={interactionWidth ?? 20}
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        className={`edge-draw-${rawId.replace(/[:]/g, "")}`}
        style={{
          // Draw length ≥ any realistic bezier so the dashoffset trick fully
          // conceals then reveals the path on mount.
          ["--edge-draw-len" as string]: "2000",
          stroke,
          strokeWidth: emphasized ? 2.25 : 1.75,
          strokeOpacity: failed || emphasized ? 1 : 0.85,
          strokeLinecap: "round",
          // Dash on failed edges to distinguish beyond color alone.
          strokeDasharray: failed ? "6 4" : undefined,
          fill: "none",
          transition:
            "stroke 0.18s var(--ease-out), stroke-width 0.18s var(--ease-out), stroke-opacity 0.18s var(--ease-out)",
        }}
      />

      {active && !failed && (
        <BaseEdge
          id={`${id}-flow`}
          path={path}
          className="animate-edge-flow"
          style={{
            stroke: "var(--canvas-edge-active)",
            strokeWidth: 2,
            strokeDasharray: "1 11",
            strokeLinecap: "round",
            fill: "none",
          }}
        />
      )}

      {labelText && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-2xs lowercase transition-colors",
              emphasized ? "text-foreground" : "text-muted"
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
