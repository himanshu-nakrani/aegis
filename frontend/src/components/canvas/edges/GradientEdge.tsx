"use client";

import { useId } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { categorize, CATEGORY_COLOR_VAR } from "../nodes/category";

type EdgeData = {
  active?: boolean;
  failed?: boolean;
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
  selected,
}: EdgeProps) {
  const markerId = `${useId()}-arrow`;
  const [path] = getBezierPath({
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

  // Quiet gray at rest; the source category color only appears when the
  // edge is selected or carrying a live run.
  const stroke = failed
    ? "var(--canvas-edge-failed)"
    : selected || active
      ? sColor
      : "var(--canvas-edge)";

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

      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke,
          strokeWidth: selected || active ? 1.75 : 1.25,
          strokeLinecap: "round",
          fill: "none",
          transition: "stroke 0.2s var(--ease-out), stroke-width 0.2s var(--ease-out)",
        }}
      />

      {active && !failed && (
        <BaseEdge
          id={`${id}-flow`}
          path={path}
          className="animate-edge-flow"
          style={{
            stroke: "var(--fg)",
            strokeWidth: 1.75,
            strokeDasharray: "1 9",
            strokeLinecap: "round",
            fill: "none",
          }}
        />
      )}
    </>
  );
}
