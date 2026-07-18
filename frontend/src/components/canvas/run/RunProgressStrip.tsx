"use client";

import { useEffect, useState } from "react";
import { Square } from "lucide-react";

interface RunProgressStripProps {
  completed: number;
  total: number;
  activeLabel?: string | null;
  startedAt: number;
  onStop: () => void;
}

function useElapsedSeconds(startedAt: number): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  );
  useEffect(() => {
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

/**
 * Slim run-progress pill. Rendered by the integrator inside a React Flow
 * <Panel position="top-center">.
 */
export function RunProgressStrip({
  completed,
  total,
  activeLabel,
  startedAt,
  onStop,
}: RunProgressStripProps) {
  const elapsed = useElapsedSeconds(startedAt);
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-full glass-panel px-4 py-1.5 shadow-elev-2">
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning"
        aria-hidden="true"
      />
      <span className="shrink-0 font-mono text-xs text-foreground">
        {completed}/{total} nodes
      </span>
      {activeLabel && (
        <span className="min-w-0 max-w-[16rem] truncate text-xs text-muted">
          {activeLabel}
        </span>
      )}
      <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
        {elapsed}s
      </span>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop run"
        className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Square className="h-3 w-3" />
      </button>
      <span
        className="absolute inset-x-0 bottom-0 h-0.5 bg-warning transition-[width] duration-3"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
