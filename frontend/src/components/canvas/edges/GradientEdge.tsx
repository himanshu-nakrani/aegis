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
  const gradId = useId();
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
  const tCat = edgeData?.targetNodeType ? categorize(edgeData.targetNodeType) : "flow";
  const sColor = CATEGORY_COLOR_VAR[sCat];
  const tColor = CATEGORY_COLOR_VAR[tCat];

  const active = !!edgeData?.active;
  const failed = !!edgeData?.failed;

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={sColor} />
          <stop offset="100%" stopColor={tColor} />
        </linearGradient>
      </defs>

      {selected && (
        <BaseEdge
          id={`${id}-bloom`}
          path={path}
          style={{ stroke: sColor, strokeWidth: 6, opacity: 0.18, filter: "blur(4px)" }}
        />
      )}

      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: failed ? "var(--canvas-edge-failed)" : `url(#${gradId})`,
          strokeWidth: 1.5,
          opacity: active ? 1 : 0.55,
          strokeLinecap: "round",
          fill: "none",
        }}
      />

      {active && !failed && (
        <BaseEdge
          id={`${id}-flow`}
          path={path}
          className="animate-edge-flow"
          style={{
            stroke: `url(#${gradId})`,
            strokeWidth: 1.5,
            strokeDasharray: "4 4",
            fill: "none",
          }}
        />
      )}
    </>
  );
}