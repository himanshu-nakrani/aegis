"use client";

import { useId, useEffect, useState } from "react";
import { useReducedMotionStrict } from "@/components/motion";

type Props = {
  data: number[];
  color?: string;
  height?: number;
  /** Animates the stroke drawing on first mount. Defaults to true. */
  drawOnMount?: boolean;
};

/**
 * Compact area sparkline. Renders inline (no width attribute — fills container).
 * Width-based aspect via SVG viewBox; the polyline scales fluidly.
 */
export function Sparkline({
  data,
  color = "var(--primary)",
  height = 24,
  drawOnMount = true,
}: Props) {
  const id = useId();
  const reduce = useReducedMotionStrict();
  const [drawn, setDrawn] = useState(!drawOnMount || reduce);

  useEffect(() => {
    if (!drawOnMount || reduce) return;
    const t = setTimeout(() => setDrawn(true), 16);
    return () => clearTimeout(t);
  }, [drawOnMount, reduce]);

  if (!data || data.length < 2) {
    return <div className="h-6 text-xs text-muted">No trend data</div>;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = height;
  const stepX = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const polyline = points.join(" ");
  const area = `0,${h} ${polyline} ${w},${h}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-fill-${id})`} />
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{
          strokeDasharray: drawn ? "none" : "1000",
          strokeDashoffset: drawn ? 0 : 1000,
          transition: "stroke-dashoffset 600ms var(--ease-out)",
        }}
      />
    </svg>
  );
}