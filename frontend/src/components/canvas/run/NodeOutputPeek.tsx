"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NodeOutputPeekProps {
  position: { x: number; y: number };
  nodeLabel: string;
  output: string;
  latencyMs?: number | null;
  guardrailStatus?: string | null;
  runId: string | null;
  onClose: () => void;
}

const PEEK_W = 320;
const PEEK_H = 260;
const MAX_CHARS = 600;

function guardrailVariant(status: string): "success" | "warning" | "destructive" | "default" {
  const s = status.toLowerCase();
  if (s.includes("pass") || s.includes("ok") || s.includes("clean")) return "success";
  if (s.includes("block") || s.includes("fail")) return "destructive";
  if (s.includes("warn") || s.includes("mask")) return "warning";
  return "default";
}

/**
 * Floating output preview for a completed node — follows the QuickAddMenu
 * house pattern: fixed, clamped to viewport, closes on outside-mousedown or
 * Escape.
 */
export function NodeOutputPeek({
  position,
  nodeLabel,
  output,
  latencyMs,
  guardrailStatus,
  runId,
  onClose,
}: NodeOutputPeekProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const clampedX = Math.max(8, Math.min(position.x, window.innerWidth - PEEK_W - 8));
  const clampedY = Math.max(8, Math.min(position.y, window.innerHeight - PEEK_H - 8));

  const truncated =
    output.length > MAX_CHARS ? `${output.slice(0, MAX_CHARS)}…` : output;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-elev-3"
      style={{ left: clampedX, top: clampedY }}
      role="dialog"
      aria-label={`Output for ${nodeLabel}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {nodeLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto px-3 py-2.5">
        {truncated.trim() ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
            {truncated}
          </pre>
        ) : (
          <p className="font-mono text-xs text-muted">No output.</p>
        )}
      </div>

      {(latencyMs != null || guardrailStatus || runId) && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          {latencyMs != null && (
            <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-2xs text-muted">
              {Math.round(latencyMs)}ms
            </span>
          )}
          {guardrailStatus && (
            <Badge variant={guardrailVariant(guardrailStatus)} className="min-h-0 py-0.5 text-2xs">
              {guardrailStatus}
            </Badge>
          )}
          {runId && (
            <Link
              href={`/runs/${runId}`}
              className="focus-ring ml-auto rounded text-xs font-medium text-primary hover:underline"
            >
              Open run →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
