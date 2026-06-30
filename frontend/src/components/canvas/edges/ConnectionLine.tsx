"use client";

import { type ConnectionLineComponentProps } from "@xyflow/react";

export function ConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const id = "conn-preview";
  return (
    <g>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={fromX} y1={fromY} x2={toX} y2={toY}>
          <stop offset="0%" stopColor="var(--primary-500)" />
          <stop offset="100%" stopColor="var(--accent-500)" />
        </linearGradient>
      </defs>
      <path
        d={`M ${fromX} ${fromY} C ${fromX + 50} ${fromY}, ${toX - 50} ${toY}, ${toX} ${toY}`}
        stroke={`url(#${id})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        style={{ filter: "drop-shadow(0 0 8px rgba(99,102,241,0.6))" }}
      />
    </g>
  );
}